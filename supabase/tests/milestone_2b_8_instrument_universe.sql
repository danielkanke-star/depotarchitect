begin;
select plan(22);

select has_table('public','market_instruments');
select has_table('public','market_listings');
select has_table('public','market_listing_provider_mappings');
select has_table('public','user_instrument_universe');
select has_table('public','market_listing_quotes');
select has_table('public','market_fx_quotes');
select has_column('public','positions','listing_id');
select has_column('public','positions','listing_resolution_status');
select ok((select relrowsecurity from pg_class where oid='public.market_instruments'::regclass),'market_instruments RLS');
select ok((select relrowsecurity from pg_class where oid='public.market_listings'::regclass),'market_listings RLS');
select ok((select relrowsecurity from pg_class where oid='public.market_listing_provider_mappings'::regclass),'provider mappings RLS');
select ok((select relrowsecurity from pg_class where oid='public.user_instrument_universe'::regclass),'universe RLS');
select ok((select relrowsecurity from pg_class where oid='public.market_listing_quotes'::regclass),'quote cache RLS');
select ok((select relrowsecurity from pg_class where oid='public.market_fx_quotes'::regclass),'FX cache RLS');
select has_function('public','claim_market_quote_refresh',array['uuid','text','text','timestamp with time zone']);
select has_function('public','complete_market_quote_refresh',array['uuid','text','uuid','numeric','text','timestamp with time zone','text','boolean']);
select has_function('public','fail_market_quote_refresh',array['uuid','text','uuid','text','integer']);
select has_function('public','attach_position_listing',array['uuid','text','text','text','text','text','text','text','text','text','boolean']);
select has_function('public','claim_market_data_request',array['text','text','text']);
select function_privs_are('public','claim_market_quote_refresh',array['uuid','text','text','timestamp with time zone'],'anon',array[]::text[]);
select function_privs_are('public','claim_market_quote_refresh',array['uuid','text','text','timestamp with time zone'],'authenticated',array['EXECUTE']);
select function_privs_are('public','claim_market_data_request',array['text','text','text'],'anon',array[]::text[]);

select * from finish();
rollback;
