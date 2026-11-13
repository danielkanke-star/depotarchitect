-- One broker-reported observation per measure and currency. No inferred payout balance.
create table public.depot_account_balances (
  portfolio_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('cash_total','cash_currency','withdrawable')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount numeric(24,8) not null check (abs(amount) < 1e15 and (kind <> 'withdrawable' or amount >= 0)),
  settled numeric(24,8) check (abs(settled) < 1e15),
  observed_at timestamptz not null,
  source text not null check (source in ('ibkr_flex','broker_file')),
  primary key (portfolio_id,kind,currency),
  foreign key (portfolio_id,user_id) references public.portfolios(id,user_id) on delete cascade
);
create index depot_account_balances_owner_idx on public.depot_account_balances(user_id);
alter table public.depot_account_balances enable row level security;
revoke all on public.depot_account_balances from public,anon,authenticated;
grant select on public.depot_account_balances to authenticated;
create policy depot_account_balances_read on public.depot_account_balances for select to authenticated
using (user_id=(select auth.uid()));

-- Negative broker NAV is meaningful for a margin account. Risk formulas already require a positive base.
alter table public.portfolios drop constraint portfolios_net_liquidity_check;
alter table public.portfolios add constraint portfolios_net_liquidity_finite check (abs(net_liquidity)<1e16);
alter table public.portfolios drop constraint portfolios_net_liquidity_source_check;
alter table public.portfolios add constraint portfolios_net_liquidity_source_check
check (net_liquidity_source in ('manual','ibkr_flex','broker_file'));

create table app_private.depot_balance_accounts (
  portfolio_id uuid primary key references public.portfolios(id) on delete cascade,
  account_key text not null check (account_key ~ '^[0-9a-f]{64}$')
);
alter table app_private.depot_balance_accounts enable row level security;
revoke all on app_private.depot_balance_accounts from public,anon,authenticated;

create function app_private.guard_ibkr_balance_account() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.kind='ibkr' and exists(select 1 from app_private.depot_balance_accounts a
    where a.portfolio_id=new.portfolio_id and a.account_key<>new.account_key) then
    raise exception 'Der Bericht gehört zu einem anderen IBKR-Konto.';
  end if;
  return new;
end $$;
create trigger depot_trade_sources_balance_account before insert on app_private.depot_trade_sources
for each row execute function app_private.guard_ibkr_balance_account();
revoke all on function app_private.guard_ibkr_balance_account() from public,anon,authenticated;

create function app_private.write_depot_account_balances(target_portfolio uuid, snapshots jsonb, report_source text)
returns integer language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); depot_currency text; row jsonb; amount_value numeric; settled_value numeric;
  report_time timestamptz; counter integer:=0; affected integer; kind_value text; currency_value text;
begin
  select currency into depot_currency from public.portfolios where id=target_portfolio and user_id=caller for update;
  if not found then raise exception 'Depot nicht verfügbar.' using errcode='42501'; end if;
  if not exists(select 1 from public.user_profiles where user_id=caller and account_status='active') then
    raise exception 'Depot nicht verfügbar.' using errcode='42501';
  end if;
  if coalesce(report_source,'') not in ('ibkr_flex','broker_file') or snapshots is null or jsonb_typeof(snapshots)<>'array' or jsonb_array_length(snapshots)>100
  then raise exception 'Kontowerte prüfen.'; end if;
  -- A Cash Report is a full snapshot of its currency balances. Remove obsolete
  -- detail rows only if a newer report has actually supplied a new detail set.
  if report_source='ibkr_flex' then
    delete from public.depot_account_balances b
    where b.portfolio_id=target_portfolio and b.kind='cash_currency' and b.source='ibkr_flex'
      and b.observed_at<(select max((item->>'observedAt')::timestamptz) from jsonb_array_elements(snapshots) item where item->>'kind'='cash_currency')
      and not exists(select 1 from jsonb_array_elements(snapshots) item where item->>'kind'='cash_currency' and item->>'currency'=b.currency);
  end if;
  for row in select value from jsonb_array_elements(snapshots) loop
    kind_value:=row->>'kind'; currency_value:=row->>'currency';
    report_time:=(row->>'observedAt')::timestamptz;
    amount_value:=(row->>'amount')::numeric; settled_value:=(row->>'settled')::numeric;
    if coalesce(kind_value,'') not in ('depot_value','cash_total','cash_currency','withdrawable')
      or coalesce(currency_value,'') !~ '^[A-Z]{3}$'
      or (kind_value='depot_value' and currency_value<>depot_currency)
      or (report_source='ibkr_flex' and kind_value='withdrawable')
      or report_time is null or report_time>now() or amount_value is null or not (abs(amount_value)<1e15)
      or scale(trim_scale(amount_value))>8 or (kind_value='withdrawable' and amount_value<0)
      or (settled_value is not null and (kind_value not in ('cash_total','cash_currency') or not(abs(settled_value)<1e15) or scale(trim_scale(settled_value))>8))
      then raise exception 'Kontowert, Währung oder Stand prüfen.'; end if;
    if kind_value='depot_value' then
      update public.portfolios set net_liquidity=amount_value,net_liquidity_source=report_source,data_as_of=report_time
      where id=target_portfolio and user_id=caller and (data_as_of is null or data_as_of<report_time or
        (data_as_of=report_time and net_liquidity_source is distinct from 'ibkr_flex'));
    else
      insert into public.depot_account_balances as b(portfolio_id,user_id,kind,currency,amount,settled,observed_at,source)
      values(target_portfolio,caller,kind_value,currency_value,amount_value,settled_value,report_time,report_source)
      on conflict (portfolio_id,kind,currency) do update set
        amount=excluded.amount,settled=excluded.settled,observed_at=excluded.observed_at,source=excluded.source
      where excluded.observed_at>b.observed_at or (excluded.observed_at=b.observed_at and excluded.source='ibkr_flex' and b.source<>'ibkr_flex');
    end if;
    get diagnostics affected=row_count;
    counter:=counter+affected;
  end loop;
  return counter;
