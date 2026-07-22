-- Preserve legacy `csv` provenance while recording all new file imports with
-- the broker-neutral source name `custom_csv`. The existing snapshot RPC still
-- emits its legacy compatibility value; the table triggers normalize new rows.

alter table public.portfolio_imports
  add constraint portfolio_imports_source_type_check_v2
  check (source_type in ('csv', 'custom_csv')) not valid;

alter table public.portfolio_imports
  validate constraint portfolio_imports_source_type_check_v2;

alter table public.portfolio_imports
  drop constraint portfolio_imports_source_type_check;

alter table public.portfolio_imports
  rename constraint portfolio_imports_source_type_check_v2
  to portfolio_imports_source_type_check;

alter table public.positions
  add constraint positions_source_type_check_v2
  check (source_type in ('demo', 'manual', 'csv', 'custom_csv')) not valid;

alter table public.positions
  validate constraint positions_source_type_check_v2;

alter table public.positions
  drop constraint positions_source_type_check;

alter table public.positions
  rename constraint positions_source_type_check_v2
  to positions_source_type_check;

create or replace function public.normalize_custom_csv_import_source()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.source_type = 'csv' then
    new.source_type := 'custom_csv';
  end if;

  return new;
end;
$$;

revoke all on function public.normalize_custom_csv_import_source()
  from public, anon, authenticated;

create trigger portfolio_imports_normalize_custom_csv_source
  before insert on public.portfolio_imports
  for each row execute function public.normalize_custom_csv_import_source();

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
    raise exception 'Position provenance cannot be changed' using errcode = '22023';
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

comment on column public.portfolio_imports.source_type is
  'Import source. custom_csv is the broker-neutral manual file fallback; csv remains valid for legacy rows.';

comment on column public.positions.source_type is
  'Position provenance: demo, manual, custom_csv, or legacy csv.';
