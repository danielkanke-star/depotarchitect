create index user_invitations_invited_by_idx
  on public.user_invitations(invited_by);
create index account_deletion_requests_processed_by_idx
  on public.account_deletion_requests(processed_by);

drop policy user_profiles_select_own on public.user_profiles;
drop policy user_profiles_admin_select on public.user_profiles;
create policy user_profiles_select_own_or_admin
  on public.user_profiles for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin_aal2()));

drop policy account_deletion_requests_select_own on public.account_deletion_requests;
drop policy account_deletion_requests_admin_select on public.account_deletion_requests;
create policy account_deletion_requests_select_own_or_admin
  on public.account_deletion_requests for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin_aal2()));

create policy app_runtime_settings_explicit_deny
  on public.app_runtime_settings for all to anon, authenticated
  using (false) with check (false);
create policy role_permissions_explicit_deny
  on public.role_permissions for all to anon, authenticated
  using (false) with check (false);
create policy user_invitations_explicit_deny
  on public.user_invitations for all to anon, authenticated
  using (false) with check (false);
create policy user_roles_explicit_deny
  on public.user_roles for all to anon, authenticated
  using (false) with check (false);
