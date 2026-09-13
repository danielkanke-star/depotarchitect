begin;

update public.app_runtime_settings set registration_mode = 'open' where singleton = true;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('2e111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mapping-a@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('2e222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mapping-b@example.invalid', '', now(), '{}', '{}', now(), now());

insert into public.portfolios (id, user_id, name, currency, net_liquidity)
values
  ('2eaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2e111111-1111-4111-8111-111111111111', 'Mapping A', 'EUR', 10000),
  ('2ebbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2e222222-2222-4222-8222-222222222222', 'Mapping B', 'EUR', 20000);

insert into public.positions (
  id, portfolio_id, user_id, ticker, instrument_type, direction, quantity,
  multiplier, entry_price, current_price_native, current_price,
  current_price_source, current_price_as_of, current_price_status,
  instrument_currency, status, source_type
) values
  (
    '2e0aaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '2eaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '2e111111-1111-4111-8111-111111111111',
    'SYNTH-A', 'stock', 'long', 1, 1, 90, 100, 100,
    'manual', '2026-07-31T10:00:00Z', 'manually_updated',
    'EUR', 'active', 'manual'
  ),
  (
    '2e0bbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '2ebbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '2e222222-2222-4222-8222-222222222222',
    'SYNTH-B', 'stock', 'long', 1, 1, 90, 100, 100,
    'manual', '2026-07-31T10:00:00Z', 'manually_updated',
    'EUR', 'active', 'manual'
  );

do $$
begin
  if pg_catalog.has_table_privilege('anon', 'public.position_market_data_mappings', 'select')
     or pg_catalog.has_table_privilege('anon', 'public.position_market_data_mappings', 'insert') then
    raise exception 'Anon has market-data mapping privileges';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"2e111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);

insert into public.position_market_data_mappings (
  user_id, portfolio_id, position_id, provider_symbol, exchange, mic_code,
  currency, mapping_status, verified_at
) values (
  '2e111111-1111-4111-8111-111111111111',
  '2eaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '2e0aaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'SYNTH-A', 'Synthetic exchange', 'XETR', 'EUR', 'verified', now()
);

do $$
begin
  if (select count(*) from public.position_market_data_mappings) <> 1 then
    raise exception 'User A cannot read exactly the own mapping';
  end if;

  begin
    insert into public.position_market_data_mappings (
      user_id, portfolio_id, position_id, provider_symbol, mic_code,
      currency, mapping_status, verified_at
    ) values (
      '2e111111-1111-4111-8111-111111111111',
      '2ebbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '2e0bbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'SYNTH-B', 'XETR', 'EUR', 'manual', now()
    );
    raise exception 'User A inserted a mapping for user B';
  exception when insufficient_privilege or check_violation then
    null;
  end;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"2e222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}', true);

do $$
begin
  if exists (
    select 1 from public.position_market_data_mappings
    where position_id = '2e0aaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) then
    raise exception 'User B can read user A mapping';
  end if;
end;
$$;

reset role;
rollback;
