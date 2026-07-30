-- Additive, broker-neutral current-price observations. Source values remain
-- separate; the application resolves the canonical price by quality priority.

create table public.position_price_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  position_id uuid not null references public.positions(id) on delete cascade,
  ticker text not null check (char_length(btrim(ticker)) between 1 and 40),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  price_native numeric(24,8) not null check (price_native >= 0),
  source_type text not null check (
    source_type in (
      'ibkr', 'broker', 'google_sheets', 'custom_csv',
      'market_data_provider', 'manual', 'legacy'
    )
  ),
  source_name text not null check (
    char_length(btrim(source_name)) between 1 and 100
  ),
  observed_at timestamptz not null,
  status text not null check (
    status in (
      'live', 'delayed', 'end_of_day', 'manually_updated', 'stale'
    )
  ),
  source_reference text check (
    source_reference is null or char_length(source_reference) <= 200
  ),
  created_at timestamptz not null default now(),
  unique (position_id, source_type, observed_at, price_native)
);

create index position_price_observations_owner_idx
  on public.position_price_observations(user_id, portfolio_id);

create index position_price_observations_resolution_idx
  on public.position_price_observations(position_id, source_type, observed_at desc);

alter table public.position_price_observations enable row level security;

create policy "position_price_observations_select_own"
  on public.position_price_observations
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "position_price_observations_insert_own"
  on public.position_price_observations
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.positions
      where positions.id = position_price_observations.position_id
        and positions.portfolio_id = position_price_observations.portfolio_id
        and positions.user_id = position_price_observations.user_id
        and positions.ticker = position_price_observations.ticker
        and upper(positions.instrument_currency) = position_price_observations.currency
    )
  );

revoke all on public.position_price_observations
  from public, anon, authenticated;
grant select, insert on public.position_price_observations to authenticated;

create function public.capture_position_price_observation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  observed_price numeric(24,8);
  normalized_source_type text;
  normalized_source_name text;
  normalized_status text;
  normalized_observed_at timestamptz;
begin
  observed_price := coalesce(new.current_price_native, new.current_price);

  if new.source_type = 'demo'
     or observed_price is null
     or new.current_price_status in ('missing', 'demo') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.current_price_native is not distinct from old.current_price_native
     and new.current_price is not distinct from old.current_price
     and new.current_price_source is not distinct from old.current_price_source
     and new.current_price_status is not distinct from old.current_price_status
     and new.current_price_as_of is not distinct from old.current_price_as_of
     and new.ticker is not distinct from old.ticker
     and new.instrument_currency is not distinct from old.instrument_currency
     and new.source_type is not distinct from old.source_type then
    return new;
  end if;

  normalized_source_type := case
    when lower(coalesce(new.current_price_source, '')) like '%ibkr%'
      or lower(coalesce(new.current_price_source, '')) like '%interactive brokers%'
      then 'ibkr'
    when lower(coalesce(new.current_price_source, '')) like '%google%sheet%'
      then 'google_sheets'
    when lower(coalesce(new.current_price_source, '')) like '%broker%'
      then 'broker'
    when lower(coalesce(new.current_price_source, '')) like '%provider%'
      or lower(coalesce(new.current_price_source, '')) like '%market%'
      then 'market_data_provider'
    when lower(coalesce(new.current_price_source, '')) in ('manual', 'manuell', 'manuelle eingabe')
      then 'manual'
    when new.source_type in ('csv', 'custom_csv') then 'custom_csv'
    when new.source_type = 'manual' then 'manual'
    else 'legacy'
  end;

  normalized_source_name := case normalized_source_type
    when 'ibkr' then coalesce(nullif(btrim(new.current_price_source), ''), 'IBKR')
    when 'broker' then coalesce(nullif(btrim(new.current_price_source), ''), 'Broker')
    when 'google_sheets' then coalesce(nullif(btrim(new.current_price_source), ''), 'Google Sheets')
    when 'custom_csv' then coalesce(nullif(btrim(new.current_price_source), ''), 'CSV-Import')
    when 'market_data_provider' then coalesce(nullif(btrim(new.current_price_source), ''), 'Marktdatenanbieter')
    when 'manual' then 'Manuelle Eingabe'
    else coalesce(nullif(btrim(new.current_price_source), ''), 'Legacy-Kurs')
  end;

  normalized_status := case
    when new.current_price_status in ('live', 'delayed', 'end_of_day', 'manually_updated', 'stale')
      then new.current_price_status
    when new.current_price_status = 'closing' then 'end_of_day'
    when new.current_price_status in ('manual', 'imported') then 'manually_updated'
    else 'stale'
  end;

  normalized_observed_at := coalesce(
    new.current_price_as_of,
    new.data_as_of,
    new.imported_at,
    new.updated_at,
    now()
  );

  insert into public.position_price_observations (
    user_id,
    portfolio_id,
    position_id,
    ticker,
    currency,
    price_native,
    source_type,
    source_name,
    observed_at,
    status,
    source_reference
  ) values (
    new.user_id,
    new.portfolio_id,
    new.id,
    upper(btrim(new.ticker)),
    upper(btrim(new.instrument_currency)),
    observed_price,
    normalized_source_type,
    left(normalized_source_name, 100),
    normalized_observed_at,
    normalized_status,
    case
      when normalized_source_type = 'custom_csv' then new.source_import_id::text
      else null
    end
  )
  on conflict (position_id, source_type, observed_at, price_native) do nothing;

  return new;
