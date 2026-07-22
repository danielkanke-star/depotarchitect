begin;

update public.app_runtime_settings set registration_mode = 'open' where singleton = true;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('2a111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'csv-a@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('2a222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'csv-b@example.invalid', '', now(), '{}', '{}', now(), now());

insert into public.portfolios (id, user_id, name)
values
  ('2aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2a111111-1111-4111-8111-111111111111', 'CSV A'),
  ('2bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2a222222-2222-4222-8222-222222222222', 'CSV B');

insert into public.portfolio_categories (id, portfolio_id, user_id, name, sort_order)
values
  ('2acccccc-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2a111111-1111-4111-8111-111111111111', 'Kerninvestment', 0),
  ('2acccccc-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2a222222-2222-4222-8222-222222222222', 'Kerninvestment', 0);

insert into public.positions (
  portfolio_id, user_id, category_id, ticker, quantity, market_value, status, notes
)
select
  '2aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '2a111111-1111-4111-8111-111111111111',
  '2acccccc-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'DEMO' || series,
  1,
  100,
  'active',
  'Beispieldatensatz für Meilenstein 1'
from generate_series(1, 16) as series;

insert into public.positions (
  portfolio_id, user_id, category_id, ticker, quantity, market_value, status
) values
  ('2aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2a111111-1111-4111-8111-111111111111', '2acccccc-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ARCHIVE', 1, 50, 'closed'),
  ('2bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2a222222-2222-4222-8222-222222222222', '2acccccc-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'OTHER', 1, 500, 'active');

do $$
begin
  if (
    select count(*) from public.positions
    where user_id = '2a111111-1111-4111-8111-111111111111'
      and source_type = 'demo'
  ) <> 16 then
    raise exception 'Example positions were not marked with demo provenance';
  end if;
end;
$$;

do $$
begin
  if pg_catalog.has_function_privilege(
    'anon',
    'public.replace_portfolio_snapshot(uuid,text,jsonb,text[],integer,integer,integer,jsonb)'::regprocedure,
    'execute'
  ) then
    raise exception 'Anon can execute the snapshot import RPC';
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.portfolio_imports', 'insert') then
    raise exception 'Authenticated users can bypass the snapshot RPC and insert import history';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'portfolio_imports'
      and column_name ~ '(raw|content|csv_data|positions)'
  ) then
    raise exception 'Import history contains a raw CSV or depot-content column';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.positions'::regclass
      and conname = 'positions_source_type_check'
      and pg_catalog.pg_get_constraintdef(oid) like '%demo%'
      and pg_catalog.pg_get_constraintdef(oid) like '%manual%'
      and pg_catalog.pg_get_constraintdef(oid) like '%''csv''%'
      and pg_catalog.pg_get_constraintdef(oid) like '%custom_csv%'
  ) then
    raise exception 'Position source constraint does not preserve legacy csv and custom_csv';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.portfolio_imports'::regclass
      and conname = 'portfolio_imports_source_type_check'
      and pg_catalog.pg_get_constraintdef(oid) like '%''csv''%'
      and pg_catalog.pg_get_constraintdef(oid) like '%custom_csv%'
  ) then
    raise exception 'Import source constraint does not preserve legacy csv and custom_csv';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"2a111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);

do $$
begin
  begin
    perform public.replace_portfolio_snapshot(
      '2bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'foreign.csv',
      '[{"ticker":"FORBIDDEN","instrument_type":"stock","direction":"long","status":"active","quantity":1,"multiplier":1,"market_value":100}]'::jsonb,
      array[]::text[],
      1, 0, 0,
      '{"delimiter":"Semikolon","encoding":"UTF-8","header_detected":true}'::jsonb
    );
    raise exception 'User A imported into portfolio B';
  exception when no_data_found then
    null;
  end;
end;
$$;

select public.replace_portfolio_snapshot(
  '2aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'synthetic.csv',
  '[
    {
      "external_position_id":"sheet-1",
      "ticker":"SAP",
      "instrument_name":"SAP SE",
      "category_name":"Kerninvestment",
      "status":"active",
      "direction":"long",
      "instrument_type":"stock",
      "quantity":2,
      "multiplier":1,
      "entry_price":90,
      "current_price":100,
      "market_value":null,
      "risk_amount":20,
      "margin_requirement":null,
      "margin_percent":null
    },
    {
      "ticker":"QQQ",
      "category_name":"Sondersituationen",
      "status":"active",
      "direction":"long_put",
      "instrument_type":"option",
      "quantity":1,
      "multiplier":100,
      "current_price":3,
      "market_value":300,
      "option_type":"put",
      "strike_price":450,
      "expiration_date":"2026-10-16"
    }
  ]'::jsonb,
  array['Sondersituationen'],
  3, 1, 1,
  '{"delimiter":"Semikolon","encoding":"UTF-8","header_detected":true,"ignored":"must-not-persist"}'::jsonb
);

