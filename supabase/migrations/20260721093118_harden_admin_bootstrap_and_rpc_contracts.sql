create or replace function public.bootstrap_grant_admin(
  target_user uuid,
  audit_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_roles integer;
begin
  if target_user is null or audit_request_id is null then
    raise exception 'Target user and audit request are required' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = target_user) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  insert into public.user_roles (user_id, role)
  values (target_user, 'admin'::public.app_role)
  on conflict (user_id, role) do nothing;

  get diagnostics inserted_roles = row_count;

  if inserted_roles = 0 then
    return false;
  end if;

  insert into public.admin_audit_log (
    admin_user_id,
    action,
    target_user_id,
    target_type,
    request_id,
    metadata
  ) values (
    target_user,
    'role.grant.bootstrap',
    target_user,
    'user_role',
    audit_request_id,
    jsonb_build_object('role', 'admin', 'source', 'grant-admin-script')
  );

  return true;
end;
$$;

revoke all on function public.bootstrap_grant_admin(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.bootstrap_grant_admin(uuid, uuid)
  to service_role;

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
  select
    invited_email is not null
    and candidate_token_hash is not null
    and length(lower(candidate_token_hash)) = 64
    and lower(candidate_token_hash) ~ '^[0-9a-f]{64}$'
    and exists (
      select 1
      from public.user_invitations
      cross join public.app_runtime_settings
      where singleton = true
        and registration_mode = 'invite'
        and email = lower(btrim(invited_email))
        and token_hash = lower(candidate_token_hash)
        and length(token_hash) = 64
        and token_hash ~ '^[0-9a-f]{64}$'
        and accepted_at is null
        and expires_at > now()
    );
$$;

revoke all on function public.validate_invitation(text, text)
  from public, anon, authenticated;
grant execute on function public.validate_invitation(text, text)
  to anon;
