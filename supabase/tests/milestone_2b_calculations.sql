begin;

update public.app_runtime_settings set registration_mode = 'open' where singleton = true;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('2b111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'calc-a@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('2b222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'calc-b@example.invalid', '', now(), '{}', '{}', now(), now());

insert into public.portfolios (id, user_id, name, currency, net_liquidity, cash_balance, data_as_of)
values
  ('2baaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2b111111-1111-4111-8111-111111111111', 'Calc A', 'EUR', 10000, 1000, now()),
  ('2bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2b222222-2222-4222-8222-222222222222', 'Calc B', 'EUR', 20000, 2000, now());

insert into public.portfolio_categories (id, portfolio_id, user_id, name, sort_order)
values
  ('2bcccccc-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2baaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2b111111-1111-4111-8111-111111111111', 'Kern', 0),
  ('2bcccccc-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2b222222-2222-4222-8222-222222222222', 'Kern', 0);

do $$
begin
  if pg_catalog.has_function_privilege(
    'anon',
    'public.replace_portfolio_snapshot_v2(uuid,text,jsonb,text[],integer,integer,integer,jsonb)'::regprocedure,
    'execute'
  ) then
    raise exception 'Anon can execute calculation-engine snapshot RPC';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'positions' and column_name = 'fx_to_base'
  ) then
    raise exception 'fx_to_base source column is missing';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"2b111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);

do $$
begin
  begin
    perform public.replace_portfolio_snapshot_v2(
      '2bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'foreign.csv',
      '[{"ticker":"FORBIDDEN","instrument_type":"stock","direction":"long","status":"active","quantity":1,"multiplier":1,"entry_price":1,"current_price":1,"instrument_currency":"EUR","fx_to_base":1,"market_value":1}]'::jsonb,
      array[]::text[], 1, 0, 0, '{}'::jsonb
    );
    raise exception 'User A imported calculation sources into portfolio B';
  exception when no_data_found then
    null;
  end;
end;
$$;

select public.replace_portfolio_snapshot_v2(
  '2baaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'calculated.csv',
  '[
    {
      "ticker":"USD-LONG",
      "category_name":"Kern",
      "instrument_type":"stock",
      "direction":"long",
      "status":"active",
      "quantity":20,
      "multiplier":1,
      "entry_price":45,
      "current_price":50,
      "instrument_currency":"USD",
      "fx_to_base":0.9,
      "stop_price":47,
      "market_value":900,
      "risk_amount":54,
      "margin_percent":25,
      "strategy":"synthetic-test"
    }
  ]'::jsonb,
  array[]::text[], 1, 0, 0,
  '{"delimiter":"Semikolon","encoding":"UTF-8","header_detected":true}'::jsonb
);

do $$
begin
  if not exists (
    select 1 from public.positions
    where ticker = 'USD-LONG'
      and instrument_currency = 'USD'
      and fx_to_base = 0.9
      and market_value = 900
      and risk_amount = 54
      and strategy = 'synthetic-test'
      and source_type = 'custom_csv'
  ) then
    raise exception 'V2 snapshot did not persist calculation sources and compatibility caches';
  end if;

  if (select net_liquidity from public.portfolios where id = '2baaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 10000 then
    raise exception 'Position import unexpectedly overwrote NetLiq source data';
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
    perform public.replace_portfolio_snapshot_v2(
      '2baaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'invalid.csv',
      '[{"ticker":"BROKEN","instrument_type":"option","direction":"long_call","status":"active","quantity":1,"multiplier":100,"entry_price":1,"current_price":2,"instrument_currency":"EUR","fx_to_base":1,"market_value":200}]'::jsonb,
      array[]::text[], 1, 0, 0, '{}'::jsonb
    );
    raise exception 'Invalid V2 option payload unexpectedly imported';
  exception when invalid_parameter_value then
    null;
  end;

  if (select count(*) from public.positions) <> position_count_before
     or (select count(*) from public.portfolio_imports) <> import_count_before then
    raise exception 'Failed V2 import did not roll back atomically';
  end if;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"2b222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}', true);

do $$
begin
  if exists (select 1 from public.positions where ticker = 'USD-LONG') then
    raise exception 'Cross-user position source or cache leaked through RLS';
  end if;
  if exists (select 1 from public.portfolio_imports where original_filename = 'calculated.csv') then
    raise exception 'Cross-user calculation import history leaked through RLS';
  end if;
end;
$$;

reset role;
rollback;