do $$
begin
  if (select count(*) from public.positions where status <> 'closed') <> 2 then
    raise exception 'Snapshot did not replace all 16 active demo positions atomically';
  end if;
  if (select count(*) from public.positions where status = 'closed' and ticker = 'ARCHIVE') <> 1 then
    raise exception 'Snapshot removed a closed historical position';
  end if;
  if (select count(*) from public.positions where source_type = 'custom_csv' and source_import_id is not null and imported_at is not null) <> 2 then
    raise exception 'Custom CSV provenance is incomplete';
  end if;
  if (select market_value from public.positions where ticker = 'SAP') <> 200 then
    raise exception 'Server-side market value derivation failed';
  end if;
  if (select count(*) from public.portfolio_imports) <> 1 then
    raise exception 'Own import history was not recorded exactly once';
  end if;
  if (select count(*) from public.portfolio_imports where source_type = 'custom_csv') <> 1 then
    raise exception 'New import history was not normalized to custom_csv';
  end if;
  if exists (
    select 1 from public.portfolio_imports
    where metadata ? 'ignored'
  ) then
    raise exception 'Unapproved import metadata was persisted';
  end if;
  if not exists (
    select 1 from public.portfolio_categories
    where portfolio_id = '2aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and name = 'Sondersituationen'
  ) then
    raise exception 'Confirmed new category was not created';
  end if;
end;
$$;

select public.replace_portfolio_snapshot(
  '2aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'synthetic-reimport.csv',
  '[
    {
      "ticker":"SAP",
      "instrument_name":"SAP SE reimport",
      "category_name":"Kerninvestment",
      "status":"active",
      "direction":"long",
      "instrument_type":"stock",
      "quantity":3,
      "multiplier":1,
      "current_price":105,
      "market_value":315
    }
  ]'::jsonb,
  array[]::text[],
  1, 0, 0,
  '{"delimiter":"Komma","encoding":"UTF-8","header_detected":true}'::jsonb
);

do $$
begin
  if (select count(*) from public.positions where status <> 'closed') <> 1 then
    raise exception 'Reimport did not replace the previous active snapshot';
  end if;
  if (select count(*) from public.positions where ticker = 'SAP' and quantity = 3 and source_type = 'custom_csv') <> 1 then
    raise exception 'Reimport did not persist the expected custom CSV position';
  end if;
  if (select count(*) from public.portfolio_imports where source_type = 'custom_csv') <> 2 then
    raise exception 'Reimport history was not recorded';
  end if;
  if (select count(*) from public.portfolio_categories where portfolio_id = '2aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name = 'Kerninvestment') <> 1 then
    raise exception 'Reimport changed an existing category unexpectedly';
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
    perform public.replace_portfolio_snapshot(
      '2aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'invalid.csv',
      '[{"ticker":"BROKEN","instrument_type":"option","direction":"long_call","status":"active","quantity":1,"multiplier":1,"market_value":100}]'::jsonb,
      array[]::text[],
      1, 0, 0,
      '{"delimiter":"Komma","encoding":"UTF-8","header_detected":true}'::jsonb
    );
    raise exception 'Invalid option payload unexpectedly imported';
  exception when invalid_parameter_value then
    null;
  end;

  if (select count(*) from public.positions) <> position_count_before then
    raise exception 'Failed import changed the previous depot snapshot';
  end if;
  if (select count(*) from public.portfolio_imports) <> import_count_before then
    raise exception 'Failed import left partial history behind';
  end if;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"2a222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}', true);
do $$
begin
  if (select count(*) from public.portfolio_imports) <> 0 then
    raise exception 'User B can see import history of user A';
  end if;
  if (select count(*) from public.positions) <> 1 then
    raise exception 'Positions RLS leaked another user snapshot';
  end if;
end;
$$;

reset role;
rollback;
