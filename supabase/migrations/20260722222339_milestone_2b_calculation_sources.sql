-- Milestone 2B adds source fields only. Stored market/risk values remain
-- compatibility caches; the TypeScript calculation engine is authoritative.

alter table public.portfolios
  add column cash_balance numeric(18,6) check (cash_balance is null or cash_balance >= 0),
  add column data_as_of timestamptz;

alter table public.positions
  alter column market_value drop not null,
  add column instrument_currency text check (
    instrument_currency is null or instrument_currency ~ '^[A-Z]{3}$'
  ),
  add column fx_to_base numeric(24,12) check (fx_to_base is null or fx_to_base > 0),
  add column strategy text check (strategy is null or char_length(strategy) <= 200),
  add column data_as_of timestamptz;

comment on column public.positions.market_value is
  'Legacy compatibility cache. The central TypeScript calculation engine is the authoritative source.';
comment on column public.positions.risk_amount is
  'Legacy compatibility cache. Stop risk is recalculated from current source inputs.';
comment on column public.portfolios.margin_used_pct is
  'Legacy compatibility field. Margin utilization is calculated from position source inputs.';
comment on column public.portfolios.risk_budget_used_pct is
  'Legacy compatibility field. No authoritative risk-budget formula exists before milestone 2D.';
comment on column public.positions.fx_to_base is
  'Value of one instrument-currency unit in portfolio base currency; always multiplied.';

create or replace function public.replace_portfolio_snapshot_v2(
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
      fx_to_base numeric,
      data_as_of timestamptz,
      entry_date date,
      stop_price numeric,
      market_value numeric,
      risk_amount numeric,
      margin_requirement numeric,
      margin_percent numeric,
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
      or position.margin_percent < 0
      or position.fx_to_base <= 0
      or position.strike_price < 0
      or (position.instrument_currency is not null and position.instrument_currency !~ '^[A-Z]{3}$')
      or position.instrument_type is null
      or position.instrument_type not in ('stock', 'etf', 'option', 'cash', 'other')
      or position.direction is null
      or position.direction not in ('long', 'short', 'long_put', 'long_call', 'short_put', 'short_call')
      or position.status is null
      or position.status not in ('active', 'watch', 'high', 'danger', 'closed')
      or (position.instrument_type = 'option' and (
        position.option_type not in ('call', 'put')
        or position.strike_price is null
        or position.expiration_date is null
      ))
      or char_length(coalesce(position.external_position_id, '')) > 200
      or char_length(coalesce(position.instrument_name, '')) > 300
      or char_length(coalesce(position.category_name, '')) > 100
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
    instrument_currency, fx_to_base, data_as_of, stop_price, market_value, risk_amount,
    margin_requirement, margin_percent, sector, strategy, entry_date, status, notes,
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
    position.fx_to_base,
    position.data_as_of,
    position.stop_price,
    position.market_value,
    position.risk_amount,
    position.margin_requirement,
    position.margin_percent,
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
    fx_to_base numeric,
    data_as_of timestamptz,
    entry_date date,
    stop_price numeric,
    market_value numeric,
    risk_amount numeric,
    margin_requirement numeric,
    margin_percent numeric,
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

revoke all on function public.replace_portfolio_snapshot_v2(
  uuid, text, jsonb, text[], integer, integer, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.replace_portfolio_snapshot_v2(
  uuid, text, jsonb, text[], integer, integer, integer, jsonb
) to authenticated;

comment on function public.replace_portfolio_snapshot_v2(
  uuid, text, jsonb, text[], integer, integer, integer, jsonb
) is 'Atomic custom CSV snapshot import. Derived cache values must be produced by calculation engine 2B before invocation.';
