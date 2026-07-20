create type public.app_role as enum ('user', 'admin');
create type public.app_permission as enum (
  'admin.read_user_directory',
  'admin.update_account_status',
  'admin.manage_roles',
  'admin.process_deletion_requests'
);
create type public.account_status as enum (
  'active',
  'invited',
  'suspended',
  'deletion_requested',
  'deleted'
);
create type public.legal_document_type as enum (
  'privacy_notice',
  'terms_of_use',
  'risk_notice'
);
create type public.deletion_request_status as enum (
  'pending',
  'confirmed',
  'processing',
  'completed',
  'rejected'
);

create table public.app_runtime_settings (
  singleton boolean primary key default true check (singleton),
  registration_mode text not null default 'closed'
    check (registration_mode in ('closed', 'invite', 'open')),
  updated_at timestamptz not null default now()
);

insert into public.app_runtime_settings (singleton, registration_mode)
values (true, 'closed');

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_status public.account_status not null default 'active',
  plan text not null default 'test',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  onboarding_completed_at timestamptz,
  scheduled_deletion_at timestamptz
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role public.app_role not null,
  permission public.app_permission not null,
  created_at timestamptz not null default now(),
  unique (role, permission)
);

insert into public.role_permissions (role, permission)
values
  ('admin', 'admin.read_user_directory'),
  ('admin', 'admin.update_account_status'),
  ('admin', 'admin.manage_roles'),
  ('admin', 'admin.process_deletion_requests');

create table public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (email = lower(btrim(email))),
  check (expires_at > created_at)
);

create unique index user_invitations_active_email_idx
  on public.user_invitations (email)
  where accepted_at is null;
create unique index user_invitations_token_hash_idx
  on public.user_invitations (token_hash);

create table public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type public.legal_document_type not null,
  document_version text not null,
  accepted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, document_type, document_version)
);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_type text not null,
  request_id uuid not null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 8192),
  created_at timestamptz not null default now(),
  unique (request_id, action)
);

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  status public.deletion_request_status not null default 'pending',
  processed_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create unique index account_deletion_requests_open_user_idx
  on public.account_deletion_requests (user_id)
  where status in ('pending', 'confirmed', 'processing');

create index user_profiles_account_status_idx on public.user_profiles(account_status);
create index user_roles_user_id_idx on public.user_roles(user_id);
create index legal_acceptances_user_id_idx on public.legal_acceptances(user_id);
create index admin_audit_log_admin_user_id_idx on public.admin_audit_log(admin_user_id);
create index admin_audit_log_target_user_id_idx on public.admin_audit_log(target_user_id);
create index account_deletion_requests_user_id_idx on public.account_deletion_requests(user_id);
create index account_deletion_requests_status_idx on public.account_deletion_requests(status);

alter table public.app_runtime_settings enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_invitations enable row level security;
alter table public.legal_acceptances enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.account_deletion_requests enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.user_roles
      where user_id = (select auth.uid())
        and role = 'admin'::public.app_role
    );
$$;

create or replace function public.is_admin_aal2()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
    and coalesce((select auth.jwt()->>'aal'), 'aal1') = 'aal2';
$$;

revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.is_admin_aal2() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin_aal2() to authenticated;

create policy user_profiles_select_own
  on public.user_profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy user_profiles_admin_select
  on public.user_profiles for select to authenticated
  using ((select public.is_admin_aal2()));

create policy legal_acceptances_select_own
  on public.legal_acceptances for select to authenticated
  using ((select auth.uid()) = user_id);
create policy legal_acceptances_insert_own
  on public.legal_acceptances for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy admin_audit_log_admin_select
  on public.admin_audit_log for select to authenticated
  using ((select public.is_admin_aal2()));

create policy account_deletion_requests_select_own
  on public.account_deletion_requests for select to authenticated
  using ((select auth.uid()) = user_id);
create policy account_deletion_requests_insert_own
  on public.account_deletion_requests for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'pending');
create policy account_deletion_requests_admin_select
  on public.account_deletion_requests for select to authenticated
  using ((select public.is_admin_aal2()));

