-- Milestone 2B.1 separates currency cash balances from security positions,
-- normalizes margin rates to decimal quotes, and prepares explicit market-data
-- provenance. All changes are additive; 2B legacy columns remain available.

create table public.portfolio_cash_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  broker_account_id uuid,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  balance_native numeric(24,8) not null,
  settled_cash_native numeric(24,8),
  current_fx_to_base numeric(24,12) check (
    current_fx_to_base is null or current_fx_to_base > 0
  ),
  value_base numeric(24,8),
  balance_as_of timestamptz not null,
  fx_as_of timestamptz,
  source_type text not null default 'manual' check (
    source_type in ('manual', 'custom_csv', 'broker', 'demo', 'legacy')
  ),
  source_reference text check (
    source_reference is null or char_length(source_reference) <= 200
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index portfolio_cash_source_currency_without_account_uidx
  on public.portfolio_cash_balances(portfolio_id, source_type, currency)
  where broker_account_id is null;

create unique index portfolio_cash_source_currency_with_account_uidx
  on public.portfolio_cash_balances(portfolio_id, broker_account_id, source_type, currency)
  where broker_account_id is not null;

create index portfolio_cash_balances_user_id_idx
  on public.portfolio_cash_balances(user_id);

create index portfolio_cash_balances_portfolio_id_idx
  on public.portfolio_cash_balances(portfolio_id);

alter table public.portfolio_cash_balances enable row level security;

create policy "cash_balances_select_own"
  on public.portfolio_cash_balances
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "cash_balances_insert_own"
  on public.portfolio_cash_balances
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "cash_balances_update_own"
  on public.portfolio_cash_balances
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "cash_balances_delete_own"
  on public.portfolio_cash_balances
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.portfolio_cash_balances from public, anon, authenticated;
grant select, insert, update, delete on public.portfolio_cash_balances to authenticated;

create function public.calculate_portfolio_cash_value()
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
    raise exception 'Cash balance portfolio ownership mismatch' using errcode = '42501';
  end if;

  new.currency := upper(btrim(new.currency));
  if new.currency = portfolio_currency then
    if new.current_fx_to_base is not null and new.current_fx_to_base <> 1 then
      raise exception 'Base-currency cash requires current_fx_to_base = 1' using errcode = '22023';
    end if;
    new.current_fx_to_base := 1;
  end if;

  new.value_base := case
    when new.current_fx_to_base is null then null
    else new.balance_native * new.current_fx_to_base
  end;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.calculate_portfolio_cash_value()
  from public, anon, authenticated;

create trigger portfolio_cash_balances_calculate_value
  before insert or update on public.portfolio_cash_balances
  for each row execute function public.calculate_portfolio_cash_value();

alter table public.positions
  alter column margin_requirement drop not null,
  alter column margin_requirement drop default,
  alter column risk_amount drop not null,
  alter column risk_amount drop default,
  add column margin_rate numeric(12,10) check (
    margin_rate is null or margin_rate between 0 and 1
  ),
  add column margin_source text not null default 'missing' check (
    margin_source in (
      'broker', 'imported_direct', 'manual_direct',
      'estimated', 'missing', 'legacy_untrusted'
    )
  ),
  add column entry_fx_to_base numeric(24,12) check (
    entry_fx_to_base is null or entry_fx_to_base > 0
  ),
  add column current_fx_to_base numeric(24,12) check (
    current_fx_to_base is null or current_fx_to_base > 0
  ),
  add column current_fx_as_of timestamptz,
  add column current_fx_source text check (
    current_fx_source is null or char_length(current_fx_source) <= 100
  ),
  add column current_fx_status text check (
    current_fx_status is null or current_fx_status in (
      'live', 'delayed', 'closing', 'imported', 'manual', 'stale'
    )
  ),
  add column current_price_as_of timestamptz,
  add column current_price_source text check (
    current_price_source is null or char_length(current_price_source) <= 100
  ),
  add column current_price_status text check (
    current_price_status is null or current_price_status in (
      'live', 'delayed', 'closing', 'imported', 'manual', 'stale'
    )
  );

alter table public.positions
  add constraint positions_instrument_type_check_v3
  check (instrument_type in (
    'stock', 'etf', 'option', 'warrant', 'knock_out', 'cash', 'other'
  )) not valid;

alter table public.positions validate constraint positions_instrument_type_check_v3;
alter table public.positions drop constraint positions_instrument_type_check;
alter table public.positions rename constraint positions_instrument_type_check_v3
  to positions_instrument_type_check;

update public.positions
set margin_rate = margin_percent / 100
where margin_percent is not null
  and margin_percent between 0 and 100;

update public.positions as positions
set current_fx_to_base = case
      when upper(positions.instrument_currency) = upper(portfolios.currency) then 1
      else positions.fx_to_base
    end,
    current_fx_as_of = positions.data_as_of,
    current_fx_source = case
      when positions.fx_to_base is null
        and upper(positions.instrument_currency) <> upper(portfolios.currency) then null
      else positions.source_type
    end,
    current_fx_status = case
      when positions.fx_to_base is null
        and upper(positions.instrument_currency) <> upper(portfolios.currency) then null
      when positions.data_as_of is null then 'stale'
      when positions.source_type in ('csv', 'custom_csv') then 'imported'
      else 'manual'
    end,
    current_price_as_of = positions.data_as_of,
    current_price_source = case when positions.current_price is null then null else positions.source_type end,
    current_price_status = case
      when positions.current_price is null then null
      when positions.data_as_of is null then 'stale'
      when positions.source_type in ('csv', 'custom_csv') then 'imported'
      else 'manual'
    end
from public.portfolios
where portfolios.id = positions.portfolio_id;

-- Only pre-existing, unconfirmed placeholder zeros are cleared. Imported rows
-- and rows carrying a margin percentage are deliberately excluded.
update public.positions
set margin_requirement = null,
    margin_source = 'legacy_untrusted'
where margin_requirement = 0
  and margin_percent is null
  and source_import_id is null
  and source_type in ('demo', 'manual');

update public.positions
set margin_source = case
  when margin_requirement is not null and source_type in ('csv', 'custom_csv') then 'imported_direct'
  when margin_requirement is not null then 'manual_direct'
  when margin_rate is not null then 'estimated'
  when margin_source = 'legacy_untrusted' then 'legacy_untrusted'
  else 'missing'
end;

alter table public.positions
  add constraint positions_margin_source_consistency_check
  check (
    (margin_source in ('broker', 'imported_direct', 'manual_direct') and margin_requirement is not null)
    or (margin_source = 'estimated' and margin_rate is not null)
    or (margin_source in ('missing', 'legacy_untrusted') and margin_requirement is null)
  ) not valid;

alter table public.positions
  validate constraint positions_margin_source_consistency_check;

create function public.normalize_position_calculation_sources()
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
  if new.instrument_currency = portfolio_currency then
    if new.current_fx_to_base is not null and new.current_fx_to_base <> 1 then
      raise exception 'Base-currency positions require current_fx_to_base = 1' using errcode = '22023';
    end if;
    new.current_fx_to_base := 1;
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

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.normalize_position_calculation_sources()
  from public, anon, authenticated;

create trigger positions_normalize_calculation_sources
  before insert or update on public.positions
  for each row execute function public.normalize_position_calculation_sources();

comment on table public.portfolio_cash_balances is
  'Currency cash source balances. Net liquidity remains an independent source value.';
comment on column public.portfolios.cash_balance is
  'Legacy compatibility field. portfolio_cash_balances is the authoritative cash source.';
comment on column public.positions.margin_rate is
  'Canonical decimal margin quote: 25 percent is stored as 0.25.';
comment on column public.positions.margin_percent is
  'Legacy compatibility field. New application code writes margin_rate only.';
comment on column public.positions.fx_to_base is
  'Legacy compatibility field. current_fx_to_base is authoritative for current calculations.';
comment on column public.positions.entry_fx_to_base is
  'Reference FX at position entry; not necessarily an executed currency conversion.';
comment on column public.positions.current_fx_to_base is
  'Current value of one instrument-currency unit in portfolio base currency.';

create function public.replace_portfolio_snapshot_v3(
  target_portfolio uuid,
  original_filename text,
  normalized_positions jsonb,
  new_categories text[],
  total_rows integer,
  warning_rows integer,
  rejected_rows integer,
  import_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  import_id uuid;
  valid_row_count integer;
  replaced_count integer;
  inserted_count integer;
  calculated_market_value_count integer;
  highest_category_sort_order integer;
  safe_metadata jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if target_portfolio is null or not exists (
    select 1 from public.portfolios
    where id = target_portfolio and user_id = current_user_id
  ) then
    raise exception 'Portfolio not found' using errcode = 'P0002';
  end if;

  if original_filename is null
     or char_length(btrim(original_filename)) not between 1 and 255
     or original_filename ~ '[[:cntrl:]/\\]' then
    raise exception 'Invalid filename' using errcode = '22023';
  end if;

  if normalized_positions is null or jsonb_typeof(normalized_positions) <> 'array' then
    raise exception 'Normalized positions must be an array' using errcode = '22023';
  end if;

  valid_row_count := jsonb_array_length(normalized_positions);
  if valid_row_count < 1 or valid_row_count > 2000 then
    raise exception 'The import must contain between 1 and 2000 valid rows' using errcode = '22023';
  end if;

  if total_rows is null or total_rows < valid_row_count
     or rejected_rows is null or rejected_rows < 0
     or total_rows <> valid_row_count + rejected_rows
     or warning_rows is null or warning_rows < 0 or warning_rows > valid_row_count then
    raise exception 'Invalid import counters' using errcode = '22023';
  end if;

  if coalesce(cardinality(new_categories), 0) > 50
     or exists (
       select 1 from unnest(coalesce(new_categories, array[]::text[])) as category_name
       where char_length(btrim(category_name)) not between 1 and 100
     ) then
    raise exception 'Invalid new categories' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(normalized_positions) as position(
      external_position_id text,
      ticker text,
      instrument_name text,
      category_name text,
      status text,
      direction text,
      instrument_type text,
      quantity numeric,
      multiplier numeric,
      entry_price numeric,
      current_price numeric,
      instrument_currency text,
      entry_fx_to_base numeric,
      current_fx_to_base numeric,
      current_fx_as_of timestamptz,
      current_fx_source text,
      current_fx_status text,
      current_price_as_of timestamptz,
      current_price_source text,
      current_price_status text,
      entry_date date,
      stop_price numeric,
      market_value numeric,
      risk_amount numeric,
      margin_requirement numeric,
      margin_rate numeric,
      margin_source text,
      sector text,
      strategy text,
      notes text,
      option_type text,
      strike_price numeric,
      expiration_date date
    )
    where position.ticker is null or char_length(btrim(position.ticker)) not between 1 and 40
      or position.quantity is null or position.quantity <= 0
      or position.multiplier is null or position.multiplier <= 0
      or position.entry_price < 0
      or position.current_price < 0
      or position.stop_price < 0
      or position.market_value < 0
      or position.risk_amount < 0
      or position.margin_requirement < 0
      or position.margin_rate < 0 or position.margin_rate > 1
      or position.entry_fx_to_base <= 0
      or position.current_fx_to_base <= 0
      or position.strike_price < 0
      or (position.instrument_currency is not null and position.instrument_currency !~ '^[A-Z]{3}$')
      or position.instrument_type is null
      or position.instrument_type not in ('stock', 'etf', 'option', 'warrant', 'knock_out', 'cash', 'other')
      or position.direction is null
      or position.direction not in ('long', 'short', 'long_put', 'long_call', 'short_put', 'short_call')
      or position.status is null
      or position.status not in ('active', 'watch', 'high', 'danger', 'closed')
      or position.margin_source is null
      or position.margin_source not in ('imported_direct', 'estimated', 'missing')
      or (position.margin_source = 'imported_direct' and position.margin_requirement is null)
      or (position.margin_source = 'estimated' and position.margin_rate is null)
      or (position.margin_source = 'missing' and position.margin_requirement is not null)
      or (position.current_fx_status is not null and position.current_fx_status not in (
        'live', 'delayed', 'closing', 'imported', 'manual', 'stale'
      ))
      or (position.current_price_status is not null and position.current_price_status not in (
        'live', 'delayed', 'closing', 'imported', 'manual', 'stale'
      ))
      or (position.instrument_type = 'option' and (
        position.option_type not in ('call', 'put')
        or position.strike_price is null
        or position.expiration_date is null
      ))
      or char_length(coalesce(position.external_position_id, '')) > 200
      or char_length(coalesce(position.instrument_name, '')) > 300
      or char_length(coalesce(position.category_name, '')) > 100
      or char_length(coalesce(position.current_fx_source, '')) > 100
      or char_length(coalesce(position.current_price_source, '')) > 100
      or char_length(coalesce(position.sector, '')) > 200
      or char_length(coalesce(position.strategy, '')) > 200
      or char_length(coalesce(position.notes, '')) > 2000
  ) then
    raise exception 'One or more normalized positions are invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(normalized_positions) as position(category_name text)
    where nullif(btrim(position.category_name), '') is not null
      and not exists (
        select 1 from public.portfolio_categories as categories
        where categories.portfolio_id = target_portfolio
          and categories.user_id = current_user_id
          and categories.name = btrim(position.category_name)
      )
      and btrim(position.category_name) <> all(coalesce(new_categories, array[]::text[]))
  ) then
    raise exception 'Every unknown category must be resolved explicitly' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('depotarchitect:csv-import:' || target_portfolio::text, 0)
  );

  select count(*) into replaced_count
  from public.positions
  where portfolio_id = target_portfolio
    and user_id = current_user_id
    and status <> 'closed';

  safe_metadata := jsonb_build_object(
    'delimiter', left(coalesce(import_metadata->>'delimiter', ''), 20),
    'encoding', left(coalesce(import_metadata->>'encoding', 'UTF-8'), 20),
    'header_detected', coalesce((import_metadata->>'header_detected')::boolean, false),
    'parser_version', '2b-1',
    'calculation_version', '2b-1'
  );

  insert into public.portfolio_imports (
    user_id, portfolio_id, source_type, original_filename, total_rows, valid_rows,
    warning_rows, rejected_rows, import_status, replaced_position_count, metadata
  ) values (
    current_user_id, target_portfolio, 'custom_csv', btrim(original_filename), total_rows,
    valid_row_count, warning_rows, rejected_rows, 'processing', replaced_count, safe_metadata
  ) returning id into import_id;

  select coalesce(max(sort_order), -1)
  into highest_category_sort_order
  from public.portfolio_categories
  where portfolio_id = target_portfolio;

  insert into public.portfolio_categories (portfolio_id, user_id, name, sort_order)
  select
    target_portfolio,
    current_user_id,
    btrim(category_name),
    (highest_category_sort_order + row_number() over (order by category_name))::integer
  from (
    select distinct category_name
    from unnest(coalesce(new_categories, array[]::text[])) as category_name
  ) as requested
  on conflict (portfolio_id, name) do nothing;

  delete from public.positions
  where portfolio_id = target_portfolio
    and user_id = current_user_id
    and status <> 'closed';

  insert into public.positions (
    portfolio_id, user_id, category_id, external_position_id, ticker, instrument_name,
    instrument_type, direction, quantity, multiplier, entry_price, current_price,
    instrument_currency, entry_fx_to_base, current_fx_to_base, current_fx_as_of,
    current_fx_source, current_fx_status, current_price_as_of, current_price_source,
    current_price_status, stop_price, market_value, risk_amount, margin_requirement,
    margin_rate, margin_source, sector, strategy, entry_date, status, notes,
    option_type, strike_price, expiration_date, source_type, source_import_id, imported_at
  )
  select
    target_portfolio,
    current_user_id,
    categories.id,
    nullif(btrim(position.external_position_id), ''),
    upper(btrim(position.ticker)),
    nullif(btrim(position.instrument_name), ''),
    position.instrument_type,
    position.direction,
    position.quantity,
    position.multiplier,
    coalesce(position.entry_price, 0),
    position.current_price,
    nullif(upper(btrim(position.instrument_currency)), ''),
    position.entry_fx_to_base,
    position.current_fx_to_base,
    position.current_fx_as_of,
    nullif(btrim(position.current_fx_source), ''),
    position.current_fx_status,
    position.current_price_as_of,
    nullif(btrim(position.current_price_source), ''),
    position.current_price_status,
    position.stop_price,
    position.market_value,
    position.risk_amount,
    position.margin_requirement,
    position.margin_rate,
    position.margin_source,
    nullif(btrim(position.sector), ''),
    nullif(btrim(position.strategy), ''),
    position.entry_date,
    position.status,
    nullif(btrim(position.notes), ''),
    position.option_type,
    position.strike_price,
    position.expiration_date,
    'custom_csv',
    import_id,
    now()
  from jsonb_to_recordset(normalized_positions) as position(
    external_position_id text,
    ticker text,
    instrument_name text,
    category_name text,
    status text,
    direction text,
    instrument_type text,
    quantity numeric,
    multiplier numeric,
    entry_price numeric,
    current_price numeric,
    instrument_currency text,
    entry_fx_to_base numeric,
    current_fx_to_base numeric,
    current_fx_as_of timestamptz,
    current_fx_source text,
    current_fx_status text,
    current_price_as_of timestamptz,
    current_price_source text,
    current_price_status text,
    entry_date date,
    stop_price numeric,
    market_value numeric,
    risk_amount numeric,
    margin_requirement numeric,
    margin_rate numeric,
    margin_source text,
    sector text,
    strategy text,
    notes text,
    option_type text,
    strike_price numeric,
    expiration_date date
  )
  left join public.portfolio_categories as categories
    on categories.portfolio_id = target_portfolio
   and categories.user_id = current_user_id
   and categories.name = nullif(btrim(position.category_name), '');

  get diagnostics inserted_count = row_count;

  select count(*) into calculated_market_value_count
  from jsonb_to_recordset(normalized_positions) as position(market_value numeric)
  where position.market_value is not null;

  update public.portfolio_imports
  set import_status = 'completed',
      inserted_position_count = inserted_count,
      metadata = safe_metadata || jsonb_build_object(
        'calculated_market_values', calculated_market_value_count
      )
  where id = import_id;

  return jsonb_build_object(
    'import_id', import_id,
    'replaced_position_count', replaced_count,
    'inserted_position_count', inserted_count,
    'derived_market_value_count', calculated_market_value_count
  );
end;
$$;

revoke all on function public.replace_portfolio_snapshot_v3(
  uuid, text, jsonb, text[], integer, integer, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.replace_portfolio_snapshot_v3(
  uuid, text, jsonb, text[], integer, integer, integer, jsonb
) to authenticated;

comment on function public.replace_portfolio_snapshot_v3(
  uuid, text, jsonb, text[], integer, integer, integer, jsonb
) is
  'Atomic custom CSV snapshot import using canonical decimal margin rates and explicit current market-data provenance.';
