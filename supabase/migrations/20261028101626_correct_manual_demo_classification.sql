-- Reversible maintenance-only correction of explicitly identified examples.
-- No data is reclassified by this migration; RLS and API grants stay unchanged.

create or replace function public.enforce_position_provenance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.notes = 'Beispieldatensatz für Meilenstein 1'
     and new.source_import_id is null then
    new.source_type := 'demo';
  end if;

  -- The existing RPC writes its legacy compatibility value. Normalize only new
  -- imported positions; existing rows with `csv` provenance remain unchanged.
  if tg_op = 'INSERT'
     and new.source_type = 'csv'
     and new.source_import_id is not null then
    new.source_type := 'custom_csv';
  end if;

  if tg_op = 'UPDATE' and (
    new.source_type is distinct from old.source_type
    or new.source_import_id is distinct from old.source_import_id
    or new.imported_at is distinct from old.imported_at
  ) then
    -- A direct database maintenance session may correct an explicitly identified
    -- manual example, or restore it from a backup. Application requests, imported
    -- lots and lots with executions retain immutable provenance.
    if not (
      current_user in ('postgres', 'supabase_admin')
      and auth.uid() is null
      and old.source_type in ('manual', 'demo')
      and new.source_type in ('manual', 'demo')
      and old.source_import_id is null and new.source_import_id is null
      and old.imported_at is null and new.imported_at is null
      and not exists (
        select 1 from public.position_sales as sales
        where sales.position_id = old.id
      )
    ) then
      raise exception 'Position provenance cannot be changed' using errcode = '22023';
    end if;
  end if;

  if new.source_type in ('csv', 'custom_csv') then
    if new.source_import_id is null or new.imported_at is null then
      raise exception 'Imported positions require import provenance' using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.portfolio_imports as imports
      where imports.id = new.source_import_id
        and imports.user_id = new.user_id
        and imports.portfolio_id = new.portfolio_id
        and imports.source_type = new.source_type
        and imports.import_status in ('processing', 'completed')
    ) then
      raise exception 'Import provenance does not match the position' using errcode = '23514';
    end if;
  elsif new.source_import_id is not null or new.imported_at is not null then
    raise exception 'Only imported positions may reference an import' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_position_provenance()
  from public, anon, authenticated;