end;
$$;

revoke all on function public.capture_position_price_observation()
  from public, anon, authenticated;

create trigger positions_capture_price_observation
  after insert or update of
    current_price_native,
    current_price,
    current_price_source,
    current_price_status,
    current_price_as_of,
    ticker,
    instrument_currency,
    source_type
  on public.positions
  for each row execute function public.capture_position_price_observation();

insert into public.position_price_observations (
  user_id,
  portfolio_id,
  position_id,
  ticker,
  currency,
  price_native,
  source_type,
  source_name,
  observed_at,
  status,
  source_reference
)
select
  positions.user_id,
  positions.portfolio_id,
  positions.id,
  upper(btrim(positions.ticker)),
  upper(btrim(positions.instrument_currency)),
  coalesce(positions.current_price_native, positions.current_price),
  case
    when lower(coalesce(positions.current_price_source, '')) like '%ibkr%'
      or lower(coalesce(positions.current_price_source, '')) like '%interactive brokers%'
      then 'ibkr'
    when lower(coalesce(positions.current_price_source, '')) like '%google%sheet%'
      then 'google_sheets'
    when lower(coalesce(positions.current_price_source, '')) like '%broker%'
      then 'broker'
    when lower(coalesce(positions.current_price_source, '')) like '%provider%'
      or lower(coalesce(positions.current_price_source, '')) like '%market%'
      then 'market_data_provider'
    when lower(coalesce(positions.current_price_source, '')) in ('manual', 'manuell', 'manuelle eingabe')
      then 'manual'
    when positions.source_type in ('csv', 'custom_csv') then 'custom_csv'
    when positions.source_type = 'manual' then 'manual'
    else 'legacy'
  end,
  left(coalesce(nullif(btrim(positions.current_price_source), ''), case
    when positions.source_type in ('csv', 'custom_csv') then 'CSV-Import'
    when positions.source_type = 'manual' then 'Manuelle Eingabe'
    else 'Legacy-Kurs'
  end), 100),
  coalesce(
    positions.current_price_as_of,
    positions.data_as_of,
    positions.imported_at,
    positions.updated_at,
    positions.created_at
  ),
  case
    when positions.current_price_status in ('live', 'delayed', 'end_of_day', 'manually_updated', 'stale')
      then positions.current_price_status
    when positions.current_price_status = 'closing' then 'end_of_day'
    when positions.current_price_status in ('manual', 'imported') then 'manually_updated'
    else 'stale'
  end,
  case
    when positions.source_type in ('csv', 'custom_csv') then positions.source_import_id::text
    else null
  end
from public.positions
where positions.instrument_type <> 'cash'
  and positions.source_type <> 'demo'
  and positions.instrument_currency ~ '^[A-Z]{3}$'
  and coalesce(positions.current_price_native, positions.current_price) is not null
  and coalesce(positions.current_price_native, positions.current_price) >= 0
  and coalesce(positions.current_price_status, 'stale') not in ('missing', 'demo')
on conflict (position_id, source_type, observed_at, price_native) do nothing;
