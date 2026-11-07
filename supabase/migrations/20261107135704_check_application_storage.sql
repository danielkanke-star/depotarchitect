create function public.check_application_storage(section text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case section
    when 'portfolio' then
      pg_catalog.to_regclass('public.portfolios') is not null
      and pg_catalog.to_regclass('public.positions') is not null
    when 'journal' then
      pg_catalog.to_regclass('public.position_sales') is not null
      and pg_catalog.to_regclass('public.journal_source_references') is not null
    when 'market_data' then
      pg_catalog.to_regclass('public.position_price_observations') is not null
      and pg_catalog.to_regclass('public.market_listing_quotes') is not null
    else false
  end;
$$;

revoke all on function public.check_application_storage(text) from public, anon, authenticated, service_role;
grant execute on function public.check_application_storage(text) to anon;
