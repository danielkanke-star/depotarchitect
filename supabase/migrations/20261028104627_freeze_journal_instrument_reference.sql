-- Quote lookups may normalize a legacy exchange-prefixed ticker. Keep the
-- original import identity so closed partials and open remainders stay grouped.
alter table public.positions add column journal_instrument_ref text
  check (journal_instrument_ref is null or char_length(journal_instrument_ref) <= 1024);

update public.positions as p
set journal_instrument_ref = jsonb_build_array(p.ticker,p.instrument_currency,p.instrument_type,p.option_type,p.strike_price,p.expiration_date)::text
where p.journal_source_key is not null and p.source_import_id is not null;

create function public.freeze_journal_instrument_reference()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.journal_source_key is not null and new.source_import_id is not null then
      new.journal_instrument_ref := jsonb_build_array(new.ticker,new.instrument_currency,new.instrument_type,new.option_type,new.strike_price,new.expiration_date)::text;
    else
      new.journal_instrument_ref := null;
    end if;
  elsif new.journal_instrument_ref is distinct from old.journal_instrument_ref then
    raise exception 'Original journal instrument reference is immutable' using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function public.freeze_journal_instrument_reference() from public,anon,authenticated;
create trigger positions_freeze_journal_instrument_reference before insert or update on public.positions
for each row execute function public.freeze_journal_instrument_reference();
