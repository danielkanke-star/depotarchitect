-- Qualify the requested instrument name so the RPC cannot confuse the input
-- parameter with public.positions.instrument_name during the final update.

create or replace function public.attach_position_listing(
  target_position uuid, provider_name text, listing_symbol text, listing_exchange text,
  listing_mic text, listing_currency text, instrument_name text, provider_instrument_type text,
  listing_country text default null, listing_timezone text default null, user_selected boolean default false
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  owned_position public.positions%rowtype;
  instrument uuid;
  listing uuid;
  requested_instrument_name text := $7;
begin
  if caller is null or provider_name not in ('ibkr','broker','twelve_data','google_sheets','csv','manual')
    or upper(listing_mic) !~ '^[A-Z0-9]{4}$' or upper(listing_currency) !~ '^[A-Z]{3}$' then
    raise exception 'invalid listing';
  end if;
  select * into owned_position from public.positions where id=target_position and user_id=caller for update;
  if not found or owned_position.instrument_type='cash' then raise exception 'position unavailable'; end if;
  select id into listing from public.market_listings where user_id=caller and symbol=upper(btrim(listing_symbol))
    and mic_code=upper(listing_mic) and currency=upper(listing_currency);
  if listing is null then
    insert into public.market_instruments(user_id,name,asset_class,metadata_source,metadata_checked_at)
    values(caller,coalesce(nullif(btrim(requested_instrument_name),''),upper(btrim(listing_symbol))),
      case when owned_position.instrument_type in ('stock','etf','option','warrant','knock_out','other') then owned_position.instrument_type else 'other' end,
      provider_name,now()) returning id into instrument;
    insert into public.market_listings(user_id,instrument_id,symbol,exchange,mic_code,currency,country,exchange_timezone,
      selection_basis,status,metadata_source,metadata_checked_at)
    values(caller,instrument,upper(btrim(listing_symbol)),nullif(btrim(listing_exchange),''),upper(listing_mic),upper(listing_currency),
      nullif(btrim(listing_country),''),nullif(btrim(listing_timezone),''),case when user_selected then 'user_selected' else 'provider_relevance' end,
      'active',provider_name,now()) returning id into listing;
  else
    select instrument_id into instrument from public.market_listings where id=listing;
  end if;
  insert into public.market_listing_provider_mappings(user_id,listing_id,provider,provider_symbol,provider_mic,provider_currency,provider_status,verified_at)
  values(caller,listing,provider_name,upper(btrim(listing_symbol)),upper(listing_mic),upper(listing_currency),'verified',now())
  on conflict (listing_id,provider) do update set provider_symbol=excluded.provider_symbol,provider_mic=excluded.provider_mic,
    provider_currency=excluded.provider_currency,provider_status='verified',verified_at=now(),updated_at=now();
  update public.positions as target
  set listing_id=listing,
    listing_resolution_status='confirmed',
    instrument_name=coalesce(nullif(btrim(requested_instrument_name),''),target.instrument_name),
    ticker=upper(btrim(listing_symbol)),
    instrument_currency=upper(listing_currency),
    updated_at=now()
  where target.id=target_position and target.user_id=caller;
  insert into public.user_instrument_universe(user_id,instrument_id,preferred_listing_id,watchlisted,source_type)
  values(caller,instrument,listing,false,'position')
  on conflict (user_id,instrument_id) do update set preferred_listing_id=excluded.preferred_listing_id,last_seen_at=now();
  return listing;
end;
$$;

revoke all on function public.attach_position_listing(uuid,text,text,text,text,text,text,text,text,text,boolean)
  from public, anon;
grant execute on function public.attach_position_listing(uuid,text,text,text,text,text,text,text,text,text,boolean)
  to authenticated;