end $$;

create function public.import_depot_account_balances(target_portfolio uuid, snapshots jsonb)
returns integer language sql security definer set search_path='' as $$
  select app_private.write_depot_account_balances(target_portfolio,snapshots,'broker_file')
$$;

-- A separate cash/NAV-only Flex file may be imported into an existing depot.
-- Bind the reported account without marking the trading ledger as initialized.
create function public.import_flex_account_values(target_portfolio uuid, report_account text, snapshots jsonb)
returns integer language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or coalesce(report_account,'') !~ '^[0-9a-f]{64}$' then raise exception 'Depot nicht verfügbar.' using errcode='42501'; end if;
  perform 1 from public.portfolios where id=target_portfolio and user_id=auth.uid() for update;
  if not found then raise exception 'Depot nicht verfügbar.' using errcode='42501'; end if;
  if exists(select 1 from app_private.depot_trade_sources t where t.portfolio_id=target_portfolio and t.kind='ibkr' and t.account_key<>report_account) then
    raise exception 'Der Bericht gehört zu einem anderen IBKR-Konto.';
  end if;
  if exists(select 1 from app_private.ibkr_flex_connections c where c.portfolio_id=target_portfolio and c.account_hash<>report_account) then
    raise exception 'Der Bericht gehört zu einem anderen IBKR-Konto.';
  end if;
  insert into app_private.depot_balance_accounts as a(portfolio_id,account_key) values(target_portfolio,report_account)
  on conflict(portfolio_id) do update set account_key=excluded.account_key where a.account_key=excluded.account_key;
  if not found then raise exception 'Der Bericht gehört zu einem anderen IBKR-Konto.'; end if;
  return app_private.write_depot_account_balances(target_portfolio,snapshots,'ibkr_flex');
end $$;

