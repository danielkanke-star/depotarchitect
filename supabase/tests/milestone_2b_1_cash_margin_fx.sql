begin;

update public.app_runtime_settings set registration_mode = 'open' where singleton = true;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('2c111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cash-a@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('2c222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cash-b@example.invalid', '', now(), '{}', '{}', now(), now());

insert into public.portfolios (id, user_id, name, currency, net_liquidity)
values
  ('2caaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2c111111-1111-4111-8111-111111111111', 'Cash A', 'EUR', 10000),
  ('2cbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2c222222-2222-4222-8222-222222222222', 'Cash B', 'EUR', 20000);

do $$
begin
  if pg_catalog.has_table_privilege('anon', 'public.portfolio_cash_balances', 'select')
     or pg_catalog.has_table_privilege('anon', 'public.portfolio_cash_balances', 'insert')
     or pg_catalog.has_table_privilege('anon', 'public.portfolio_cash_balances', 'update')
     or pg_catalog.has_table_privilege('anon', 'public.portfolio_cash_balances', 'delete') then
    raise exception 'Anon has cash-balance table privileges';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'portfolio_cash_balances'
      and policyname = 'cash_balances_select_own'
  ) then
    raise exception 'Cash-balance RLS policies are missing';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.replace_portfolio_snapshot_v3(uuid,text,jsonb,text[],integer,integer,integer,jsonb)'::regprocedure,
    'execute'
  ) then
    raise exception 'Anon can execute the 2B.1 snapshot RPC';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"2c111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);

insert into public.portfolio_cash_balances (
  user_id, portfolio_id, currency, balance_native, current_fx_to_base,
  balance_as_of, fx_as_of, source_type
) values
  ('2c111111-1111-4111-8111-111111111111', '2caaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'EUR', 0.01, null, now(), now(), 'manual'),
  ('2c111111-1111-4111-8111-111111111111', '2caaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'USD', -100, 0.9, now(), now(), 'manual'),
  ('2c111111-1111-4111-8111-111111111111', '2caaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'CHF', -50, 1.075, now(), now(), 'manual');

do $$
begin
  if (select current_fx_to_base from public.portfolio_cash_balances where currency = 'EUR' and portfolio_id = '2caaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1 then
    raise exception 'Base-currency cash was not normalized to FX 1';
  end if;
  if (select value_base from public.portfolio_cash_balances where currency = 'USD' and portfolio_id = '2caaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> -90 then
    raise exception 'Negative USD cash conversion is incorrect';
  end if;
  if (select value_base from public.portfolio_cash_balances where currency = 'CHF' and portfolio_id = '2caaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> -53.75 then
    raise exception 'Negative CHF cash conversion is incorrect';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.replace_portfolio_snapshot_v3(
      '2cbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'foreign.csv',
      '[{"ticker":"FORBIDDEN","instrument_type":"stock","direction":"long","status":"active","quantity":1,"multiplier":1,"entry_price":1,"current_price":1,"instrument_currency":"EUR","current_fx_to_base":1,"current_fx_source":"custom_csv","current_fx_status":"imported","current_price_source":"custom_csv","current_price_status":"imported","market_value":1,"margin_source":"missing"}]'::jsonb,
      array[]::text[], 1, 0, 0, '{}'::jsonb
    );
    raise exception 'User A imported into portfolio B through v3';
  exception when no_data_found then
    null;
  end;
end;
$$;

select public.replace_portfolio_snapshot_v3(
  '2caaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'canonical.csv',
  '[
    {
      "ticker":"CANONICAL",
      "instrument_type":"stock",
      "direction":"long",
      "status":"active",
      "quantity":46,
      "multiplier":1,
      "entry_price":79.10,
      "current_price":86.17,
      "instrument_currency":"CHF",
      "entry_fx_to_base":1.05,
      "current_fx_to_base":1.076107920694079,
      "current_fx_source":"custom_csv",
      "current_fx_status":"imported",
      "current_price_source":"custom_csv",
      "current_price_status":"imported",
      "stop_price":77.05,
      "market_value":4265.50,
      "risk_amount":451.45,
      "margin_rate":0.25,
      "margin_source":"estimated"
    }
  ]'::jsonb,
  array[]::text[], 1, 0, 0, '{}'::jsonb
);

do $$
begin
  if not exists (
    select 1 from public.positions
    where ticker = 'CANONICAL'
      and entry_fx_to_base = 1.05
      and current_fx_to_base = 1.076107920694
      and margin_rate = 0.25
      and margin_source = 'estimated'
      and current_fx_status = 'imported'
      and current_price_status = 'imported'
      and fx_to_base is null
      and margin_percent is null
  ) then
    raise exception 'Canonical 2B.1 fields were not persisted without legacy writes';
  end if;
end;
$$;

do $$
declare
  position_count_before integer;
  import_count_before integer;
begin
  select count(*) into position_count_before from public.positions;
  select count(*) into import_count_before from public.portfolio_imports;
  begin
    perform public.replace_portfolio_snapshot_v3(
      '2caaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'invalid-rate.csv',
      '[{"ticker":"BROKEN","instrument_type":"stock","direction":"long","status":"active","quantity":1,"multiplier":1,"entry_price":1,"current_price":1,"instrument_currency":"EUR","current_fx_to_base":1,"current_fx_source":"custom_csv","current_fx_status":"imported","current_price_source":"custom_csv","current_price_status":"imported","market_value":1,"margin_rate":25,"margin_source":"estimated"}]'::jsonb,
      array[]::text[], 1, 0, 0, '{}'::jsonb
    );
    raise exception 'Invalid decimal margin rate unexpectedly imported';
  exception when invalid_parameter_value then
    null;
  end;

  if (select count(*) from public.positions) <> position_count_before
     or (select count(*) from public.portfolio_imports) <> import_count_before then
    raise exception 'Failed v3 import did not roll back atomically';
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.portfolio_cash_balances (
      user_id, portfolio_id, currency, balance_native, current_fx_to_base,
      balance_as_of, source_type
    ) values (
      '2c111111-1111-4111-8111-111111111111',
      '2cbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'USD', 1, 0.9, now(), 'manual'
    );
    raise exception 'User A inserted cash into portfolio B';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

insert into public.positions (
  portfolio_id, user_id, ticker, instrument_type, direction, quantity,
  multiplier, entry_price, current_price, instrument_currency,
  current_fx_to_base, margin_requirement, margin_source, source_type
) values (
  '2caaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '2c111111-1111-4111-8111-111111111111',
  'ZERO-MARGIN', 'stock', 'long', 1, 1, 1, 1, 'EUR', 1,
  0, 'manual_direct', 'manual'
);

do $$
begin
  if not exists (
    select 1 from public.positions
    where ticker = 'ZERO-MARGIN'
      and margin_requirement = 0
      and margin_source = 'manual_direct'
  ) then
    raise exception 'Confirmed direct zero margin was not preserved';
  end if;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"2c222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}', true);

do $$
begin
  if exists (
    select 1 from public.portfolio_cash_balances
    where portfolio_id = '2caaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) then
    raise exception 'Cross-user cash balances leaked through RLS';
  end if;
  if exists (select 1 from public.positions where ticker = 'CANONICAL') then
    raise exception 'Cross-user canonical position leaked through RLS';
  end if;
  if exists (select 1 from public.portfolio_imports where original_filename = 'canonical.csv') then
    raise exception 'Cross-user v3 import history leaked through RLS';
  end if;
end;
$$;

reset role;
rollback;
