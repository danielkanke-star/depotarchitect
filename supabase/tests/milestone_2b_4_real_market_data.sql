begin;

update public.app_runtime_settings set registration_mode = 'open' where singleton = true;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('2d111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'market-a@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('2d222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'market-b@example.invalid', '', now(), '{}', '{}', now(), now());

insert into public.portfolios (id, user_id, name, currency, net_liquidity)
values
  ('2daaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2d111111-1111-4111-8111-111111111111', 'Market A', 'EUR', 10000),
  ('2dbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2d222222-2222-4222-8222-222222222222', 'Market B', 'EUR', 20000);

do $$
begin
  if pg_catalog.has_table_privilege('anon', 'public.portfolio_fx_rates', 'select')
     or pg_catalog.has_table_privilege('anon', 'public.portfolio_fx_rates', 'insert')
     or pg_catalog.has_table_privilege('anon', 'public.portfolio_fx_rates', 'update')
     or pg_catalog.has_table_privilege('anon', 'public.portfolio_fx_rates', 'delete') then
    raise exception 'Anon has portfolio FX rate privileges';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'portfolio_fx_rates'
      and policyname = 'portfolio_fx_rates_select_own'
  ) then
    raise exception 'Portfolio FX RLS policies are missing';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"2d111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);

insert into public.portfolio_fx_rates (
  user_id, portfolio_id, source_currency, target_currency, rate,
  source_type, source_name, rate_as_of, status
) values (
  '2d111111-1111-4111-8111-111111111111',
  '2daaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'usd', 'eur', 0.8564, 'manual', 'Manual test', now(), 'manually_updated'
);

insert into public.positions (
  portfolio_id, user_id, ticker, instrument_type, direction, quantity,
  multiplier, entry_price, current_price_native, instrument_currency,
  current_fx_to_base, current_fx_source, current_fx_status,
  current_price_as_of, current_price_source, current_price_status,
  stop_price_native, stop_updated_at, margin_requirement, margin_source,
  margin_as_of, source_type
) values (
  '2daaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '2d111111-1111-4111-8111-111111111111',
  'REAL-USD', 'stock', 'long', 4, 1, 90, 100, 'USD',
  0.8564, 'Manual test', 'manually_updated',
  now(), 'Manual test', 'manually_updated',
  95, now(), 100, 'manual_direct', now(), 'manual'
);

do $$
begin
  if not exists (
    select 1 from public.portfolio_fx_rates
    where source_currency = 'USD'
      and target_currency = 'EUR'
      and rate = 0.8564
  ) then
    raise exception 'FX quote was not normalized and persisted';
  end if;

  if not exists (
    select 1 from public.positions
    where ticker = 'REAL-USD'
      and current_price = current_price_native
      and stop_price = stop_price_native
      and margin_currency = 'EUR'
      and margin_confidence = 'trusted'
      and margin_calculation_type = 'direct_requirement'
  ) then
    raise exception 'Native market-data compatibility fields were not synchronized';
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.portfolio_fx_rates (
      user_id, portfolio_id, source_currency, target_currency, rate,
      source_type, source_name, rate_as_of, status
    ) values (
      '2d111111-1111-4111-8111-111111111111',
      '2dbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'CHF', 'EUR', 1.05, 'manual', 'Forbidden', now(), 'manually_updated'
    );
    raise exception 'User A inserted FX into portfolio B';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"2d222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}', true);

do $$
begin
  if exists (
    select 1 from public.portfolio_fx_rates
    where portfolio_id = '2daaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) then
    raise exception 'Cross-user FX quotes leaked through RLS';
  end if;
  if exists (select 1 from public.positions where ticker = 'REAL-USD') then
    raise exception 'Cross-user real market data leaked through RLS';
  end if;
end;
$$;

reset role;
rollback;
