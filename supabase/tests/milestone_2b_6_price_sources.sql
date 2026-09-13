begin;

update public.app_runtime_settings set registration_mode = 'open' where singleton = true;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('2f111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'price-a@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('2f222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'price-b@example.invalid', '', now(), '{}', '{}', now(), now());

insert into public.portfolios (id, user_id, name, currency, net_liquidity)
values
  ('2faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2f111111-1111-4111-8111-111111111111', 'Price A', 'EUR', 10000),
  ('2fbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2f222222-2222-4222-8222-222222222222', 'Price B', 'EUR', 20000);

insert into public.positions (
  id, portfolio_id, user_id, ticker, instrument_type, direction, quantity,
  multiplier, entry_price, current_price_native, current_price,
  current_price_source, current_price_as_of, current_price_status,
  instrument_currency, status, source_type
) values
  (
    '2f0aaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '2faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '2f111111-1111-4111-8111-111111111111',
    'SYNTH-A', 'stock', 'long', 1, 1, 90, 100, 100,
    'manual', '2026-07-30T10:00:00Z', 'manually_updated',
    'EUR', 'active', 'manual'
  ),
  (
    '2f0bbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '2fbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '2f222222-2222-4222-8222-222222222222',
    'SYNTH-B', 'stock', 'long', 1, 1, 90, 100, 100,
    'manual', '2026-07-30T10:00:00Z', 'manually_updated',
    'EUR', 'active', 'manual'
  );

do $$
begin
  if pg_catalog.has_table_privilege('anon', 'public.position_price_observations', 'select')
     or pg_catalog.has_table_privilege('anon', 'public.position_price_observations', 'insert') then
    raise exception 'Anon has price-observation privileges';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.position_price_observations', 'update')
     or pg_catalog.has_table_privilege('authenticated', 'public.position_price_observations', 'delete') then
    raise exception 'Price observations are not immutable';
  end if;
  if (select count(*) from public.position_price_observations where source_type = 'manual') <> 2 then
    raise exception 'Position trigger did not capture both manual fallback prices';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"2f111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);

do $$
begin
  if (select count(*) from public.position_price_observations) <> 1 then
    raise exception 'User A cannot read exactly the own price observation';
  end if;
end;
$$;

insert into public.position_price_observations (
  user_id, portfolio_id, position_id, ticker, currency, price_native,
  source_type, source_name, observed_at, status
) values (
  '2f111111-1111-4111-8111-111111111111',
  '2faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '2f0aaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'SYNTH-A', 'EUR', 105,
  'ibkr', 'IBKR', '2026-07-30T11:00:00Z', 'live'
);

do $$
begin
  begin
    insert into public.position_price_observations (
      user_id, portfolio_id, position_id, ticker, currency, price_native,
      source_type, source_name, observed_at, status
    ) values (
      '2f111111-1111-4111-8111-111111111111',
      '2fbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '2f0bbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'SYNTH-B', 'EUR', 105,
      'ibkr', 'IBKR', '2026-07-30T11:00:00Z', 'live'
    );
    raise exception 'User A inserted a price for user B';
  exception when insufficient_privilege or check_violation then
    null;
  end;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"2f222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}', true);

do $$
begin
  if exists (
    select 1
    from public.position_price_observations
    where position_id = '2f0aaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) then
    raise exception 'User B can read user A price observations';
  end if;
end;
$$;

reset role;
rollback;
