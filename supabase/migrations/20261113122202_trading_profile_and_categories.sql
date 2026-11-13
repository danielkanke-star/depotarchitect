alter table public.portfolios
  add column risk_profile_configured boolean not null default true,
  add column net_liquidity_source text check (net_liquidity_source in ('manual','ibkr_flex'));

alter table public.portfolio_settings
  add column risk_budget_pct numeric(5,2) check (risk_budget_pct > 0 and risk_budget_pct <= 100);

-- Keep the same effective budget for existing depots. A newly created depot has
-- no preset portfolio-wide stop budget until its owner sets one.
update public.portfolio_settings as settings
set risk_budget_pct=case p.risk_profile
  when 'Stockkonservativ 0,4' then 13.2
  when 'Konservativ 0,6' then 19.8
  when 'Normal 0,8' then 26.4
  when 'Aggressiv 1,0' then 33
  when 'Aggro 1,2' then 39.6
end
from public.portfolios p where p.id=settings.portfolio_id;

update public.portfolios set risk_profile=case risk_profile
  when 'Stockkonservativ 0,4' then 'Sehr konservativ'
  when 'Konservativ 0,6' then 'Konservativ'
  when 'Normal 0,8' then 'Normal'
  when 'Aggressiv 1,0' then 'Aggressiv'
  when 'Aggro 1,2' then 'Aggro'
  else risk_profile end;
alter table public.portfolios alter column risk_profile set default 'Normal';

alter table public.portfolio_categories
  add column target_min integer,
  add column target_max integer,
  add constraint portfolio_category_target_range check (
    (target_min is null and target_max is null)
    or (target_min is not null and target_max is not null and target_min between 0 and 1000 and target_max between greatest(1,target_min) and 1000)
  );

update public.portfolio_categories
set target_min=case lower(regexp_replace(name,'[[:space:]_-]','','g'))
    when 'kerninvestment' then 8 when 'momentumtrade' then 9 when 'taktischebeimischung' then 4 when 'hedge' then 1 end,
  target_max=case lower(regexp_replace(name,'[[:space:]_-]','','g'))
    when 'kerninvestment' then 8 when 'momentumtrade' then 9 when 'taktischebeimischung' then 4 when 'hedge' then 2 end
where lower(regexp_replace(name,'[[:space:]_-]','','g')) in ('kerninvestment','momentumtrade','taktischebeimischung','hedge');

create or replace function public.initialize_default_portfolio() returns uuid
language plpgsql security invoker set search_path='' as $$
declare caller uuid:=auth.uid(); target uuid;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('depotarchitect:initialize:'||caller::text,0));
  select id into target from public.portfolios where user_id=caller order by created_at limit 1;
  if target is not null then return target; end if;
  insert into public.portfolios(user_id,name,currency,account_type,risk_profile,risk_profile_configured)
    values(caller,'Hauptdepot','EUR','other','Normal',false) returning id into target;
  insert into public.portfolio_categories(portfolio_id,user_id,name,sort_order) values
    (target,caller,'Kerninvestment',0),(target,caller,'Momentumtrade',1),(target,caller,'Taktische Beimischung',2),(target,caller,'Hedge',3);
  insert into public.portfolio_settings(portfolio_id,user_id) values(target,caller);
  return target;
end $$;

