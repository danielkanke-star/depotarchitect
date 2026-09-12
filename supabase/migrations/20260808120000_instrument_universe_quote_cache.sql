-- Provider-neutral, user-scoped instrument universe and bounded latest-value cache.
-- Additive only. Historical position fields remain as compatibility sources.

create table public.market_instruments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  asset_class text not null check (asset_class in ('stock','etf','option','warrant','knock_out','other')),
  isin text check (isin is null or isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  figi text check (figi is null or figi ~ '^[A-Z0-9]{12}$'),
  identification_status text not null default 'listing_only'
    check (identification_status in ('listing_only','stable_identifier','broker_verified','needs_review')),
  metadata_source text not null,
  metadata_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.market_instruments add constraint market_instruments_user_id_id_unique unique (user_id,id);

create unique index market_instruments_user_isin_unique
  on public.market_instruments(user_id, isin) where isin is not null;
create unique index market_instruments_user_figi_unique
  on public.market_instruments(user_id, figi) where figi is not null;

create table public.market_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  instrument_id uuid not null,
  symbol text not null check (char_length(symbol) between 1 and 40),
  exchange text check (exchange is null or char_length(exchange) <= 120),
  mic_code text not null check (mic_code ~ '^[A-Z0-9]{4}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  country text check (country is null or char_length(country) <= 100),
  exchange_timezone text check (exchange_timezone is null or char_length(exchange_timezone) <= 80),
  selection_basis text not null default 'provider_relevance'
    check (selection_basis in ('provider_relevance','user_selected','broker_verified','imported','needs_confirmation')),
  status text not null default 'active' check (status in ('active','inactive','needs_confirmation')),
  metadata_source text not null,
  metadata_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, symbol, mic_code, currency),
  unique (user_id, id)
);
alter table public.market_listings add constraint market_listings_owned_instrument_fk
  foreign key (user_id,instrument_id) references public.market_instruments(user_id,id) on delete restrict;
create index market_listings_instrument_idx on public.market_listings(user_id, instrument_id);

create table public.market_listing_provider_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null,
  provider text not null check (provider in ('ibkr','broker','twelve_data','google_sheets','csv','manual')),
  provider_symbol text not null check (char_length(provider_symbol) between 1 and 80),
  provider_mic text not null check (provider_mic ~ '^[A-Z0-9]{4}$'),
  provider_currency text not null check (provider_currency ~ '^[A-Z]{3}$'),
  provider_status text not null default 'verified' check (provider_status in ('verified','unverified','inactive','needs_review')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, provider),
  unique (user_id, provider, provider_symbol, provider_mic, provider_currency)
);
alter table public.market_listing_provider_mappings add constraint market_listing_provider_mappings_owned_listing_fk
  foreign key (user_id,listing_id) references public.market_listings(user_id,id) on delete cascade;
create index market_listing_provider_mappings_owner_idx on public.market_listing_provider_mappings(user_id, listing_id);

create table public.user_instrument_universe (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  instrument_id uuid not null,
  preferred_listing_id uuid,
  watchlisted boolean not null default false,
  source_type text not null check (source_type in ('position','watchlist','import','broker','manual')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, instrument_id)
);
alter table public.user_instrument_universe add constraint user_instrument_universe_owned_instrument_fk
  foreign key (user_id,instrument_id) references public.market_instruments(user_id,id) on delete restrict;
alter table public.user_instrument_universe add constraint user_instrument_universe_owned_listing_fk
  foreign key (user_id,preferred_listing_id) references public.market_listings(user_id,id) on delete set null (preferred_listing_id);

alter table public.positions
  add column listing_id uuid references public.market_listings(id) on delete restrict,
  add column listing_resolution_status text not null default 'needs_confirmation'
    check (listing_resolution_status in ('confirmed','needs_confirmation','not_applicable'));
update public.positions set listing_resolution_status = 'not_applicable' where instrument_type = 'cash';
create index positions_listing_idx on public.positions(user_id, listing_id) where listing_id is not null;
alter table public.positions add constraint positions_owned_listing_fk
  foreign key (user_id,listing_id) references public.market_listings(user_id,id) on delete restrict;

