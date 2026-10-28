import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it } from "vitest";

// Real SQL/RLS in an isolated WASM PostgreSQL. Auth is a minimal test fixture;
// Supabase Auth, PostgREST and deployment connectivity require a separate live check.
let db: PGlite;
const user = "10000000-0000-0000-0000-000000000001", other = "10000000-0000-0000-0000-000000000002";
const portfolio = "20000000-0000-0000-0000-000000000001", secondPortfolio = "20000000-0000-0000-0000-000000000002";
const position = "30000000-0000-0000-0000-000000000001", request = "40000000-0000-0000-0000-000000000001";
const qty = async () => (await db.query<{sold_quantity:string;status:string}>("select sold_quantity,status from public.positions where id=$1",[position])).rows[0];
async function seed() {
  await db.query("insert into public.positions(id,portfolio_id,user_id,ticker,quantity,entry_price,entry_date,instrument_currency,entry_margin_base,entry_margin_source,margin_rate,stop_price,stop_price_native,stop_updated_at) values($1,$2,$3,'TEST',10,100,'2026-01-01','USD',150,'manual_reference',0.15,90,90,'2026-01-01')",[position,portfolio,user]);
}
async function record(quantity=2,price=110,key=request,fx:number|null=0.9) {
  return (await db.query<{id:string}>("select public.record_position_sale($1,$2,$3,'2026-10-14',$4,'test',$5) as id",[position,quantity,price,fx,key])).rows[0].id;
}
async function rejected(sql: string, args: unknown[] = []) {
  await db.exec("savepoint rejected_action");
  try { await expect(db.query(sql,args)).rejects.toBeTruthy(); }
  finally { await db.exec("rollback to savepoint rejected_action"); }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema extensions;
    create table auth.users(id uuid primary key,email text,created_at timestamptz default now(),last_sign_in_at timestamptz,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
    grant usage on schema auth to anon,authenticated,service_role; grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;`);
  for (const f of readdirSync("supabase/migrations").filter(f=>f.endsWith(".sql")).sort()) await db.exec(readFileSync(`supabase/migrations/${f}`,"utf8"));
  await db.exec(`update public.app_runtime_settings set registration_mode='open'; insert into auth.users(id,email) values('${user}','synthetic-a@example.invalid'),('${other}','synthetic-b@example.invalid');
    insert into public.portfolios(id,user_id,name,currency) values('${portfolio}','${user}','Test','EUR'),('${secondPortfolio}','${other}','Other','EUR');`);
},60000);
beforeEach(async () => { await db.exec(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${user}',true);`); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db?.close(); });

