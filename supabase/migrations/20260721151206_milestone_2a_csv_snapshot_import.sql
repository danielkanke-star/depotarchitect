create table public.portfolio_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  source_type text not null check (source_type in ('csv')),
  original_filename text not null check (
    char_length(original_filename) between 1 and 255
    and original_filename !~ '[[:cntrl:]/\\]'
  ),
  imported_at timestamptz not null default now(),
  total_rows integer not null check (total_rows >= 0),
  valid_rows integer not null check (valid_rows >= 0),
  warning_rows integer not null check (warning_rows >= 0),
  rejected_rows integer not null check (rejected_rows >= 0),
  import_status text not null check (import_status in ('processing', 'completed', 'failed')),
  replaced_position_count integer not null default 0 check (replaced_position_count >= 0),
  inserted_position_count integer not null default 0 check (inserted_position_count >= 0),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object'
    and pg_column_size(metadata) <= 8192
  ),
  created_at timestamptz not null default now(),
  check (valid_rows + rejected_rows = total_rows),
  check (warning_rows <= valid_rows)
);

create index portfolio_imports_user_id_idx on public.portfolio_imports(user_id);
create index portfolio_imports_portfolio_imported_at_idx
  on public.portfolio_imports(portfolio_id, imported_at desc);

alter table public.portfolio_imports enable row level security;

create policy portfolio_imports_select_own
  on public.portfolio_imports for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.portfolio_imports from public, anon, authenticated;
grant select on public.portfolio_imports to authenticated;

alter table public.portfolios
  alter column net_liquidity drop not null,
  alter column net_liquidity drop default,
  alter column margin_used_pct drop not null,
  alter column margin_used_pct drop default,
  alter column risk_budget_used_pct drop not null,
  alter column risk_budget_used_pct drop default;

alter table public.positions
  alter column risk_amount drop not null,
  alter column risk_amount drop default,
  alter column margin_requirement drop not null,
  alter column margin_requirement drop default,
  add column external_position_id text,
  add column margin_percent numeric(8,3) check (margin_percent >= 0),
  add column option_type text check (option_type in ('call', 'put')),
  add column strike_price numeric(18,6) check (strike_price >= 0),
  add column expiration_date date,
  add column source_type text not null default 'manual'
    check (source_type in ('demo', 'manual', 'csv')),
  add column source_import_id uuid references public.portfolio_imports(id) on delete cascade,
  add column imported_at timestamptz;

update public.positions
set source_type = 'demo'
where notes = 'Beispieldatensatz für Meilenstein 1';

create index positions_source_import_id_idx on public.positions(source_import_id);
create index positions_external_position_id_idx
  on public.positions(user_id, portfolio_id, external_position_id)
  where external_position_id is not null;

create or replace function public.enforce_position_provenance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.notes = 'Beispieldatensatz für Meilenstein 1'
     and new.source_import_id is null then
    new.source_type := 'demo';
  end if;

  if tg_op = 'UPDATE' and (
    new.source_type is distinct from old.source_type
    or new.source_import_id is distinct from old.source_import_id
    or new.imported_at is distinct from old.imported_at
  ) then
    raise exception 'Position provenance cannot be changed' using errcode = '22023';
  end if;

  if new.source_type = 'csv' then
    if new.source_import_id is null or new.imported_at is null then
      raise exception 'CSV positions require import provenance' using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.portfolio_imports as imports
      where imports.id = new.source_import_id
        and imports.user_id = new.user_id
        and imports.portfolio_id = new.portfolio_id
        and imports.source_type = 'csv'
        and imports.import_status in ('processing', 'completed')
    ) then
      raise exception 'CSV import provenance does not match the position' using errcode = '23514';
    end if;
  elsif new.source_import_id is not null or new.imported_at is not null then
    raise exception 'Only CSV positions may reference an import' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_position_provenance() from public, anon, authenticated;

create trigger positions_enforce_provenance
  before insert or update on public.positions
  for each row execute function public.enforce_position_provenance();