revoke all on public.app_runtime_settings from anon, authenticated;
revoke all on public.user_profiles from anon, authenticated;
revoke all on public.user_roles from anon, authenticated;
revoke all on public.role_permissions from anon, authenticated;
revoke all on public.user_invitations from anon, authenticated;
revoke all on public.legal_acceptances from anon, authenticated;
revoke all on public.admin_audit_log from anon, authenticated;
revoke all on public.account_deletion_requests from anon, authenticated;

grant select on public.user_profiles to authenticated;
grant select, insert on public.legal_acceptances to authenticated;
grant select on public.admin_audit_log to authenticated;
grant select, insert on public.account_deletion_requests to authenticated;

create or replace function public.get_my_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select role
      from public.user_roles
      where user_id = (select auth.uid())
      order by case when role = 'admin'::public.app_role then 0 else 1 end
      limit 1
    ),
    'user'::public.app_role
  );
$$;

create or replace function public.get_my_account_status()
returns public.account_status
language sql
stable
security definer
set search_path = ''
as $$
  select account_status
  from public.user_profiles
  where user_id = (select auth.uid());
$$;

create or replace function public.touch_user_profile()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.user_profiles
  set last_seen_at = now(), updated_at = now()
  where user_id = (select auth.uid())
    and (last_seen_at is null or last_seen_at < now() - interval '15 minutes');
end;
$$;

create or replace function public.validate_invitation(
  invited_email text,
  candidate_token_hash text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_invitations
    cross join public.app_runtime_settings
    where singleton = true
      and registration_mode = 'invite'
      and email = lower(btrim(invited_email))
      and token_hash = lower(candidate_token_hash)
      and accepted_at is null
      and expires_at > now()
  );
$$;

create or replace function public.request_account_deletion()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  deletion_request_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into public.account_deletion_requests (user_id, status)
  values (current_user_id, 'pending')
  on conflict (user_id) where status in ('pending', 'confirmed', 'processing')
  do update set requested_at = public.account_deletion_requests.requested_at
  returning id into deletion_request_id;

  update public.user_profiles
  set account_status = 'deletion_requested', updated_at = now()
  where user_id = current_user_id
    and account_status not in ('suspended', 'deleted');

  return deletion_request_id;
end;
$$;

revoke all on function public.get_my_role() from public, anon;
revoke all on function public.get_my_account_status() from public, anon;
revoke all on function public.touch_user_profile() from public, anon;
revoke all on function public.validate_invitation(text, text) from public;
revoke all on function public.request_account_deletion() from public, anon;

grant execute on function public.get_my_role() to authenticated;
grant execute on function public.get_my_account_status() to authenticated;
grant execute on function public.touch_user_profile() to authenticated;
grant execute on function public.validate_invitation(text, text) to anon, authenticated;
grant execute on function public.request_account_deletion() to authenticated;

create or replace function public.get_admin_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin_aal2() then
    raise exception 'Admin MFA required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'registered_users', (select count(*) from auth.users),
    'confirmed_users', (select count(*) from auth.users where email_confirmed_at is not null),
    'active_users', (select count(*) from public.user_profiles where account_status = 'active'),
    'suspended_users', (select count(*) from public.user_profiles where account_status = 'suspended'),
    'open_deletion_requests', (
      select count(*) from public.account_deletion_requests
      where status in ('pending', 'confirmed', 'processing')
    )
  ) into result;

  return result;
end;
$$;