describe("journal SQL guarantees", () => {
  it("permits reversible example classification only in direct maintenance, without executions", async () => {
    await seed();
    await rejected("update positions set source_type='demo' where id=$1", [position]);
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',true)");
    const before = (await db.query("select quantity,entry_price,entry_margin_base from positions where id=$1", [position])).rows[0];
    await db.query("update positions set source_type='demo' where id=$1", [position]);
    expect((await db.query<{source_type:string}>("select source_type from positions where id=$1", [position])).rows[0].source_type).toBe("demo");
    await db.query("update positions set source_type='manual' where id=$1", [position]);
    expect((await db.query("select quantity,entry_price,entry_margin_base from positions where id=$1", [position])).rows[0]).toEqual(before);
    await rejected("update positions set source_type='broker' where id=$1", [position]);
    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub','${user}',true)`);
    await record();
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',true)");
    await rejected("update positions set source_type='demo' where id=$1", [position]);
  });
  it("leases FX refreshes once per pair and respects backoff and ownership", async () => {
    const run = () => db.query<{token:string|null}>("select public.claim_portfolio_fx_refresh($1,'USD','EUR') as token",[portfolio]);
    const token = (await run()).rows[0].token; expect(token).toBeTruthy(); expect((await run()).rows[0].token).toBeNull();
    await db.query("select public.finish_portfolio_fx_refresh($1,3600)",[token]); expect((await run()).rows[0].token).toBeNull();
    expect((await db.query<{token:null}>("select public.claim_portfolio_fx_refresh($1,'USD','EUR') as token",[secondPortfolio])).rows[0].token).toBeNull();
  });
  it("requires fresh direct margin confirmation after a quantity change", async () => {
    await seed(); await db.query("update positions set margin_source='manual_direct',margin_requirement=200,margin_rate=null where id=$1",[position]);
    await record();
    expect((await db.query("select entry_margin_base,margin_requirement,margin_source from positions where id=$1",[position])).rows[0]).toEqual({entry_margin_base:"150",margin_requirement:null,margin_source:"missing"});
  });
  it("records partials atomically and makes identical retries idempotent", async () => {
    await seed(); const a = await record(); expect(await record()).toBe(a); expect(Number((await qty()).sold_quantity)).toBe(2);
    await rejected("select public.record_position_sale($1,3,110,'2026-10-14',0.9,'test',$2)",[position,request]);
    await record(8,111,"40000000-0000-0000-0000-000000000002");
    expect(await qty()).toMatchObject({ status:"closed" }); expect(Number((await qty()).sold_quantity)).toBe(10);
    await rejected("select public.record_position_sale($1,1,110,'2026-10-14',0.9,'test',gen_random_uuid())",[position]);
  });
  it("rounds only the compatibility weighted price, preserving precise executions", async () => {
    await seed(); await record(3,100); await record(7,101,"40000000-0000-0000-0000-000000000002");
    expect((await db.query<{sale_price:string}>("select sale_price from positions where id=$1",[position])).rows[0].sale_price).toBe("100.700000");
    expect((await db.query("select * from position_sales")).rows).toHaveLength(2);
  });
  it("blocks direct sale edits, frozen margin edits and entry edits, but permits stop changes", async () => {
    await seed();
    await db.exec("savepoint before_delete"); await db.query("delete from positions where id=$1",[position]);
    expect((await db.query("select id from positions")).rows).toHaveLength(0); await db.exec("rollback to savepoint before_delete");
    await rejected("update positions set entry_margin_base=200 where id=$1",[position]);
    await rejected("update positions set quantity=20 where id=$1",[position]);
    await rejected("update positions set sold_quantity=2,sale_price=110,sale_date='2026-10-14' where id=$1",[position]);
    await db.query("update positions set notes='Comment only' where id=$1",[position]);
    const original = (await db.query<{stop_updated_at:Date}>("select stop_updated_at from positions where id=$1",[position])).rows[0].stop_updated_at;
    expect(new Date(original).toISOString()).toBe("2026-01-01T00:00:00.000Z");
    await db.query("update positions set stop_price=95 where id=$1",[position]);
    expect(new Date((await db.query<{stop_updated_at:Date}>("select stop_updated_at from positions where id=$1",[position])).rows[0].stop_updated_at).getTime()).toBeGreaterThan(new Date(original).getTime());
    await record(); await rejected("delete from positions where id=$1",[position]);
  });
  it("keeps corrections auditable and reopens a trade if quantity is corrected", async () => {
    await seed(); const id = await record(10);
    await db.query("select public.correct_position_sale($1,8,112,'2026-10-13',0.88,'Datum und Menge korrigiert')",[id]);
    expect(await qty()).toMatchObject({ status:"active" }); expect(Number((await qty()).sold_quantity)).toBe(8);
    const history = (await db.query<{previous_values:{quantity:number}}>("select previous_values from position_sale_revisions")).rows;
    expect(history).toHaveLength(1); expect(Number(history[0].previous_values.quantity)).toBe(10);
    expect((await db.query<{entry_margin_base:string}>("select entry_margin_base from positions where id=$1",[position])).rows[0].entry_margin_base).toBe("150");
  });
  it("isolates users and rejects unauthenticated and direct table writes", async () => {
    await seed(); const id = await record();
    await rejected("update position_sales set price=1 where id=$1",[id]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[other]);
    expect((await db.query("select * from position_sales")).rows).toHaveLength(0);
    await rejected("select public.correct_position_sale($1,2,120,'2026-10-14',1,'Cross user')",[id]);
    await rejected("select public.record_position_sale($1,2,110,'2026-10-14',0.9,'test',gen_random_uuid())",[position]);
    await db.exec("set local role anon");
    await rejected("select public.record_position_sale($1,2,110,'2026-10-14',0.9,'test',gen_random_uuid())",[position]);
  });
  const entry = { source_key:"synthetic-source-001", ticker:"TEST", instrument_type:"stock", direction:"long", category:"Kerninvestment", quantity:10,entry_price:100,entry_date:"2026-01-01",instrument_currency:"USD",entry_margin_base:150,margin_rate:0.15,quantity_step:0.01,sales:[{quantity:10,price:110,sale_date:"2026-10-14",fx_to_base:0.9}] };
  it("imports provenance and sales once, skips identical repeats, and rejects changed repeats", async () => {
    const run = () => db.query<{result:{inserted:number;skipped:number}}>("select public.import_position_journal($1,$2::jsonb) as result",[portfolio,JSON.stringify([entry])]);
    expect((await run()).rows[0].result).toEqual({inserted:1,skipped:0}); expect((await run()).rows[0].result).toEqual({inserted:0,skipped:1});
    expect((await db.query("select * from position_sales")).rows).toHaveLength(1);
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',true)");
    await rejected("update positions set source_type='demo',source_import_id=null,imported_at=null where portfolio_id=$1", [portfolio]);
    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub','${user}',true)`);
    await rejected("select public.import_position_journal($1,$2::jsonb)",[portfolio,JSON.stringify([{...entry,source_key:"changed-source-002"}])]);
  });
  it("rolls back all imported lots, categories and import metadata on any invalid sale", async () => {
    await rejected("select public.import_position_journal($1,$2::jsonb)",[portfolio,JSON.stringify([entry,{...entry,source_key:"synthetic-source-002",sales:[{...entry.sales[0],quantity:11}]}])]);
    for (const table of ["positions","position_sales","portfolio_imports","portfolio_categories"]) expect((await db.query(`select * from public.${table}`)).rows).toHaveLength(0);
  });
  it("initializes a new empty account without demonstration balances", async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[other]);
    // Existing accounts are returned unchanged; a fresh fixture user starts empty.
    expect((await db.query<{id:string}>("select public.initialize_default_portfolio() as id")).rows[0].id).toBe(secondPortfolio);
    await db.exec("reset role");
    const third = "10000000-0000-0000-0000-000000000003";
    await db.query("insert into auth.users(id,email) values($1,'synthetic-c@example.invalid')",[third]);
    await db.exec("set local role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,true)",[third]);
    const id = (await db.query<{id:string}>("select public.initialize_default_portfolio() as id")).rows[0].id;
    expect((await db.query<{net_liquidity:null}>("select net_liquidity from portfolios where id=$1",[id])).rows[0].net_liquidity).toBeNull();
    expect((await db.query("select * from positions")).rows).toHaveLength(0);
  });
});