create table public.market_listing_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null,
  provider text not null check (provider in ('ibkr','broker','twelve_data','google_sheets','csv','manual')),
  price_native numeric not null check (price_native >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  observed_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  status text not null check (status in ('live','delayed','closing','end_of_day','imported','manual','stale')),
  is_market_open boolean,
  failure_code text check (failure_code is null or char_length(failure_code) <= 40),
  backoff_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, provider)
);
alter table public.market_listing_quotes add constraint market_listing_quotes_owned_listing_fk
  foreign key (user_id,listing_id) references public.market_listings(user_id,id) on delete cascade;
create index market_listing_quotes_owner_listing_idx on public.market_listing_quotes(user_id, listing_id, fetched_at desc);

create table public.market_fx_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_currency text not null check (source_currency ~ '^[A-Z]{3}$'),
  target_currency text not null check (target_currency ~ '^[A-Z]{3}$'),
  provider text not null check (provider in ('ibkr','broker','twelve_data','google_sheets','csv','manual','identity')),
  rate numeric not null check (rate > 0),
  observed_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  status text not null check (status in ('live','delayed','closing','end_of_day','imported','manual','stale')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_currency, target_currency, provider),
  check ((source_currency = target_currency and rate = 1) or source_currency <> target_currency)
);

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table app_private.market_data_provider_policies (
  provider text primary key,
  provider_minute_limit integer not null check (provider_minute_limit > 0),
  provider_day_limit integer not null check (provider_day_limit > 0),
  automatic_minute_limit integer not null check (automatic_minute_limit > 0),
  automatic_day_limit integer not null check (automatic_day_limit > 0),
  interactive_reserve integer not null check (interactive_reserve >= 0),
  lease_seconds integer not null check (lease_seconds between 5 and 120)
);
insert into app_private.market_data_provider_policies values ('twelve_data', 8, 800, 6, 650, 150, 30);

create table app_private.market_data_usage_buckets (
  provider text not null references app_private.market_data_provider_policies(provider),
  bucket_kind text not null check (bucket_kind in ('minute','day')),
  bucket_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (provider, bucket_kind, bucket_start)
);

create table app_private.market_data_refresh_leases (
  listing_id uuid not null references public.market_listings(id) on delete cascade,
  provider text not null references app_private.market_data_provider_policies(provider),
  user_id uuid not null references auth.users(id) on delete cascade,
  lease_token uuid not null unique default gen_random_uuid(),
  lease_until timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (listing_id, provider)
);
create table app_private.market_data_provider_backoffs (
  listing_id uuid not null references public.market_listings(id) on delete cascade,
  provider text not null references app_private.market_data_provider_policies(provider),
  user_id uuid not null references auth.users(id) on delete cascade,
  failure_code text not null check (char_length(failure_code) <= 40),
  backoff_until timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (listing_id,provider)
);

alter table public.market_instruments enable row level security;
alter table public.market_listings enable row level security;
alter table public.market_listing_provider_mappings enable row level security;
alter table public.user_instrument_universe enable row level security;
alter table public.market_listing_quotes enable row level security;
alter table public.market_fx_quotes enable row level security;

create policy market_instruments_own on public.market_instruments for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy market_listings_own on public.market_listings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy market_listing_provider_mappings_own on public.market_listing_provider_mappings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_instrument_universe_own on public.user_instrument_universe for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy market_listing_quotes_select_own on public.market_listing_quotes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy market_fx_quotes_select_own on public.market_fx_quotes for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.market_instruments, public.market_listings,
  public.market_listing_provider_mappings, public.user_instrument_universe,
  public.market_listing_quotes, public.market_fx_quotes from public, anon, authenticated;
grant select, insert, update, delete on public.market_instruments, public.market_listings,
  public.market_listing_provider_mappings, public.user_instrument_universe to authenticated;
grant select on public.market_listing_quotes, public.market_fx_quotes to authenticated;