create or replace function public.replace_portfolio_snapshot(
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
  derived_market_value_count integer;
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

  if normalized_positions is null
     or jsonb_typeof(normalized_positions) <> 'array' then
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
      entry_date date,
      stop_price numeric,
      market_value numeric,
      risk_amount numeric,
      margin_requirement numeric,
      margin_percent numeric,
      sector text,
      notes text,
      option_type text,
      strike_price numeric,
      expiration_date date
    )
    where position.ticker is null or char_length(btrim(position.ticker)) not between 1 and 40
      or position.quantity is null or position.quantity <= 0
      or position.multiplier is null or position.multiplier <= 0
      or (position.market_value is null and position.current_price is null)
      or position.entry_price < 0
      or position.current_price < 0
      or position.stop_price < 0
      or position.market_value < 0
      or position.risk_amount < 0
      or position.margin_requirement < 0
      or position.margin_percent < 0
      or position.strike_price < 0
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
    'parser_version', '2a-1'
  );

  insert into public.portfolio_imports (
    user_id,
    portfolio_id,
    source_type,
    original_filename,
    total_rows,
    valid_rows,
    warning_rows,
    rejected_rows,
    import_status,
    replaced_position_count,
    metadata
  ) values (
    current_user_id,
    target_portfolio,
    'csv',
    btrim(original_filename),
    total_rows,
    valid_row_count,
    warning_rows,
    rejected_rows,
    'processing',
    replaced_count,
    safe_metadata
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
    portfolio_id,
    user_id,
    category_id,
    external_position_id,
    ticker,
    instrument_name,
    instrument_type,
    direction,
    quantity,
    multiplier,
    entry_price,
    current_price,
    stop_price,
    market_value,
    risk_amount,
    margin_requirement,
    margin_percent,
    sector,
    entry_date,
    status,
    notes,
    option_type,
    strike_price,
    expiration_date,
    source_type,
    source_import_id,
    imported_at
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
    position.stop_price,
    coalesce(
      position.market_value,
      round(position.quantity * position.multiplier * position.current_price, 2)
    ),
    position.risk_amount,
    position.margin_requirement,
    position.margin_percent,
    nullif(btrim(position.sector), ''),
    position.entry_date,
    position.status,
    nullif(btrim(position.notes), ''),
    position.option_type,
    position.strike_price,
    position.expiration_date,
    'csv',
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
    entry_date date,
    stop_price numeric,
    market_value numeric,
    risk_amount numeric,
    margin_requirement numeric,
    margin_percent numeric,
    sector text,
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

  select count(*) into derived_market_value_count
  from jsonb_to_recordset(normalized_positions) as position(
    market_value numeric,
    current_price numeric
  )
  where position.market_value is null and position.current_price is not null;

  update public.portfolios
  set net_liquidity = null,
      margin_used_pct = null,
      risk_budget_used_pct = null,
      updated_at = now()
  where id = target_portfolio and user_id = current_user_id;

  update public.portfolio_imports
  set import_status = 'completed',
      inserted_position_count = inserted_count,
      metadata = safe_metadata || jsonb_build_object(
        'derived_market_values', derived_market_value_count
      )
  where id = import_id;

  return jsonb_build_object(
    'import_id', import_id,
    'replaced_position_count', replaced_count,
    'inserted_position_count', inserted_count,
    'derived_market_value_count', derived_market_value_count
  );
end;
$$;

revoke all on function public.replace_portfolio_snapshot(
  uuid, text, jsonb, text[], integer, integer, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.replace_portfolio_snapshot(
  uuid, text, jsonb, text[], integer, integer, integer, jsonb
) to authenticated;

create or replace function public.get_admin_user_directory()
returns table (
  user_id uuid,
  email text,
  registered_at timestamptz,
  email_confirmed boolean,
  last_login_at timestamptz,
  last_seen_at timestamptz,
  account_status public.account_status,
  plan text,
  portfolio_count bigint,
  position_count bigint,
  last_import_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin_aal2() then
    raise exception 'Admin MFA required' using errcode = '42501';
  end if;

  return query
  select
    users.id,
    users.email::text,
    users.created_at,
    users.email_confirmed_at is not null,
    users.last_sign_in_at,
    profiles.last_seen_at,
    profiles.account_status,
    profiles.plan,
    (select count(*) from public.portfolios where public.portfolios.user_id = users.id),
    (select count(*) from public.positions where public.positions.user_id = users.id),
    (
      select max(imports.imported_at)
      from public.portfolio_imports as imports
      where imports.user_id = users.id
        and imports.import_status = 'completed'
    )
  from auth.users as users
  join public.user_profiles as profiles on profiles.user_id = users.id
  order by users.created_at desc;
end;
$$;

create or replace function public.get_admin_user_detail(
  target_user uuid,
  audit_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin_aal2() then
    raise exception 'Admin MFA required' using errcode = '42501';
  end if;

  insert into public.admin_audit_log (
    admin_user_id, action, target_user_id, target_type, request_id, metadata
  ) values (
    auth.uid(), 'user_detail.open', target_user, 'user', audit_request_id,
    jsonb_build_object('surface', 'admin_user_detail')
  );

  select jsonb_build_object(
    'user_id', users.id,
    'email', users.email,
    'registered_at', users.created_at,
    'email_confirmed', users.email_confirmed_at is not null,
    'last_login_at', users.last_sign_in_at,
    'last_seen_at', profiles.last_seen_at,
    'account_status', profiles.account_status,
    'plan', profiles.plan,
    'portfolio_count', (
      select count(*) from public.portfolios
      where public.portfolios.user_id = users.id
    ),
    'position_count', (
      select count(*) from public.positions
      where public.positions.user_id = users.id
    ),
    'last_import_at', (
      select max(imports.imported_at)
      from public.portfolio_imports as imports
      where imports.user_id = users.id
        and imports.import_status = 'completed'
    ),
    'deletion_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', requests.id,
        'requested_at', requests.requested_at,
        'status', requests.status,
        'processed_at', requests.processed_at
      ) order by requests.requested_at desc)
      from public.account_deletion_requests as requests
      where requests.user_id = users.id
    ), '[]'::jsonb)
  ) into result
  from auth.users as users
  join public.user_profiles as profiles on profiles.user_id = users.id
  where users.id = target_user;

  if result is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  return result;
end;
$$;

revoke all on function public.get_admin_user_directory() from public, anon, authenticated;
revoke all on function public.get_admin_user_detail(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_admin_user_directory() to authenticated;
grant execute on function public.get_admin_user_detail(uuid, uuid) to authenticated;