create or replace function public.get_admin_user_directory()
returns table (
  user_id uuid,
  email text,
  registered_at timestamptz,
  email_confirmed boolean,
  last_login_at timestamptz,
  last_seen_at timestamptz,
  account_status public.account_status,
  plan text,
  portfolio_count bigint,
  position_count bigint,
  last_import_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin_aal2() then
    raise exception 'Admin MFA required' using errcode = '42501';
  end if;

  return query
  select
    users.id,
    users.email::text,
    users.created_at,
    users.email_confirmed_at is not null,
    users.last_sign_in_at,
    profiles.last_seen_at,
    profiles.account_status,
    profiles.plan,
    (select count(*) from public.portfolios where public.portfolios.user_id = users.id),
    (select count(*) from public.positions where public.positions.user_id = users.id),
    null::timestamptz
  from auth.users as users
  join public.user_profiles as profiles on profiles.user_id = users.id
  order by users.created_at desc;
end;
$$;

create or replace function public.get_admin_user_detail(
  target_user uuid,
  audit_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin_aal2() then
    raise exception 'Admin MFA required' using errcode = '42501';
  end if;

  insert into public.admin_audit_log (
    admin_user_id, action, target_user_id, target_type, request_id, metadata
  ) values (
    auth.uid(), 'user_detail.open', target_user, 'user', audit_request_id,
    jsonb_build_object('surface', 'admin_user_detail')
  );

  select jsonb_build_object(
    'user_id', users.id,
    'email', users.email,
    'registered_at', users.created_at,
    'email_confirmed', users.email_confirmed_at is not null,
    'last_login_at', users.last_sign_in_at,
    'last_seen_at', profiles.last_seen_at,
    'account_status', profiles.account_status,
    'plan', profiles.plan,
    'portfolio_count', (
      select count(*) from public.portfolios
      where public.portfolios.user_id = users.id
    ),
    'position_count', (
      select count(*) from public.positions
      where public.positions.user_id = users.id
    ),
    'last_import_at', null,
    'deletion_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', requests.id,
        'requested_at', requests.requested_at,
        'status', requests.status,
        'processed_at', requests.processed_at
      ) order by requests.requested_at desc)
      from public.account_deletion_requests as requests
      where requests.user_id = users.id
    ), '[]'::jsonb)
  ) into result
  from auth.users as users
  join public.user_profiles as profiles on profiles.user_id = users.id
  where users.id = target_user;

  if result is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  return result;
end;
$$;

