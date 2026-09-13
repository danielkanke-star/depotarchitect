-- Preserve legacy imports that have a current price but no instrument currency.
-- A price observation is only meaningful once its listing currency is known.

create or replace function public.capture_position_price_observation()
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
     or new.current_price_status in ('missing', 'demo')
     or nullif(btrim(new.ticker), '') is null
     or new.instrument_currency is null
     or upper(btrim(new.instrument_currency)) !~ '^[A-Z]{3}$' then
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
