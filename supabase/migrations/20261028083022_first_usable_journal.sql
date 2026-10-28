-- Additive first usable release. No production data is replaced.
alter table public.positions
  add column entry_margin_base numeric check (entry_margin_base >= 0 and entry_margin_base < 'Infinity'::numeric),
  add column entry_margin_source text,
  add column quantity_step numeric not null default 1 check (quantity_step >= 0.000001 and quantity_step < 'Infinity'::numeric and scale(trim_scale(quantity_step)) <= 6),
  add column tradingview_url text check (tradingview_url is null or tradingview_url ~ '^https://([a-z0-9-]+\.)?tradingview\.com/'),
  add column journal_source_key text;
create unique index positions_journal_source_key_idx on public.positions(user_id, portfolio_id, journal_source_key) where journal_source_key is not null;

create table public.position_sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  position_id uuid not null references public.positions(id) on delete cascade,
  quantity numeric not null check (quantity > 0 and quantity < 'Infinity'::numeric),
  price numeric not null check (price >= 0 and price < 'Infinity'::numeric),
  sale_date date not null,
  fx_to_base numeric check (fx_to_base > 0 and fx_to_base < 'Infinity'::numeric),
  fx_source text,
  source text not null default 'manual',
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);
create index position_sales_position_idx on public.position_sales(position_id);
create index position_sales_portfolio_date_idx on public.position_sales(portfolio_id, sale_date);
create index position_sales_user_idx on public.position_sales(user_id);
alter table public.position_sales enable row level security;
revoke all on public.position_sales from public, anon, authenticated;
grant select on public.position_sales to authenticated;
create policy position_sales_select_own on public.position_sales for select to authenticated
using ((select auth.uid()) = user_id and exists (
  select 1 from public.positions p where p.id = position_id and p.user_id = (select auth.uid()) and p.portfolio_id = position_sales.portfolio_id
));

-- Preserve old sale references without inventing execution dates or historical FX.
insert into public.position_sales(user_id, portfolio_id, position_id, quantity, price, sale_date, fx_to_base, fx_source, source, request_id)
select p.user_id, p.portfolio_id, p.id, p.sold_quantity, p.sale_price, p.sale_date,
  case when p.instrument_currency = f.currency then 1 else null end,
  case when p.instrument_currency = f.currency then 'identity' else null end,
  'legacy_aggregate', gen_random_uuid()
from public.positions p join public.portfolios f on f.id = p.portfolio_id
where p.sold_quantity > 0 and p.sale_price is not null and p.sale_date is not null;

create function public.guard_position_journal() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sold numeric; weighted numeric; latest date;
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null and exists(select 1 from public.position_sales where position_id = old.id) then
      raise exception 'Positionen mit Verkaufshistorie bleiben im Journal erhalten.';
    end if;
    return old;
  end if;
  if new.category_id is not null and not exists(select 1 from public.portfolio_categories c where c.id=new.category_id and c.user_id=new.user_id and c.portfolio_id=new.portfolio_id) then
    raise exception 'Kategorie gehört nicht zu diesem Depot.' using errcode='42501';
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.sold_quantity,0) <> 0 or new.sale_price is not null or new.sale_date is not null or new.status = 'closed' then
      raise exception 'Verkäufe müssen über das Verkaufsjournal erfasst werden.';
    end if;
    return new;
  end if;
  -- SQL-admin maintenance, including the separately approved account deletion,
  -- is outside user RPCs. Anonymous clients still have no update permission/RLS.
  if auth.uid() is null then return new; end if;
  if old.entry_margin_base is not null and (new.entry_margin_base is distinct from old.entry_margin_base or new.entry_margin_source is distinct from old.entry_margin_source) then
    raise exception 'Die historische Einstiegsmargin ist unveränderlich.';
  end if;
  if new.user_id is distinct from old.user_id or new.portfolio_id is distinct from old.portfolio_id then
    raise exception 'Positionseigentümer und Depot sind unveränderlich.';
  end if;
  if new.stop_price_native is not distinct from old.stop_price_native and new.stop_price is not distinct from old.stop_price then
    new.stop_updated_at := old.stop_updated_at;
  elsif coalesce(new.stop_price_native, new.stop_price) is null then
    new.stop_updated_at := null;
  elsif new.stop_updated_at is null or new.stop_updated_at is not distinct from old.stop_updated_at then
    new.stop_updated_at := now();
  end if;
  select coalesce(sum(s.quantity), 0), sum(s.quantity*s.price)/nullif(sum(s.quantity),0), max(s.sale_date)
    into sold, weighted, latest from public.position_sales s where s.position_id = old.id;
  if (sold > 0 or old.entry_margin_base is not null) and (new.quantity is distinct from old.quantity or new.entry_price is distinct from old.entry_price
    or new.entry_date is distinct from old.entry_date
    or new.ticker is distinct from old.ticker or new.direction is distinct from old.direction
    or new.instrument_currency is distinct from old.instrument_currency or new.multiplier is distinct from old.multiplier
    or new.instrument_type is distinct from old.instrument_type
    or (old.listing_id is not null and new.listing_id is distinct from old.listing_id)) then
    raise exception 'Einstiegsdaten mit Verkaufshistorie können nicht überschrieben werden.';
  end if;
  if sold > 0 and new.category_id is distinct from old.category_id then raise exception 'Kategorie mit Verkaufshistorie ist unveränderlich.'; end if;
  if new.sold_quantity is distinct from sold or new.sale_price is distinct from round(weighted,6) or new.sale_date is distinct from latest then
    raise exception 'Verkäufe müssen über das Verkaufsjournal erfasst werden.';
  end if;
  if sold > new.quantity then raise exception 'Verkauf übersteigt offene Menge.'; end if;
  if sold = new.quantity then new.status := 'closed';
  elsif new.status = 'closed' then raise exception 'Offene Restmenge kann nicht geschlossen werden.';
  end if;
  return new;