create or replace function public.admin_set_account_status(
  target_user uuid,
  new_status public.account_status,
  audit_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_status public.account_status;
begin
  if not public.is_admin_aal2() then
    raise exception 'Admin MFA required' using errcode = '42501';
  end if;
  if new_status not in ('active'::public.account_status, 'suspended'::public.account_status) then
    raise exception 'Unsupported account status' using errcode = '22023';
  end if;
  if target_user = auth.uid() and new_status = 'suspended'::public.account_status then
    raise exception 'Administrators cannot suspend their own account' using errcode = '22023';
  end if;

  select account_status into previous_status
  from public.user_profiles where user_id = target_user for update;
  if previous_status is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  update public.user_profiles
  set account_status = new_status, updated_at = now()
  where user_id = target_user;

  insert into public.admin_audit_log (
    admin_user_id, action, target_user_id, target_type, request_id, metadata
  ) values (
    auth.uid(), 'account_status.change', target_user, 'user', audit_request_id,
    jsonb_build_object('from', previous_status, 'to', new_status)
  );
end;
$$;

create or replace function public.admin_set_role(
  target_user uuid,
  target_role public.app_role,
  assign_role boolean,
  audit_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin_aal2() then
    raise exception 'Admin MFA required' using errcode = '42501';
  end if;
  if target_role <> 'admin'::public.app_role then
    raise exception 'Only the admin role is managed here' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = target_user) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if not assign_role and target_user = auth.uid() then
    raise exception 'Administrators cannot remove their own role' using errcode = '22023';
  end if;
  if not assign_role and (
    select count(*) from public.user_roles where role = 'admin'::public.app_role
  ) <= 1 then
    raise exception 'The last admin role cannot be removed' using errcode = '22023';
  end if;

  if assign_role then
    insert into public.user_roles (user_id, role)
    values (target_user, target_role)
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles
    where user_id = target_user and role = target_role;
  end if;

  insert into public.admin_audit_log (
    admin_user_id, action, target_user_id, target_type, request_id, metadata
  ) values (
    auth.uid(), case when assign_role then 'role.grant' else 'role.revoke' end,
    target_user, 'user_role', audit_request_id,
    jsonb_build_object('role', target_role)
  );
end;
$$;

create or replace function public.admin_process_deletion_request(
  deletion_request uuid,
  audit_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_owner uuid;
begin
  if not public.is_admin_aal2() then
    raise exception 'Admin MFA required' using errcode = '42501';
  end if;

  update public.account_deletion_requests
  set status = 'processing',
      processed_at = now(),
      processed_by = auth.uid(),
      notes = 'Manuelle Prüfung begonnen; keine automatische Löschung ausgeführt.'
  where id = deletion_request
    and status in ('pending', 'confirmed')
  returning user_id into request_owner;

  if request_owner is null then
    raise exception 'Open deletion request not found' using errcode = 'P0002';
  end if;

  insert into public.admin_audit_log (
    admin_user_id, action, target_user_id, target_type, request_id, metadata
  ) values (
    auth.uid(), 'deletion_request.processing_started', request_owner,
    'account_deletion_request', audit_request_id,
    jsonb_build_object('request_id', deletion_request, 'automatic_deletion', false)
  );
end;
$$;

revoke all on function public.get_admin_summary() from public, anon, authenticated;
revoke all on function public.get_admin_user_directory() from public, anon, authenticated;
revoke all on function public.get_admin_user_detail(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_set_account_status(uuid, public.account_status, uuid) from public, anon, authenticated;
revoke all on function public.admin_set_role(uuid, public.app_role, boolean, uuid) from public, anon, authenticated;
revoke all on function public.admin_process_deletion_request(uuid, uuid) from public, anon, authenticated;

grant execute on function public.get_admin_summary() to authenticated;
grant execute on function public.get_admin_user_directory() to authenticated;
grant execute on function public.get_admin_user_detail(uuid, uuid) to authenticated;
grant execute on function public.admin_set_account_status(uuid, public.account_status, uuid) to authenticated;
grant execute on function public.admin_set_role(uuid, public.app_role, boolean, uuid) to authenticated;
grant execute on function public.admin_process_deletion_request(uuid, uuid) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  runtime_mode text;
  invite_hash text;
  consumed_invitation uuid;
begin
  select registration_mode into runtime_mode
  from public.app_runtime_settings where singleton = true;

  if runtime_mode = 'closed' then
    raise exception 'Registration is currently closed' using errcode = '42501';
  end if;

  if runtime_mode = 'invite' then
    invite_hash := lower(coalesce(new.raw_user_meta_data->>'invitation_token_hash', ''));
    update public.user_invitations
    set accepted_at = now()
    where email = lower(btrim(new.email))
      and token_hash = invite_hash
      and accepted_at is null
      and expires_at > now()
    returning id into consumed_invitation;

    if consumed_invitation is null then
      raise exception 'A valid invitation is required' using errcode = '42501';
    end if;
  end if;

  insert into public.user_profiles (user_id, account_status, plan, created_at, updated_at)
  values (
    new.id,
    case when runtime_mode = 'invite' then 'invited'::public.account_status else 'active'::public.account_status end,
    'test',
    coalesce(new.created_at, now()),
    now()
  );

  insert into public.user_roles (user_id, role)
  values (new.id, 'user');

  if coalesce((new.raw_user_meta_data->>'privacy_notice_acknowledged')::boolean, false) then
    insert into public.legal_acceptances (user_id, document_type, document_version)
    values (new.id, 'privacy_notice', coalesce(new.raw_user_meta_data->>'privacy_notice_version', 'unknown'));
  end if;
  if coalesce((new.raw_user_meta_data->>'terms_of_use_accepted')::boolean, false) then
    insert into public.legal_acceptances (user_id, document_type, document_version)
    values (new.id, 'terms_of_use', coalesce(new.raw_user_meta_data->>'terms_of_use_version', 'unknown'));
  end if;
  if coalesce((new.raw_user_meta_data->>'risk_notice_acknowledged')::boolean, false) then
    insert into public.legal_acceptances (user_id, document_type, document_version)
    values (new.id, 'risk_notice', coalesce(new.raw_user_meta_data->>'risk_notice_version', 'unknown'));
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created_depotarchitect_profile
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.user_profiles (
  user_id, account_status, plan, created_at, updated_at, last_seen_at
)
select
  users.id,
  'active'::public.account_status,
  'test',
  users.created_at,
  now(),
  users.last_sign_in_at
from auth.users as users
on conflict (user_id) do nothing;

insert into public.user_roles (user_id, role)
select users.id, 'user'::public.app_role
from auth.users as users
on conflict (user_id, role) do nothing;
