begin;

update public.app_runtime_settings set registration_mode = 'open' where singleton = true;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-a@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-b@example.invalid', '', now(), '{}', '{}', now(), now());

insert into public.portfolios (id, user_id, name)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'RLS A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'RLS B');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);

do $$
begin
  if (select count(*) from public.portfolios) <> 1 then
    raise exception 'Cross-user portfolios RLS failed';
  end if;
  if (select count(*) from public.user_profiles) <> 1 then
    raise exception 'Cross-user profiles RLS failed';
  end if;
  if public.get_my_role() <> 'user'::public.app_role then
    raise exception 'Default role check failed';
  end if;
  begin
    insert into public.user_roles (user_id, role)
    values ('11111111-1111-4111-8111-111111111111', 'admin');
    raise exception 'User granted their own admin role';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

insert into public.legal_acceptances (user_id, document_type, document_version)
values ('11111111-1111-4111-8111-111111111111', 'privacy_notice', 'rls-test');

do $$
begin
  begin
    insert into public.legal_acceptances (user_id, document_type, document_version)
    values ('22222222-2222-4222-8222-222222222222', 'privacy_notice', 'must-fail');
    raise exception 'Cross-user legal acceptance insert unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select public.request_account_deletion();

do $$
begin
  if (select count(*) from public.account_deletion_requests) <> 1 then
    raise exception 'Cross-user deletion request RLS failed';
  end if;
  begin
    perform public.get_admin_summary();
    raise exception 'Normal user unexpectedly accessed admin summary';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.get_admin_user_directory();
    raise exception 'Normal user unexpectedly accessed admin directory';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.get_admin_user_detail(
      '22222222-2222-4222-8222-222222222222',
      'aaaaaaaa-0000-4000-8000-000000000020'
    );
    raise exception 'Normal user unexpectedly accessed admin detail';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.admin_set_account_status(
      '22222222-2222-4222-8222-222222222222', 'suspended',
      'aaaaaaaa-0000-4000-8000-000000000021'
    );
    raise exception 'Normal user unexpectedly changed account status';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.admin_set_role(
      '22222222-2222-4222-8222-222222222222', 'admin', true,
      'aaaaaaaa-0000-4000-8000-000000000022'
    );
    raise exception 'Normal user unexpectedly changed a role';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.admin_process_deletion_request(
      'aaaaaaaa-0000-4000-8000-000000000099',
      'aaaaaaaa-0000-4000-8000-000000000023'
    );
    raise exception 'Normal user unexpectedly processed a deletion request';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as schemas on schemas.oid = functions.pronamespace
    where schemas.nspname = 'public'
      and functions.proname in (
        'get_admin_summary',
        'get_admin_user_directory',
        'get_admin_user_detail',
        'admin_set_account_status',
        'admin_set_role',
        'admin_process_deletion_request',
        'bootstrap_grant_admin'
      )
      and pg_catalog.has_function_privilege('anon', functions.oid, 'execute')
  ) then
    raise exception 'Anon can execute an admin RPC';
  end if;
end;
$$;

set local role service_role;
do $$
declare
  first_grant boolean;
  repeated_grant boolean;
begin
  select public.bootstrap_grant_admin(
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-0000-4000-8000-000000000010'
  ) into first_grant;
  select public.bootstrap_grant_admin(
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-0000-4000-8000-000000000011'
  ) into repeated_grant;

  if not first_grant or repeated_grant then
    raise exception 'Atomic bootstrap role grant is not idempotent';
  end if;
  if (
    select count(*)
    from public.user_roles
    where user_id = '11111111-1111-4111-8111-111111111111'
      and role = 'admin'
  ) <> 1 then
    raise exception 'Atomic bootstrap did not create exactly one admin role';
  end if;
  if not exists (
    select 1 from public.admin_audit_log
    where request_id = 'aaaaaaaa-0000-4000-8000-000000000010'
      and action = 'role.grant.bootstrap'
  ) or exists (
    select 1 from public.admin_audit_log
    where request_id = 'aaaaaaaa-0000-4000-8000-000000000011'
  ) then
    raise exception 'Atomic bootstrap audit contract failed';
  end if;