create function public.create_named_portfolio(depot_name text, base_currency text, depot_type text, trading_profile text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare caller uuid:=auth.uid(); target uuid;
begin
  if caller is null or not exists(select 1 from public.user_profiles where user_id=caller and account_status in ('active','invited')) then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if depot_name is null or length(btrim(depot_name)) not between 1 and 60
    or base_currency is null or base_currency !~ '^[A-Z]{3}$'
    or coalesce(depot_type,'') not in ('cash_account','margin_account','portfolio_margin_account','other')
    or coalesce(trading_profile,'') not in ('Sehr konservativ','Konservativ','Normal','Aggressiv','Aggro') then
    raise exception 'Bitte Depotangaben und Trading-Profil prüfen.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('depotarchitect:initialize:'||caller::text,0));
  insert into public.portfolios(user_id,name,currency,account_type,risk_profile,risk_profile_configured)
    values(caller,btrim(depot_name),base_currency,depot_type,trading_profile,true) returning id into target;
  insert into public.portfolio_categories(portfolio_id,user_id,name,sort_order) values
    (target,caller,'Kerninvestment',0),(target,caller,'Momentumtrade',1),(target,caller,'Taktische Beimischung',2),(target,caller,'Hedge',3);
  insert into public.portfolio_settings(portfolio_id,user_id) values(target,caller);
  return target;
end $$;

create or replace function public.create_named_portfolio(depot_name text, base_currency text, depot_type text) returns uuid
language sql security invoker set search_path='' as $$
  select public.create_named_portfolio(depot_name,base_currency,depot_type,'Normal')
$$;

create function public.save_depot_preferences(target_portfolio uuid, base_currency text, depot_type text, trading_profile text,
  trade_pct numeric, budget_pct numeric, margin_pct numeric, concentration_basis_pct numeric) returns void
language plpgsql security invoker set search_path='' as $$
declare depot public.portfolios;
begin
  if auth.uid() is null then raise exception 'Depot nicht verfügbar.' using errcode='42501'; end if;
  select * into depot from public.portfolios where id=target_portfolio and user_id=auth.uid() for update;
  if not found then raise exception 'Depot nicht verfügbar.' using errcode='42501'; end if;
  if base_currency is null or base_currency !~ '^[A-Z]{3}$'
    or coalesce(depot_type,'') not in ('cash_account','margin_account','portfolio_margin_account','other')
    or coalesce(trading_profile,'') not in ('Sehr konservativ','Konservativ','Normal','Aggressiv','Aggro')
    or trade_pct is null or not (trade_pct between 0.001 and 100) or scale(trim_scale(trade_pct))>3
    or (budget_pct is not null and (not (budget_pct between 0.01 and 100) or scale(trim_scale(budget_pct))>2))
    or (margin_pct is not null and (not (margin_pct between 0.01 and 100) or scale(trim_scale(margin_pct))>2))
    or concentration_basis_pct is null or not (concentration_basis_pct between 0.01 and 100) or scale(trim_scale(concentration_basis_pct))>2
    then raise exception 'Bitte Profil und Prozentwerte prüfen.'; end if;
  if base_currency<>depot.currency and (
    depot.net_liquidity is not null
    or exists(select 1 from public.positions where portfolio_id=target_portfolio)
    or exists(select 1 from public.portfolio_cash_balances where portfolio_id=target_portfolio)
    or exists(select 1 from public.portfolio_capital_movements where portfolio_id=target_portfolio)
  ) then raise exception 'Die Depotwährung ist bei vorhandenen Depotdaten festgelegt.'; end if;

  update public.portfolios set currency=base_currency,account_type=depot_type,
    risk_profile=trading_profile,risk_profile_configured=true,updated_at=now()
    where id=target_portfolio and user_id=auth.uid();
  update public.portfolio_settings set risk_per_trade_pct=trade_pct,risk_budget_pct=budget_pct,
    max_margin_pct=case when depot_type in ('margin_account','portfolio_margin_account') then coalesce(margin_pct,max_margin_pct) else max_margin_pct end,
    max_position_pct=concentration_basis_pct,updated_at=now()
    where portfolio_id=target_portfolio and user_id=auth.uid();
  if not found then raise exception 'Depoteinstellungen fehlen.'; end if;
end $$;

create function public.record_depot_value(target_portfolio uuid, amount numeric, observed_at timestamptz) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Depot nicht verfügbar.' using errcode='42501'; end if;
  if amount is null or not (amount>=0 and amount<1e16) or scale(trim_scale(amount))>2
    or observed_at is null or observed_at>now() then raise exception 'Bitte Betrag und Stand prüfen.'; end if;
  update public.portfolios set net_liquidity=amount, data_as_of=observed_at, net_liquidity_source='manual', updated_at=now()
    where id=target_portfolio and user_id=auth.uid()
      and (data_as_of is null or data_as_of<observed_at or
        (data_as_of=observed_at and net_liquidity_source is distinct from 'ibkr_flex'));
  return found;
end $$;

create function app_private.clear_depot_value_source() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.net_liquidity is null then new.net_liquidity_source:=null; end if;
  return new;
end $$;
create trigger portfolios_clear_depot_value_source before update of net_liquidity on public.portfolios
for each row execute function app_private.clear_depot_value_source();

create function public.manage_depot_category(target_portfolio uuid, operation text, category_id uuid, category_name text,
  goal_min integer, goal_max integer) returns text
language plpgsql security invoker set search_path='' as $$
declare existing public.portfolio_categories; label text:=btrim(category_name);
begin
  if auth.uid() is null then raise exception 'Depot nicht verfügbar.' using errcode='42501'; end if;
  perform 1 from public.portfolios where id=target_portfolio and user_id=auth.uid() for update;
  if not found then raise exception 'Depot nicht verfügbar.' using errcode='42501'; end if;
  if coalesce(operation,'') not in ('create','edit','remove','restore') then raise exception 'Unbekannte Kategorieaktion.'; end if;
  if operation<>'create' then
    select * into existing from public.portfolio_categories c where c.id=category_id and c.portfolio_id=target_portfolio and c.user_id=auth.uid() for update;
    if not found then raise exception 'Kategorie nicht verfügbar.' using errcode='42501'; end if;
  end if;
  if operation in ('create','edit') then
    if label is null or length(label) not between 1 and 60 then raise exception 'Bitte einen Namen mit 1 bis 60 Zeichen eingeben.'; end if;
    if exists(select 1 from public.portfolio_categories c where c.portfolio_id=target_portfolio and lower(btrim(c.name))=lower(label)
      and c.id is distinct from existing.id) then raise exception 'Dieser Kategoriename ist bereits vergeben.' using errcode='23505'; end if;
    if (goal_min is null)<>(goal_max is null) or (goal_max is not null and (goal_min<0 or goal_max<greatest(1,goal_min) or goal_max>1000)) then
      raise exception 'Bitte den Zielbereich für die Kategorie prüfen.';
    end if;
  end if;
  if operation='create' then
    insert into public.portfolio_categories(portfolio_id,user_id,name,sort_order,target_min,target_max)
      select target_portfolio,auth.uid(),label,coalesce(max(c.sort_order),-1)+1,goal_min,goal_max
      from public.portfolio_categories c where c.portfolio_id=target_portfolio;
    return 'created';
  end if;
  if operation='edit' then
    update public.portfolio_categories set name=label,target_min=goal_min,target_max=goal_max where id=existing.id;
    return 'updated';
  end if;
  if operation='restore' then
    update public.portfolio_categories set is_active=true where id=existing.id;
    return 'restored';
  end if;
  if exists(select 1 from public.positions where portfolio_id=target_portfolio and positions.category_id=existing.id) then
    update public.portfolio_categories set is_active=false where id=existing.id;
    return 'archived';
  end if;
  delete from public.portfolio_categories where id=existing.id;
  return 'deleted';
end $$;

create function public.guard_used_category_delete() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is not null and exists(select 1 from public.positions where category_id=old.id) then
    raise exception 'Eine verwendete Kategorie kann archiviert werden.';
  end if;
  return old;
end $$;
create trigger categories_guard_used_delete before delete on public.portfolio_categories
for each row execute function public.guard_used_category_delete();

create function public.guard_new_category_assignment() returns trigger
language plpgsql security invoker set search_path='' as $$
declare available boolean;
begin
  if new.category_id is null or auth.uid() is null then return new; end if;
  if tg_op='UPDATE' and new.category_id is not distinct from old.category_id then return new; end if;
  select c.is_active into available from public.portfolio_categories c
    where c.id=new.category_id and c.portfolio_id=new.portfolio_id and c.user_id=new.user_id for share;
  if available is distinct from true then raise exception 'Bitte eine aktive Kategorie aus diesem Depot wählen.'; end if;
  return new;
end $$;
create trigger positions_guard_new_category before insert or update of category_id on public.positions
for each row execute function public.guard_new_category_assignment();

revoke all on function public.create_named_portfolio(text,text,text,text),
  public.save_depot_preferences(uuid,text,text,text,numeric,numeric,numeric,numeric),public.record_depot_value(uuid,numeric,timestamptz),
  public.manage_depot_category(uuid,text,uuid,text,integer,integer), public.guard_new_category_assignment(),public.guard_used_category_delete(),
  app_private.clear_depot_value_source() from public,anon,authenticated;
grant execute on function public.create_named_portfolio(text,text,text,text),
  public.save_depot_preferences(uuid,text,text,text,numeric,numeric,numeric,numeric),public.record_depot_value(uuid,numeric,timestamptz),
  public.manage_depot_category(uuid,text,uuid,text,integer,integer) to authenticated;

create or replace function app_private.apply_ibkr_flex_valuation(target_portfolio uuid, source_account text, valuation jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare report_day date; amount numeric;
begin
  if valuation is null or jsonb_typeof(valuation)<>'object' then return; end if;
  if valuation->'netAssetValue' is not null then
    report_day:=(valuation->'netAssetValue'->>'date')::date;
    amount:=(valuation->'netAssetValue'->>'total')::numeric;
    if report_day<=(now() at time zone 'Europe/Berlin')::date and amount>=0 and amount<1e15 then
      update public.portfolios set net_liquidity=amount, net_liquidity_source='ibkr_flex', data_as_of=report_day::timestamp at time zone 'Europe/Berlin'
      where id=target_portfolio and user_id=auth.uid() and (data_as_of is null or data_as_of<=report_day::timestamp at time zone 'Europe/Berlin');
    end if;
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
