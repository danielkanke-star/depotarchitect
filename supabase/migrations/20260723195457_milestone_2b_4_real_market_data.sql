-- Milestone 2B.4 makes manually maintained real market data distinguishable
-- from demo, stale, legacy and missing values. The migration is additive and
-- retains every 2B/2B.1 compatibility column.

alter table public.positions
  add column current_price_native numeric(24,8) check (
    current_price_native is null or current_price_native >= 0
  ),
  add column stop_price_native numeric(24,8) check (
    stop_price_native is null or stop_price_native >= 0
  ),
  add column stop_updated_at timestamptz,
  add column stop_comment text check (
    stop_comment is null or char_length(stop_comment) <= 500
  ),
  add column margin_currency text check (
    margin_currency is null or margin_currency ~ '^[A-Z]{3}$'
  ),
  add column margin_as_of timestamptz,
  add column margin_calculation_type text check (
    margin_calculation_type is null or margin_calculation_type in (
      'direct_requirement', 'rate_estimate', 'not_applicable'
    )
  ),
  add column margin_confidence text not null default 'missing' check (
    margin_confidence in (
      'trusted', 'estimated', 'untrusted', 'missing', 'not_applicable'
    )
  );

alter table public.positions
  drop constraint if exists positions_current_price_status_check,
  drop constraint if exists positions_current_fx_status_check;

alter table public.positions
  add constraint positions_current_price_status_check
  check (
    current_price_status is null or current_price_status in (
      'live', 'delayed', 'end_of_day', 'manually_updated',
      'stale', 'missing', 'demo',
      'closing', 'imported', 'manual'
    )
  ),
  add constraint positions_current_fx_status_check
  check (
    current_fx_status is null or current_fx_status in (
      'live', 'delayed', 'end_of_day', 'manually_updated',
      'stale', 'missing', 'demo',
      'closing', 'imported', 'manual'
    )
  );

update public.positions
set current_price_native = current_price,
    stop_price_native = stop_price,
    stop_updated_at = case when stop_price is null then null else updated_at end,
    current_price_status = case
      when current_price is null then 'missing'
      when source_type = 'demo' then 'demo'
      when current_price_status = 'closing' then 'end_of_day'
      when current_price_status in ('manual', 'imported') then 'manually_updated'
      when current_price_status is null then 'stale'
      else current_price_status
    end,
    current_fx_status = case
      when upper(instrument_currency) = upper(
        (select portfolios.currency from public.portfolios where portfolios.id = positions.portfolio_id)
      ) then 'manually_updated'
      when current_fx_to_base is null then 'missing'
      when source_type = 'demo' then 'demo'
      when current_fx_status = 'closing' then 'end_of_day'
      when current_fx_status in ('manual', 'imported') then 'manually_updated'
      when current_fx_status is null then 'stale'
      else current_fx_status
    end,
    margin_currency = case
      when margin_requirement is null then null
      else upper((select portfolios.currency from public.portfolios where portfolios.id = positions.portfolio_id))
    end,
    margin_as_of = case
      when margin_requirement is null and margin_rate is null then null
      else coalesce(data_as_of, updated_at)
    end,
    margin_calculation_type = case
      when margin_source in ('broker', 'imported_direct', 'manual_direct') then 'direct_requirement'
      when margin_source = 'estimated' then 'rate_estimate'
      else null
    end,
    margin_confidence = case
      when margin_source in ('broker', 'imported_direct', 'manual_direct') then 'trusted'
      when margin_source = 'estimated' then 'estimated'
      when margin_source = 'legacy_untrusted' then 'untrusted'
      else 'missing'
    end;

alter table public.portfolio_cash_balances
  add column fx_source text check (
    fx_source is null or char_length(fx_source) <= 100
  ),
  add column fx_status text check (
    fx_status is null or fx_status in (
      'live', 'delayed', 'end_of_day', 'manually_updated',
      'stale', 'missing', 'demo'
    )
  );

update public.portfolio_cash_balances as cash
set fx_source = case
      when upper(cash.currency) = upper(portfolios.currency) then 'identity'
      else coalesce(cash.source_reference, cash.source_type)
    end,
    fx_status = case
      when upper(cash.currency) = upper(portfolios.currency) then 'manually_updated'
      when cash.current_fx_to_base is null then 'missing'
      when cash.source_type = 'demo' then 'demo'
      when cash.fx_as_of is null then 'stale'
      else 'manually_updated'
    end
from public.portfolios
where portfolios.id = cash.portfolio_id;

create table public.portfolio_fx_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  source_currency text not null check (source_currency ~ '^[A-Z]{3}$'),
  target_currency text not null check (target_currency ~ '^[A-Z]{3}$'),
  rate numeric(24,12) not null check (rate > 0),
  source_type text not null check (
    source_type in ('manual', 'broker', 'market_data_provider', 'demo')
  ),
  source_name text not null check (
    char_length(btrim(source_name)) between 1 and 100
  ),
  rate_as_of timestamptz not null,
  status text not null check (
    status in (
      'live', 'delayed', 'end_of_day', 'manually_updated',
      'stale', 'missing', 'demo'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_currency <> target_currency)
);

create index portfolio_fx_rates_user_id_idx
  on public.portfolio_fx_rates(user_id);

create index portfolio_fx_rates_portfolio_pair_as_of_idx
  on public.portfolio_fx_rates(
    portfolio_id, source_currency, target_currency, rate_as_of desc
  );