end;
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
do $$
begin
  begin
    perform public.get_admin_summary();
    raise exception 'AAL1 admin unexpectedly accessed admin summary';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.get_admin_user_directory();
    raise exception 'AAL1 admin unexpectedly accessed admin directory';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.get_admin_user_detail(
      '22222222-2222-4222-8222-222222222222',
      'aaaaaaaa-0000-4000-8000-000000000012'
    );
    raise exception 'AAL1 admin unexpectedly accessed admin detail';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.admin_set_account_status(
      '22222222-2222-4222-8222-222222222222', 'suspended',
      'aaaaaaaa-0000-4000-8000-000000000013'
    );
    raise exception 'AAL1 admin unexpectedly changed account status';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.admin_set_role(
      '22222222-2222-4222-8222-222222222222', 'admin', true,
      'aaaaaaaa-0000-4000-8000-000000000014'
    );
    raise exception 'AAL1 admin unexpectedly changed a role';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.admin_process_deletion_request(
      'aaaaaaaa-0000-4000-8000-000000000099',
      'aaaaaaaa-0000-4000-8000-000000000015'
    );
    raise exception 'AAL1 admin unexpectedly processed a deletion request';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
do $$
begin
  if (public.get_admin_summary()->>'registered_users')::integer < 2 then
    raise exception 'AAL2 admin summary failed';
  end if;
  if pg_catalog.pg_get_function_result('public.get_admin_user_directory()'::regprocedure)
    ~* '(ticker|instrument_name|market_value|net_liquidity|risk_amount)' then
    raise exception 'Admin directory exposes portfolio data';
  end if;
  perform public.get_admin_user_detail(
    '22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-0000-4000-8000-000000000016'
  );
  if not exists (
    select 1 from public.admin_audit_log
    where request_id = 'aaaaaaaa-0000-4000-8000-000000000016'
      and action = 'user_detail.open'
  ) then
    raise exception 'Opening admin user detail was not audited';
  end if;
end;
$$;

select public.admin_set_account_status(
  '22222222-2222-4222-8222-222222222222', 'suspended',
  'aaaaaaaa-0000-4000-8000-000000000001'
);
do $$
begin
  if not exists (
    select 1 from public.admin_audit_log
    where request_id = 'aaaaaaaa-0000-4000-8000-000000000001'
      and action = 'account_status.change'
  ) then
    raise exception 'Admin status action was not audited';
  end if;
end;
$$;
select public.admin_set_account_status(
  '22222222-2222-4222-8222-222222222222', 'active',
  'aaaaaaaa-0000-4000-8000-000000000002'
);

select public.admin_set_role(
  '22222222-2222-4222-8222-222222222222', 'admin', true,
  'aaaaaaaa-0000-4000-8000-000000000003'
);
select public.admin_set_role(
  '22222222-2222-4222-8222-222222222222', 'admin', false,
  'aaaaaaaa-0000-4000-8000-000000000004'
);

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}', true);
select public.request_account_deletion();

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
select public.admin_process_deletion_request(
  (select id from public.account_deletion_requests where user_id = '22222222-2222-4222-8222-222222222222'),
  'aaaaaaaa-0000-4000-8000-000000000005'
);
do $$
begin
  if not exists (
    select 1 from public.admin_audit_log
    where request_id = 'aaaaaaaa-0000-4000-8000-000000000005'
      and action = 'deletion_request.processing_started'
  ) then
    raise exception 'Deletion processing was not audited';
  end if;
end;
$$;

reset role;

update public.app_runtime_settings set registration_mode = 'invite' where singleton = true;
insert into public.user_invitations (email, token_hash, invited_by, expires_at, accepted_at, created_at)
values
  ('invite@example.invalid', repeat('a', 64), '11111111-1111-4111-8111-111111111111', now() + interval '1 hour', null, now()),
  ('expired@example.invalid', repeat('b', 64), '11111111-1111-4111-8111-111111111111', now() - interval '1 hour', null, now() - interval '2 hours');

set local role anon;
do $$
begin
  if not public.validate_invitation('invite@example.invalid', repeat('a', 64)) then
    raise exception 'Valid invitation rejected';
  end if;
  if public.validate_invitation('expired@example.invalid', repeat('b', 64)) then
    raise exception 'Expired invitation accepted';
  end if;
  if public.validate_invitation('invite@example.invalid', repeat('a', 63)) then
    raise exception 'Short invitation hash accepted';
  end if;
  if public.validate_invitation('invite@example.invalid', repeat('g', 64)) then
    raise exception 'Non-hex invitation hash accepted';
  end if;
  if public.validate_invitation('wrong@example.invalid', repeat('a', 64)) then
    raise exception 'Invitation accepted without matching email and token hash';
  end if;
end;
$$;
reset role;

update public.user_invitations set accepted_at = now() where email = 'invite@example.invalid';
set local role anon;
do $$
begin
  if public.validate_invitation('invite@example.invalid', repeat('a', 64)) then
    raise exception 'Invitation accepted twice';
  end if;
end;
$$;
reset role;

update public.app_runtime_settings set registration_mode = 'closed' where singleton = true;
do $$
begin
  begin
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'closed@example.invalid', '', '{}', '{}', now(), now()
    );
    raise exception 'Closed registration unexpectedly created a user';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

rollback;