end $$;
revoke all on function public.guard_position_journal() from public, anon, authenticated;
create trigger positions_guard_journal before insert or update or delete on public.positions for each row execute function public.guard_position_journal();

create function public.record_position_sale(target_position uuid, sale_quantity numeric, sale_price_native numeric,
  executed_on date, sale_fx numeric, fx_provenance text, idempotency_key uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare p public.positions; existing public.position_sales; result uuid; sold numeric; weighted numeric; latest date;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into p from public.positions where id = target_position and user_id = auth.uid() for update;
  if not found then raise exception 'Position nicht verfügbar' using errcode = '42501'; end if;
  if p.instrument_currency = (select currency from public.portfolios where id=p.portfolio_id) then sale_fx:=1; fx_provenance:='identity'; end if;
  select * into existing from public.position_sales where user_id = auth.uid() and request_id = idempotency_key;
  if found then
    if existing.position_id = target_position and existing.quantity = sale_quantity and existing.price = sale_price_native
      and existing.sale_date = executed_on and existing.fx_to_base is not distinct from sale_fx then return existing.id; end if;
    raise exception 'Wiederholungskennung wurde für andere Angaben verwendet.';
  end if;
  if sale_quantity is null or not (sale_quantity > 0 and sale_quantity < 'Infinity'::numeric)
    or scale(trim_scale(sale_quantity)) > 6
    or sale_price_native is null or not (sale_price_native >= 0 and sale_price_native < 'Infinity'::numeric)
    or executed_on is null or executed_on > (now() at time zone 'Europe/Berlin')::date
    or (p.entry_date is not null and executed_on < p.entry_date) or p.instrument_type = 'cash'
    or (sale_fx is not null and not (sale_fx > 0 and sale_fx < 'Infinity'::numeric))
    or length(coalesce(fx_provenance,'')) > 200 then raise exception 'Ungültige Verkaufsangaben'; end if;
  select coalesce(sum(quantity),0) into sold from public.position_sales where position_id = p.id;
  if sold + sale_quantity > p.quantity then raise exception 'Verkauf übersteigt offene Menge.'; end if;
  insert into public.position_sales(user_id, portfolio_id, position_id, quantity, price, sale_date, fx_to_base, fx_source, request_id)
    values (auth.uid(), p.portfolio_id, p.id, sale_quantity, sale_price_native, executed_on, sale_fx, nullif(fx_provenance,''), idempotency_key) returning id into result;
  select sum(quantity), sum(quantity*price)/sum(quantity), max(sale_date) into sold, weighted, latest
    from public.position_sales where position_id = p.id;
  update public.positions set sold_quantity = sold, sale_price = weighted, sale_date = latest,
    margin_requirement = case when margin_source in ('broker','manual_direct','imported_direct') then null else margin_requirement end,
    margin_source = case when margin_source in ('broker','manual_direct','imported_direct') then case when margin_rate is null then 'missing' else 'estimated' end else margin_source end,
    status = case when sold = quantity then 'closed' else 'active' end, updated_at = now() where id = p.id;
  return result;
end $$;

-- FX refreshes share the existing provider credit budget and have independent
-- per-user/pair leases. Closed-market timestamps cannot cause repeated fetches.
create table app_private.portfolio_fx_refresh_states (
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  from_currency text not null,
  to_currency text not null,
  lease_token uuid not null unique default gen_random_uuid(),
  lease_until timestamptz not null,
  next_attempt timestamptz not null,
  primary key(portfolio_id,from_currency,to_currency)
);
create index portfolio_fx_refresh_states_user_idx on app_private.portfolio_fx_refresh_states(user_id);
revoke all on app_private.portfolio_fx_refresh_states from public, anon, authenticated;
create function public.claim_portfolio_fx_refresh(target_portfolio uuid,from_currency text,to_currency text) returns uuid
language plpgsql security definer set search_path='' as $$
declare token uuid;
begin
  if auth.uid() is null or from_currency !~ '^[A-Z]{3}$' or to_currency !~ '^[A-Z]{3}$' or from_currency=to_currency
    or not exists(select 1 from public.portfolios p where p.id=target_portfolio and p.user_id=auth.uid() and p.currency=to_currency) then return null; end if;
  insert into app_private.portfolio_fx_refresh_states as state(portfolio_id,user_id,from_currency,to_currency,lease_until,next_attempt)
    values(target_portfolio,auth.uid(),from_currency,to_currency,now()+interval '30 seconds',now())
    on conflict on constraint portfolio_fx_refresh_states_pkey do update set lease_token=gen_random_uuid(),lease_until=now()+interval '30 seconds'
      where state.lease_until<=now() and state.next_attempt<=now() returning lease_token into token;
  return token;
end $$;
create function public.finish_portfolio_fx_refresh(lease uuid,wait_seconds integer) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or wait_seconds not between 60 and 3600 then raise exception 'Invalid refresh completion' using errcode='42501'; end if;
  update app_private.portfolio_fx_refresh_states set lease_until=now(),next_attempt=now()+make_interval(secs=>wait_seconds)
    where lease_token=lease and user_id=auth.uid();
end $$;
revoke all on function public.claim_portfolio_fx_refresh(uuid,text,text),public.finish_portfolio_fx_refresh(uuid,integer) from public,anon;
grant execute on function public.claim_portfolio_fx_refresh(uuid,text,text),public.finish_portfolio_fx_refresh(uuid,integer) to authenticated;
revoke all on function public.record_position_sale(uuid,numeric,numeric,date,numeric,text,uuid) from public, anon;
grant execute on function public.record_position_sale(uuid,numeric,numeric,date,numeric,text,uuid) to authenticated;

-- Corrections retain the previous values. They never change the entry reference.
create table public.position_sale_revisions (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.position_sales(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  previous_values jsonb not null,
  reason text not null check(length(reason) between 3 and 500),
  created_at timestamptz not null default now()
);
create index position_sale_revisions_user_idx on public.position_sale_revisions(user_id);
create index position_sale_revisions_sale_idx on public.position_sale_revisions(sale_id);
alter table public.position_sale_revisions enable row level security;
revoke all on public.position_sale_revisions from public, anon, authenticated;
grant select on public.position_sale_revisions to authenticated;
create policy position_sale_revisions_select_own on public.position_sale_revisions for select to authenticated using ((select auth.uid()) = user_id);

create function public.correct_position_sale(target_sale uuid, sale_quantity numeric, sale_price_native numeric,
  executed_on date, sale_fx numeric, correction_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s public.position_sales; p public.positions; sold numeric; weighted numeric; latest date;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into s from public.position_sales where id = target_sale and user_id = auth.uid();
  if not found then raise exception 'Verkauf nicht verfügbar' using errcode = '42501'; end if;
  select * into p from public.positions where id = s.position_id and user_id = auth.uid() for update;
  if not found then raise exception 'Position nicht verfügbar' using errcode = '42501'; end if;
  select * into s from public.position_sales where id = target_sale;
  if p.instrument_currency = (select currency from public.portfolios where id=p.portfolio_id) then sale_fx:=1; end if;
  if sale_quantity is null or not(sale_quantity > 0 and sale_quantity < 'Infinity'::numeric) or scale(trim_scale(sale_quantity)) > 6
    or sale_price_native is null or not(sale_price_native >= 0 and sale_price_native < 'Infinity'::numeric)
    or executed_on is null or executed_on > (now() at time zone 'Europe/Berlin')::date or executed_on < p.entry_date
    or (sale_fx is not null and not(sale_fx > 0 and sale_fx < 'Infinity'::numeric))
    or length(coalesce(correction_reason,'')) not between 3 and 500 then raise exception 'Ungültige Korrekturangaben'; end if;
  select coalesce(sum(quantity),0) into sold from public.position_sales where position_id=p.id and id<>s.id;
  if sold+sale_quantity > p.quantity then raise exception 'Verkauf übersteigt offene Menge.'; end if;
  if s.quantity = sale_quantity and s.price = sale_price_native and s.sale_date = executed_on and s.fx_to_base is not distinct from sale_fx then return s.id; end if;
  insert into public.position_sale_revisions(sale_id,user_id,previous_values,reason) values(s.id,auth.uid(),to_jsonb(s),btrim(correction_reason));
  update public.position_sales set quantity=sale_quantity, price=sale_price_native, sale_date=executed_on, fx_to_base=sale_fx,
    fx_source=case when sale_fx is null then null else 'manual_corrected_reference' end, source='manual_corrected' where id=s.id;
  select sum(quantity),sum(quantity*price)/sum(quantity),max(sale_date) into sold,weighted,latest from public.position_sales where position_id=p.id;
  update public.positions set sold_quantity=sold,sale_price=weighted,sale_date=latest,
    margin_requirement=case when s.quantity<>sale_quantity and margin_source in ('broker','manual_direct','imported_direct') then null else margin_requirement end,
    margin_source=case when s.quantity<>sale_quantity and margin_source in ('broker','manual_direct','imported_direct') then case when margin_rate is null then 'missing' else 'estimated' end else margin_source end,
    status=case when sold=quantity then 'closed' else 'active' end,updated_at=now() where id=p.id;
  return s.id;
end $$;
revoke all on function public.correct_position_sale(uuid,numeric,numeric,date,numeric,text) from public, anon;
grant execute on function public.correct_position_sale(uuid,numeric,numeric,date,numeric,text) to authenticated;

create function public.import_position_journal(target_portfolio uuid, entries jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item jsonb; sale jsonb; cat uuid; pos uuid; import_id uuid; inserted integer := 0; skipped integer := 0; base_currency text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select currency into base_currency from public.portfolios where id = target_portfolio and user_id = auth.uid() for update;
  if not found then raise exception 'Depot nicht verfügbar' using errcode = '42501'; end if;
  if entries is null or jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) > 2000 or jsonb_array_length(entries) = 0 then raise exception 'Ungültiger Journalimport'; end if;
  if exists(select 1 from public.positions where portfolio_id=target_portfolio and source_type<>'demo')
    and exists(select 1 from jsonb_array_elements(entries) e where not exists(
      select 1 from public.positions p where p.portfolio_id=target_portfolio and p.journal_source_key=e->>'source_key')) then
    raise exception 'Die Erstübernahme benötigt ein leeres Depot. Wiederholungen bereits importierter Zeilen sind möglich.';
  end if;
  insert into public.portfolio_imports(user_id,portfolio_id,source_type,original_filename,total_rows,valid_rows,warning_rows,rejected_rows,import_status,metadata)
    values(auth.uid(),target_portfolio,'custom_csv','Journalimport.csv',jsonb_array_length(entries),jsonb_array_length(entries),0,0,'processing','{"mode":"journal"}') returning id into import_id;
  for item in select * from jsonb_array_elements(entries) loop
    if length(coalesce(item->>'source_key','')) not between 10 and 150 or length(coalesce(item->>'ticker','')) not between 1 and 80
      or coalesce(item->>'instrument_currency','') !~ '^[A-Z]{3}$'
      or coalesce(item->>'direction','') not in ('long','short','long_put','long_call','short_put','short_call')
      or coalesce(item->>'instrument_type','') not in ('stock','etf','option')
      or item->>'quantity' is null or not ((item->>'quantity')::numeric > 0 and (item->>'quantity')::numeric < 'Infinity'::numeric) or scale(trim_scale((item->>'quantity')::numeric)) > 6
      or item->>'entry_price' is null or not ((item->>'entry_price')::numeric >= 0 and (item->>'entry_price')::numeric < 'Infinity'::numeric)
      or item->>'entry_date' is null or (item->>'entry_date')::date > (now() at time zone 'Europe/Berlin')::date
      or (item->>'margin_rate' is not null and not ((item->>'margin_rate')::numeric between 0 and 1))
      or not (coalesce((item->>'multiplier')::numeric,1) > 0 and coalesce((item->>'multiplier')::numeric,1) < 'Infinity'::numeric)
      or length(coalesce(item->>'category','')) > 100 or length(coalesce(item->>'notes','')) > 1000
      or coalesce(jsonb_typeof(item->'sales'),'null') <> 'array' then raise exception 'Ungültige Importzeile'; end if;
    if exists(select 1 from public.positions where portfolio_id=target_portfolio and user_id=auth.uid() and journal_source_key=item->>'source_key') then skipped:=skipped+1; continue; end if;
    cat := null;
    if nullif(item->>'category','') is not null then
      insert into public.portfolio_categories(portfolio_id,user_id,name) values(target_portfolio,auth.uid(),item->>'category')
        on conflict(portfolio_id,name) do nothing;
      select id into cat from public.portfolio_categories where portfolio_id=target_portfolio and name=item->>'category' and user_id=auth.uid();
    end if;
    insert into public.positions(portfolio_id,user_id,category_id,ticker,instrument_type,direction,quantity,multiplier,entry_price,entry_date,
      instrument_currency,entry_fx_to_base,current_fx_to_base,current_fx_status,current_fx_source,current_fx_as_of,
      current_price,current_price_native,current_price_status,current_price_source,current_price_as_of,
      stop_price,stop_price_native,stop_updated_at,margin_rate,margin_source,entry_margin_base,entry_margin_source,
      quantity_step,tradingview_url,notes,journal_source_key,source_type,source_import_id,imported_at,status,sold_quantity,sale_price,sale_date)
    values(target_portfolio,auth.uid(),cat,item->>'ticker',item->>'instrument_type',item->>'direction',(item->>'quantity')::numeric,
      coalesce((item->>'multiplier')::numeric,1),(item->>'entry_price')::numeric,(item->>'entry_date')::date,
      item->>'instrument_currency',(item->>'entry_fx_to_base')::numeric,(item->>'current_fx_to_base')::numeric,
      case when item->>'current_fx_to_base' is null then 'missing' else 'stale' end,'journal_import',null,
      (item->>'current_price')::numeric,(item->>'current_price')::numeric,
      case when item->>'current_price' is null then 'missing' else 'stale' end,'custom_csv',null,
      (item->>'stop_price')::numeric,(item->>'stop_price')::numeric,(item->>'stop_updated_at')::timestamptz,(item->>'margin_rate')::numeric,
      case when item->>'margin_rate' is null then 'missing' else 'estimated' end,(item->>'entry_margin_base')::numeric,
      case when item->>'entry_margin_base' is null then null else 'journal_import_reference' end,
      coalesce((item->>'quantity_step')::numeric,1),nullif(item->>'tradingview_url',''),nullif(item->>'notes',''),item->>'source_key','custom_csv',import_id,now(),'active',0,null,null)
      returning id into pos;
    for sale in select * from jsonb_array_elements(item->'sales') loop
      perform public.record_position_sale(pos,(sale->>'quantity')::numeric,(sale->>'price')::numeric,(sale->>'sale_date')::date,
        (sale->>'fx_to_base')::numeric,coalesce(sale->>'fx_source',''),gen_random_uuid());
    end loop;
    inserted:=inserted+1;
  end loop;
  update public.portfolio_imports set import_status='completed',inserted_position_count=inserted,metadata=jsonb_build_object('mode','journal','skipped',skipped) where id=import_id;
  return jsonb_build_object('inserted',inserted,'skipped',skipped);
end $$;
revoke all on function public.import_position_journal(uuid,jsonb) from public, anon;
grant execute on function public.import_position_journal(uuid,jsonb) to authenticated;

comment on column public.positions.entry_margin_base is 'Frozen entry margin in portfolio currency. Never derived from current margin or current FX.';
comment on table public.position_sales is 'Execution history; historical FX may be unknown and is never replaced by current FX.';

-- New accounts start empty, without invented account values or demonstration holdings.
create or replace function public.initialize_default_portfolio() returns uuid
language plpgsql security invoker set search_path = '' as $$
declare caller uuid := auth.uid(); target uuid;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('depotarchitect:initialize:' || caller::text,0));
  select id into target from public.portfolios where user_id=caller order by created_at limit 1;
  if target is not null then return target; end if;
  insert into public.portfolios(user_id,name,currency,account_type,risk_profile) values(caller,'Hauptdepot','EUR','margin_account','Aggressiv 1,0') returning id into target;
  insert into public.portfolio_categories(portfolio_id,user_id,name,sort_order) values
    (target,caller,'Kerninvestment',0),(target,caller,'Momentumtrade',1),(target,caller,'taktische Beimischung',2),(target,caller,'Hedge',3);
  insert into public.portfolio_settings(portfolio_id,user_id,risk_per_trade_pct) values(target,caller,1.2);
  return target;
end $$;
