begin;

update public.app_runtime_settings set registration_mode = 'open' where singleton = true;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('2e111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'core-a@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('2e222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'core-b@example.invalid', '', now(), '{}', '{}', now(), now());

insert into public.portfolios (id, user_id, name, currency, net_liquidity, account_type)
values
  ('2eaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2e111111-1111-4111-8111-111111111111', 'Core A', 'EUR', 10000, 'margin_account'),
  ('2ebbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2e222222-2222-4222-8222-222222222222', 'Core B', 'EUR', 20000, 'cash_account');

do $$
begin
  if pg_catalog.has_table_privilege('anon', 'public.portfolio_capital_movements', 'select')
     or pg_catalog.has_table_privilege('anon', 'public.portfolio_capital_movements', 'insert')
     or pg_catalog.has_table_privilege('anon', 'public.portfolio_capital_movements', 'update')
     or pg_catalog.has_table_privilege('anon', 'public.portfolio_capital_movements', 'delete') then
    raise exception 'Anon has capital-movement privileges';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.portfolio_capital_movements', 'update')
     or pg_catalog.has_table_privilege('authenticated', 'public.portfolio_capital_movements', 'delete') then
    raise exception 'Authenticated users have unintended capital-movement mutation privileges';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'portfolio_capital_movements'
      and policyname = 'capital_movements_select_own'
  ) then
    raise exception 'Capital-movement RLS policy is missing';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"2e111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);

insert into public.portfolio_capital_movements (
  user_id, portfolio_id, movement_type, amount_native, currency, movement_date, comment
) values
  ('2e111111-1111-4111-8111-111111111111', '2eaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'deposit', 1000, 'EUR', '2026-07-25', 'synthetic'),
  ('2e111111-1111-4111-8111-111111111111', '2eaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'withdrawal', 250, 'USD', '2026-07-26', null);

do $$
begin
  if (select count(*) from public.portfolio_capital_movements) <> 2 then
    raise exception 'Own capital movements are not readable';
  end if;
  begin
    insert into public.portfolio_capital_movements (
      user_id, portfolio_id, movement_type, amount_native, currency, movement_date
    ) values (
      '2e111111-1111-4111-8111-111111111111',
      '2ebbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'deposit', 1, 'EUR', '2026-07-26'
    );
    raise exception 'User A inserted a capital movement into user B portfolio';
  exception when foreign_key_violation or insufficient_privilege then
    null;
  end;
end;
$$;

insert into public.positions (
  portfolio_id, user_id, ticker, instrument_type, direction, quantity,
  multiplier, entry_price, instrument_currency, sold_quantity, sale_price,
  sale_date, status, source_type
) values (
  '2eaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '2e111111-1111-4111-8111-111111111111',
  'PARTIAL', 'stock', 'long', 10, 1, 100, 'EUR', 4, 110,
  '2026-07-26', 'active', 'manual'
);

do $$
begin
  begin
    insert into public.positions (
      portfolio_id, user_id, ticker, instrument_type, direction, quantity,
      multiplier, entry_price, instrument_currency, sold_quantity, status, source_type
    ) values (
      '2eaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '2e111111-1111-4111-8111-111111111111',
      'INVALID-SALE', 'stock', 'long', 10, 1, 100, 'EUR', 11, 'closed', 'manual'
    );
    raise exception 'Oversold position bypassed constraints';
  exception when check_violation then
    null;
  end;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"2e222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}', true);

do $$
begin
  if exists (
    select 1 from public.portfolio_capital_movements
    where portfolio_id = '2eaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) then
    raise exception 'Cross-user capital movements leaked through RLS';
  end if;
end;
$$;

reset role;
rollback;
