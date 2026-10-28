-- Captured source references are separate from historical execution FX and entry margin.
create table public.journal_source_references (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  position_id uuid unique references public.positions(id) on delete cascade,
  source_key text not null check(length(source_key) between 1 and 200),
  source_values jsonb not null check(jsonb_typeof(source_values)='object' and octet_length(source_values::text)<12000
    and source_values ?& array['version','capturedAt','ticker','currency','units','entryPrice','fxToBase','sale','marginRate']),
  created_at timestamptz not null default now(),
  unique(portfolio_id,source_key)
);
create index journal_sources_user_idx on public.journal_source_references(user_id);
alter table public.journal_source_references enable row level security;
revoke all on public.journal_source_references from public,anon,authenticated;
grant select,insert on public.journal_source_references to authenticated;
create policy journal_sources_read on public.journal_source_references for select to authenticated using ((select auth.uid())=user_id);
create policy journal_sources_insert on public.journal_source_references for insert to authenticated with check (
  (select auth.uid())=user_id
  and exists(select 1 from public.portfolios p where p.id=portfolio_id and p.user_id=(select auth.uid()))
  and (position_id is null or exists(select 1 from public.positions p where p.id=position_id and p.portfolio_id=journal_source_references.portfolio_id and p.user_id=(select auth.uid())))
);
comment on table public.journal_source_references is 'Immutable captured sheet inputs. Current sheet FX/margin references are explicitly not historical broker execution data. Unlinked dated/undated source records remain distinguishable.';

-- Preserve the original importer and make source-reference persistence atomic with it.
alter function public.import_position_journal(uuid,jsonb) set schema app_private;
revoke all on function app_private.import_position_journal(uuid,jsonb) from public,anon,authenticated;
create function public.import_position_journal(target_portfolio uuid,entries jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; item jsonb; pos uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.user_profiles where user_id=auth.uid() and account_status='active') then raise exception 'Not authorized'; end if;
  result:=app_private.import_position_journal(target_portfolio,entries);
  for item in select * from jsonb_array_elements(entries) loop
    if item->'source_reference' is not null and item->'source_reference'<>'null'::jsonb then
      select id into pos from public.positions where portfolio_id=target_portfolio and user_id=auth.uid() and journal_source_key=item->>'source_key';
      if pos is null then raise exception 'Source position missing'; end if;
      insert into public.journal_source_references(user_id,portfolio_id,position_id,source_key,source_values)
      values(auth.uid(),target_portfolio,pos,'position:'||pos::text,item->'source_reference') on conflict(position_id) do nothing;
    end if;
  end loop;
  return result;
end $$;
revoke all on function public.import_position_journal(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.import_position_journal(uuid,jsonb) to authenticated;