create or replace function public.claim_market_data_request(
  target_provider text, request_mode text, request_kind text
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  provider_policy app_private.market_data_provider_policies%rowtype;
  minute_start timestamptz := date_trunc('minute', now());
  day_start timestamptz := date_trunc('day', now());
  minute_count integer;
  day_count integer;
  minute_limit integer;
  day_limit integer;
begin
  if caller is null
    or request_mode not in ('automatic', 'interactive')
    or request_kind not in ('quote', 'symbol_search', 'fx') then
    return 'denied';
  end if;

  select * into provider_policy
  from app_private.market_data_provider_policies
  where provider = target_provider;

  if not found then
    return 'unsupported';
  end if;

  if request_mode = 'automatic' then
    minute_limit := provider_policy.automatic_minute_limit;
    day_limit := provider_policy.automatic_day_limit;
  else
    minute_limit := provider_policy.provider_minute_limit;
    day_limit := provider_policy.provider_day_limit;
  end if;

  insert into app_private.market_data_usage_buckets(provider, bucket_kind, bucket_start, request_count)
  values (target_provider, 'minute', minute_start, 0)
  on conflict do nothing;
  insert into app_private.market_data_usage_buckets(provider, bucket_kind, bucket_start, request_count)
  values (target_provider, 'day', day_start, 0)
  on conflict do nothing;

  select request_count into minute_count
  from app_private.market_data_usage_buckets
  where provider = target_provider and bucket_kind = 'minute' and bucket_start = minute_start
  for update;
  select request_count into day_count
  from app_private.market_data_usage_buckets
  where provider = target_provider and bucket_kind = 'day' and bucket_start = day_start
  for update;

  if minute_count >= minute_limit or day_count >= day_limit then
    return 'budget_exhausted';
  end if;

  update app_private.market_data_usage_buckets
  set request_count = request_count + 1
  where provider = target_provider and bucket_kind = 'minute' and bucket_start = minute_start;
  update app_private.market_data_usage_buckets
  set request_count = request_count + 1
  where provider = target_provider and bucket_kind = 'day' and bucket_start = day_start;
  return 'claimed';
end;
$$;
revoke all on function public.claim_market_data_request(text,text,text) from public, anon;
grant execute on function public.claim_market_data_request(text,text,text) to authenticated;

create or replace function public.claim_market_quote_refresh(
  target_listing uuid,
  target_provider text,
  refresh_mode text,
  minimum_fetched_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  provider_policy app_private.market_data_provider_policies%rowtype;
  minute_start timestamptz := date_trunc('minute', now());
  day_start timestamptz := date_trunc('day', now());
  minute_count integer;
  day_count integer;
  minute_limit integer;
  day_limit integer;
  token uuid;
begin
  if caller is null or refresh_mode not in ('automatic','interactive') then
    return jsonb_build_object('status','denied');
  end if;
  if not exists (select 1 from public.market_listings l where l.id = target_listing and l.user_id = caller and l.status = 'active') then
    return jsonb_build_object('status','denied');
  end if;
  select * into provider_policy
  from app_private.market_data_provider_policies
  where provider = target_provider;
  if not found then
    return jsonb_build_object('status','unsupported');
  end if;
  if refresh_mode = 'automatic' then
    minute_limit := provider_policy.automatic_minute_limit;
    day_limit := provider_policy.automatic_day_limit;
  else
    minute_limit := provider_policy.provider_minute_limit;
    day_limit := provider_policy.provider_day_limit;
  end if;
  if minimum_fetched_at is not null and exists (
    select 1 from public.market_listing_quotes q where q.listing_id = target_listing
      and q.provider = target_provider and q.fetched_at >= minimum_fetched_at and (q.backoff_until is null or q.backoff_until <= now())
  ) then return jsonb_build_object('status','cached'); end if;
  if exists (select 1 from app_private.market_data_provider_backoffs b where b.listing_id=target_listing and b.provider=target_provider and b.backoff_until>now()) then
    return jsonb_build_object('status','backoff');
  end if;
  if exists (select 1 from app_private.market_data_refresh_leases l where l.listing_id = target_listing and l.provider = target_provider and l.lease_until > now()) then
    return jsonb_build_object('status','leased');
  end if;
  delete from app_private.market_data_refresh_leases where listing_id = target_listing and provider = target_provider;
  insert into app_private.market_data_usage_buckets values (target_provider,'minute',minute_start,0)
    on conflict do nothing;
  insert into app_private.market_data_usage_buckets values (target_provider,'day',day_start,0)
    on conflict do nothing;
  select request_count into minute_count from app_private.market_data_usage_buckets where provider=target_provider and bucket_kind='minute' and bucket_start=minute_start for update;
  select request_count into day_count from app_private.market_data_usage_buckets where provider=target_provider and bucket_kind='day' and bucket_start=day_start for update;
  if minute_count >= minute_limit or day_count >= day_limit then
    return jsonb_build_object('status','budget_exhausted');
  end if;
  update app_private.market_data_usage_buckets set request_count=request_count+1 where provider=target_provider and bucket_kind='minute' and bucket_start=minute_start;
  update app_private.market_data_usage_buckets set request_count=request_count+1 where provider=target_provider and bucket_kind='day' and bucket_start=day_start;
  token := gen_random_uuid();
  insert into app_private.market_data_refresh_leases(listing_id,provider,user_id,lease_token,lease_until)
    values(target_listing,target_provider,caller,token,now()+make_interval(secs=>provider_policy.lease_seconds));
  return jsonb_build_object('status','claimed','lease_token',token);
end;
$$;

create or replace function public.complete_market_quote_refresh(
  target_listing uuid, target_provider text, supplied_lease_token uuid,
  quote_price numeric, quote_currency text, quote_observed_at timestamptz,
  quote_status text, market_open boolean
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null or not exists (
    select 1 from app_private.market_data_refresh_leases l where l.listing_id=target_listing
      and l.provider=target_provider and l.user_id=caller and l.lease_token=supplied_lease_token and l.lease_until > now()
  ) then return false; end if;
  if quote_price < 0 or quote_status not in ('live','delayed','closing','end_of_day','imported','manual','stale')
    or not exists (select 1 from public.market_listings l where l.id=target_listing and l.user_id=caller and l.currency=upper(quote_currency)) then
    delete from app_private.market_data_refresh_leases where listing_id=target_listing and provider=target_provider and lease_token=supplied_lease_token;
    return false;
  end if;
  insert into public.market_listing_quotes(user_id,listing_id,provider,price_native,currency,observed_at,fetched_at,status,is_market_open)
    values(caller,target_listing,target_provider,quote_price,upper(quote_currency),quote_observed_at,now(),quote_status,market_open)
  on conflict (listing_id,provider) do update set price_native=excluded.price_native,currency=excluded.currency,
    observed_at=excluded.observed_at,fetched_at=excluded.fetched_at,status=excluded.status,is_market_open=excluded.is_market_open,
    failure_code=null,backoff_until=null,updated_at=now();
  delete from app_private.market_data_provider_backoffs where listing_id=target_listing and provider=target_provider;
  delete from app_private.market_data_refresh_leases where listing_id=target_listing and provider=target_provider and lease_token=supplied_lease_token;
  return true;
end;
$$;

revoke all on function public.claim_market_quote_refresh(uuid,text,text,timestamptz) from public, anon;
revoke all on function public.complete_market_quote_refresh(uuid,text,uuid,numeric,text,timestamptz,text,boolean) from public, anon;
grant execute on function public.claim_market_quote_refresh(uuid,text,text,timestamptz) to authenticated;
grant execute on function public.complete_market_quote_refresh(uuid,text,uuid,numeric,text,timestamptz,text,boolean) to authenticated;

create or replace function public.attach_position_listing(
  target_position uuid, provider_name text, listing_symbol text, listing_exchange text,
  listing_mic text, listing_currency text, instrument_name text, provider_instrument_type text,
  listing_country text default null, listing_timezone text default null, user_selected boolean default false
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare caller uuid := (select auth.uid()); owned_position public.positions%rowtype; instrument uuid; listing uuid;
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
    values(caller,coalesce(nullif(btrim(instrument_name),''),upper(btrim(listing_symbol))),
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
  update public.positions set listing_id=listing,listing_resolution_status='confirmed',instrument_name=coalesce(nullif(btrim(instrument_name),''),instrument_name),
    ticker=upper(btrim(listing_symbol)),instrument_currency=upper(listing_currency),updated_at=now() where id=target_position and user_id=caller;
  insert into public.user_instrument_universe(user_id,instrument_id,preferred_listing_id,watchlisted,source_type)
  values(caller,instrument,listing,false,'position')
  on conflict (user_id,instrument_id) do update set preferred_listing_id=excluded.preferred_listing_id,last_seen_at=now();
  return listing;
end;
$$;

revoke all on function public.attach_position_listing(uuid,text,text,text,text,text,text,text,text,text,boolean) from public, anon;
grant execute on function public.attach_position_listing(uuid,text,text,text,text,text,text,text,text,text,boolean) to authenticated;

create or replace function public.fail_market_quote_refresh(
  target_listing uuid, target_provider text, supplied_lease_token uuid, failure text, backoff_seconds integer
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null or backoff_seconds not between 60 and 86400 or not exists (
    select 1 from app_private.market_data_refresh_leases l where l.listing_id=target_listing and l.provider=target_provider
      and l.user_id=caller and l.lease_token=supplied_lease_token
  ) then return false; end if;
  insert into app_private.market_data_provider_backoffs(listing_id,provider,user_id,failure_code,backoff_until)
  values(target_listing,target_provider,caller,left(failure,40),now()+make_interval(secs=>backoff_seconds))
  on conflict (listing_id,provider) do update set failure_code=excluded.failure_code,backoff_until=excluded.backoff_until,updated_at=now();
  update public.market_listing_quotes set failure_code=left(failure,40),backoff_until=now()+make_interval(secs=>backoff_seconds),updated_at=now()
    where listing_id=target_listing and provider=target_provider and user_id=caller;
  delete from app_private.market_data_refresh_leases where listing_id=target_listing and provider=target_provider and lease_token=supplied_lease_token;
  return true;
end;
$$;
revoke all on function public.fail_market_quote_refresh(uuid,text,uuid,text,integer) from public, anon;
grant execute on function public.fail_market_quote_refresh(uuid,text,uuid,text,integer) to authenticated;

-- Backfill only fully verified legacy mappings. Without a stable security identifier,
-- each exact listing tuple initially receives its own instrument identity. A later
-- broker/ISIN/FIGI process may merge identities explicitly; guessing is forbidden.
do $$
declare legacy record; new_instrument uuid; new_listing uuid;
begin
  for legacy in
    select distinct on (m.user_id,m.provider_symbol,m.mic_code,m.currency)
      m.user_id,m.provider_symbol,m.mic_code,m.currency,m.exchange,m.instrument_name,m.instrument_type,m.verified_at
    from public.position_market_data_mappings m
    where m.mapping_status='verified' and m.provider_symbol<>'' and m.mic_code ~ '^[A-Z0-9]{4}$' and m.currency ~ '^[A-Z]{3}$'
    order by m.user_id,m.provider_symbol,m.mic_code,m.currency,m.verified_at desc
  loop
    select id into new_listing from public.market_listings
      where user_id=legacy.user_id and symbol=legacy.provider_symbol and mic_code=legacy.mic_code and currency=legacy.currency;
    if new_listing is null then
      insert into public.market_instruments(user_id,name,asset_class,identification_status,metadata_source,metadata_checked_at)
      values(legacy.user_id,coalesce(nullif(legacy.instrument_name,''),legacy.provider_symbol),
        case when lower(coalesce(legacy.instrument_type,'')) like '%etf%' then 'etf' else 'stock' end,
        'listing_only','twelve_data',legacy.verified_at) returning id into new_instrument;
      insert into public.market_listings(user_id,instrument_id,symbol,exchange,mic_code,currency,selection_basis,status,metadata_source,metadata_checked_at)
      values(legacy.user_id,new_instrument,legacy.provider_symbol,legacy.exchange,legacy.mic_code,legacy.currency,
        'provider_relevance','active','twelve_data',legacy.verified_at) returning id into new_listing;
    end if;
    insert into public.market_listing_provider_mappings(user_id,listing_id,provider,provider_symbol,provider_mic,provider_currency,provider_status,verified_at)
    values(legacy.user_id,new_listing,'twelve_data',legacy.provider_symbol,legacy.mic_code,legacy.currency,'verified',legacy.verified_at)
    on conflict (listing_id,provider) do nothing;
  end loop;
end;
$$;

update public.positions p set listing_id=l.id, listing_resolution_status='confirmed'
from public.position_market_data_mappings m join public.market_listings l
  on l.user_id=m.user_id and l.symbol=m.provider_symbol and l.mic_code=m.mic_code and l.currency=m.currency
where m.position_id=p.id and m.mapping_status='verified' and p.instrument_type<>'cash';

insert into public.user_instrument_universe(user_id,instrument_id,preferred_listing_id,watchlisted,source_type)
select distinct l.user_id,l.instrument_id,l.id,false,'position' from public.market_listings l
join public.positions p on p.listing_id=l.id
on conflict (user_id,instrument_id) do update set preferred_listing_id=excluded.preferred_listing_id,last_seen_at=now();

comment on table public.market_instruments is 'User-scoped security identity. Listings are not merged into one security without a stable identifier or broker verification.';
comment on table public.market_listing_quotes is 'Bounded latest-value cache: one row per user listing and provider, not an unbounded hourly history.';
comment on column public.market_listings.selection_basis is 'provider_relevance means provider search order only and makes no liquidity claim.';