revoke all on function app_private.write_depot_account_balances(uuid,jsonb,text),
  public.import_depot_account_balances(uuid,jsonb),public.import_flex_account_values(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.import_depot_account_balances(uuid,jsonb),public.import_flex_account_values(uuid,text,jsonb) to authenticated;

create or replace function app_private.apply_ibkr_flex_valuation(target_portfolio uuid, source_account text, valuation jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare depot_currency text; snapshots jsonb;
begin
  if valuation is null or jsonb_typeof(valuation)<>'object' then return; end if;
  select currency into depot_currency from public.portfolios where id=target_portfolio and user_id=auth.uid();
  snapshots:=coalesce(valuation->'balances','[]'::jsonb);
  if valuation->'netAssetValue' is not null then
    snapshots:=snapshots||jsonb_build_array(jsonb_build_object('kind','depot_value','currency',depot_currency,
      'amount',valuation->'netAssetValue'->>'total','observedAt',(valuation->'netAssetValue'->>'date')::date::timestamp at time zone 'UTC'));
  end if;
  if jsonb_typeof(snapshots)='array' and jsonb_array_length(snapshots)>0 then
    perform public.import_flex_account_values(target_portfolio,source_account,snapshots);
  end if;
  if coalesce(jsonb_typeof(valuation->'marks'),'null')<>'array' or jsonb_array_length(valuation->'marks')>2000 then return; end if;
  insert into public.position_price_observations(user_id,portfolio_id,position_id,ticker,currency,price_native,source_type,source_name,observed_at,status,source_reference)
  select p.user_id,p.portfolio_id,p.id,p.ticker,p.instrument_currency,(mark->>'price')::numeric,'ibkr','IBKR Flex · Schlusskurs',
    (mark->>'date')::date::timestamp at time zone 'Europe/Berlin','end_of_day','ibkr_flex:'||(mark->>'conid')
  from app_private.depot_trade_sources src join app_private.depot_executions e on e.source_id=src.id
    join public.positions p on p.id=e.position_id
    join jsonb_array_elements(valuation->'marks') mark on mark->>'conid'=e.payload->>'instrument' and mark->>'currency'=p.instrument_currency
  where src.portfolio_id=target_portfolio and src.user_id=auth.uid() and src.kind='ibkr' and src.account_key=source_account
    and p.status<>'closed' and p.entry_date<=(mark->>'date')::date and (mark->>'date')::date<=(now() at time zone 'Europe/Berlin')::date
    and (mark->>'price')::numeric>=0 and (mark->>'price')::numeric<1e12
  on conflict(position_id,source_type,observed_at,price_native) do nothing;
end $$;

create or replace function public.ibkr_flex_connect(target_portfolio uuid, source_account text, display_account text, sealed text,
  worker_key_hash text, expires date, entries jsonb, valuation jsonb, allow_existing boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare outcome jsonb; caller uuid:=auth.uid();
begin
  if expires is null or expires < current_date or expires > current_date+366 then raise exception 'Gültigkeitsdatum des Tokens prüfen.'; end if;
  if entries='[]'::jsonb and (valuation->'netAssetValue' is not null or coalesce(jsonb_array_length(valuation->'balances'),0)>0) then
    -- A balance-only connection does not authorize later overlapping trade imports.
    outcome:=jsonb_build_object('opened',0,'closed',0,'skipped',0);
  else
    outcome:=app_private.apply_depot_executions(target_portfolio,'ibkr',source_account,entries,allow_existing,false);
  end if;
  perform app_private.apply_ibkr_flex_valuation(target_portfolio,source_account,valuation);
  insert into app_private.ibkr_flex_connections(portfolio_id,user_id,account_hash,account_label,credentials,worker_hash,expires_on)
  values(target_portfolio,caller,source_account,display_account,sealed,worker_key_hash,expires)
  on conflict(portfolio_id) do update set credentials=excluded.credentials,worker_hash=excluded.worker_hash,expires_on=excluded.expires_on,
    last_success=now(),next_run=now()+interval '20 hours',last_error=null,lease=null,lease_until=null
  where ibkr_flex_connections.account_hash=excluded.account_hash;
  if not found then raise exception 'Der Bericht gehört zu einem anderen IBKR-Konto.'; end if;
  return outcome;
end $$;

create or replace function public.ibkr_flex_finish(worker_key text, job_lease uuid, report_account text, entries jsonb, valuation jsonb, failure text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c app_private.ibkr_flex_connections; result jsonb; caller text:=coalesce(current_setting('request.jwt.claim.sub',true),'');
begin
  if length(coalesce(worker_key,'')) not between 16 and 200 then return null; end if;
  select * into c from app_private.ibkr_flex_connections where lease=job_lease and lease_until>now()
    and worker_hash=encode(sha256(convert_to(worker_key,'UTF8')),'hex');
  if not found then return null; end if;
  perform 1 from public.portfolios where id=c.portfolio_id for update;
  select * into c from app_private.ibkr_flex_connections where portfolio_id=c.portfolio_id and lease=job_lease and lease_until>now()
    and worker_hash=encode(sha256(convert_to(worker_key,'UTF8')),'hex') for update;
  if not found then return null; end if;
  if failure is not null and failure not in ('credentials','report','unavailable','pending','ledger') then failure:='report'; end if;
  if failure is null and report_account is distinct from c.account_hash then failure:='report'; end if;
  if failure is null then
    perform set_config('request.jwt.claim.sub',c.user_id::text,true);
    begin
      if entries='[]'::jsonb then
        result:=jsonb_build_object('opened',0,'closed',0,'skipped',0);
      else
        result:=app_private.apply_depot_executions(c.portfolio_id,'ibkr',c.account_hash,entries,false,false);
      end if;
      perform app_private.apply_ibkr_flex_valuation(c.portfolio_id,c.account_hash,valuation);
    exception when raise_exception or invalid_text_representation or numeric_value_out_of_range or check_violation or insufficient_privilege then
      failure:='ledger';
      result:=jsonb_build_object('message',sqlerrm);
    end;
    perform set_config('request.jwt.claim.sub',caller,true);
  end if;
  update app_private.ibkr_flex_connections set last_error=failure,lease=null,lease_until=null,
    last_success=case when failure is null then now() else last_success end
    where portfolio_id=c.portfolio_id;
  return coalesce(result,'{}'::jsonb)||jsonb_build_object('error',failure);
end $$;
