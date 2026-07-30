-- Additive, provider-specific instrument identity. Quotes remain stored in the
-- broker-neutral position_price_observations table.

create table public.position_market_data_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  position_id uuid not null references public.positions(id) on delete cascade,
  provider text not null default 'twelve_data'
    check (provider = 'twelve_data'),
  provider_symbol text not null
    check (char_length(btrim(provider_symbol)) between 1 and 40),
  exchange text
    check (exchange is null or char_length(btrim(exchange)) between 1 and 100),
  mic_code text not null
    check (mic_code ~ '^[A-Z0-9]{4}$'),
  currency text not null
    check (currency ~ '^[A-Z]{3}$'),
  instrument_name text
    check (instrument_name is null or char_length(instrument_name) <= 200),
  instrument_type text
    check (instrument_type is null or char_length(instrument_type) <= 100),
  mapping_status text not null
    check (mapping_status in ('verified', 'manual')),
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (position_id, provider)
);

create index position_market_data_mappings_owner_idx
  on public.position_market_data_mappings(user_id, portfolio_id);

alter table public.position_market_data_mappings enable row level security;

create policy "position_market_data_mappings_select_own"
  on public.position_market_data_mappings
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "position_market_data_mappings_insert_own"
  on public.position_market_data_mappings
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.positions
      where positions.id = position_market_data_mappings.position_id
        and positions.portfolio_id = position_market_data_mappings.portfolio_id
        and positions.user_id = position_market_data_mappings.user_id
        and upper(positions.instrument_currency) = position_market_data_mappings.currency
    )
  );

create policy "position_market_data_mappings_update_own"
  on public.position_market_data_mappings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.positions
      where positions.id = position_market_data_mappings.position_id
        and positions.portfolio_id = position_market_data_mappings.portfolio_id
        and positions.user_id = position_market_data_mappings.user_id
        and upper(positions.instrument_currency) = position_market_data_mappings.currency
    )
  );

create policy "position_market_data_mappings_delete_own"
  on public.position_market_data_mappings
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.position_market_data_mappings
  from public, anon, authenticated;
grant select, insert, update, delete
  on public.position_market_data_mappings to authenticated;

comment on table public.position_market_data_mappings is
  'Unambiguous provider symbol and MIC mapping. Contains no API credentials.';
comment on column public.position_market_data_mappings.mic_code is
  'ISO 10383 MIC used to prevent silent cross-listing confusion.';