alter table public.portfolio_fx_rates enable row level security;

create policy "portfolio_fx_rates_select_own"
  on public.portfolio_fx_rates
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "portfolio_fx_rates_insert_own"
  on public.portfolio_fx_rates
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "portfolio_fx_rates_update_own"
  on public.portfolio_fx_rates
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "portfolio_fx_rates_delete_own"
  on public.portfolio_fx_rates
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.portfolio_fx_rates from public, anon, authenticated;
grant select, insert, update, delete on public.portfolio_fx_rates to authenticated;

create function public.normalize_portfolio_fx_rate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  portfolio_owner uuid;
  portfolio_currency text;
begin
  select portfolios.user_id, upper(portfolios.currency)
  into portfolio_owner, portfolio_currency
  from public.portfolios
  where portfolios.id = new.portfolio_id;

  if portfolio_owner is null or portfolio_owner <> new.user_id then
    raise exception 'FX rate portfolio ownership mismatch' using errcode = '42501';
  end if;

  new.source_currency := upper(btrim(new.source_currency));
  new.target_currency := upper(btrim(new.target_currency));
  new.source_name := btrim(new.source_name);

  if new.target_currency <> portfolio_currency then
    raise exception 'FX target currency must match portfolio base currency' using errcode = '22023';
  end if;

  if new.source_type = 'demo' then
    new.status := 'demo';
  elsif new.status = 'demo' then
    raise exception 'Demo status requires demo source' using errcode = '22023';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.normalize_portfolio_fx_rate()
  from public, anon, authenticated;

create trigger portfolio_fx_rates_normalize
  before insert or update on public.portfolio_fx_rates
  for each row execute function public.normalize_portfolio_fx_rate();

create or replace function public.normalize_position_calculation_sources()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  portfolio_owner uuid;
  portfolio_currency text;
begin
  select portfolios.user_id, upper(portfolios.currency)
  into portfolio_owner, portfolio_currency
  from public.portfolios
  where portfolios.id = new.portfolio_id;

  if portfolio_owner is null or portfolio_owner <> new.user_id then
    raise exception 'Position portfolio ownership mismatch' using errcode = '42501';
  end if;

  new.instrument_currency := nullif(upper(btrim(new.instrument_currency)), '');

  if tg_op = 'INSERT' then
    new.current_price_native := coalesce(new.current_price_native, new.current_price);
    new.current_price := new.current_price_native;
    new.stop_price_native := coalesce(new.stop_price_native, new.stop_price);
    new.stop_price := new.stop_price_native;
  else
    if new.current_price_native is distinct from old.current_price_native then
      new.current_price := new.current_price_native;
    elsif new.current_price is distinct from old.current_price then
      new.current_price_native := new.current_price;
    end if;
    if new.stop_price_native is distinct from old.stop_price_native then
      new.stop_price := new.stop_price_native;
    elsif new.stop_price is distinct from old.stop_price then
      new.stop_price_native := new.stop_price;
    end if;
  end if;

  if new.instrument_currency = portfolio_currency then
    if new.current_fx_to_base is not null and new.current_fx_to_base <> 1 then
      raise exception 'Base-currency positions require current_fx_to_base = 1' using errcode = '22023';
    end if;
    new.current_fx_to_base := 1;
    new.current_fx_source := 'identity';
    new.current_fx_status := 'manually_updated';
  end if;

  if new.source_type = 'demo' then
    if new.current_price_native is not null and new.current_price_status is null then
      new.current_price_status := 'demo';
    end if;
    if new.instrument_currency <> portfolio_currency
       and new.current_fx_to_base is not null
       and new.current_fx_status is null then
      new.current_fx_status := 'demo';
    end if;
  end if;

  if new.current_price_native is null then
    new.current_price_source := null;
    new.current_price_as_of := null;
    new.current_price_status := 'missing';
  end if;

  if new.margin_source in ('missing', 'legacy_untrusted')
     and new.margin_requirement is not null then
    new.margin_source := case
      when new.source_type in ('csv', 'custom_csv') then 'imported_direct'
      else 'manual_direct'
    end;
  elsif new.margin_source = 'missing' and new.margin_rate is not null then
    new.margin_source := 'estimated';
  end if;

  if new.margin_source in ('broker', 'imported_direct', 'manual_direct')
     and new.margin_requirement is null then
    raise exception 'Direct margin provenance requires a direct value' using errcode = '22023';
  end if;

  new.margin_calculation_type := case
    when new.margin_source in ('broker', 'imported_direct', 'manual_direct') then 'direct_requirement'
    when new.margin_source = 'estimated' then 'rate_estimate'
    else null
  end;
  new.margin_confidence := case
    when new.margin_source in ('broker', 'imported_direct', 'manual_direct') then 'trusted'
    when new.margin_source = 'estimated' then 'estimated'
    when new.margin_source = 'legacy_untrusted' then 'untrusted'
    else 'missing'
  end;
  new.margin_currency := case
    when new.margin_requirement is null then null
    else coalesce(upper(new.margin_currency), portfolio_currency)
  end;
  new.updated_at := now();
  return new;
end;
$$;

comment on column public.positions.current_price_native is
  'Current position price in instrument currency. current_price remains a compatibility mirror.';
comment on column public.positions.stop_price_native is
  'Trading stop in instrument currency. stop_price remains a compatibility mirror.';
comment on table public.portfolio_fx_rates is
  'Historized FX quotes normalized as one source-currency unit in portfolio base currency.';
