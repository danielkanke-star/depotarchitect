create or replace function public.initialize_default_portfolio()
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  default_portfolio_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('depotarchitect:initialize:' || current_user_id::text, 0)
  );

  select id
  into default_portfolio_id
  from public.portfolios
  where user_id = current_user_id
  order by created_at
  limit 1;

  if default_portfolio_id is not null then
    return default_portfolio_id;
  end if;

  insert into public.portfolios (
    user_id,
    name,
    currency,
    net_liquidity,
    margin_used_pct,
    risk_budget_used_pct,
    risk_profile
  )
  values (
    current_user_id,
    'Hauptdepot',
    'EUR',
    35682.07,
    45.7,
    143,
    'Aggressiv 1,0'
  )
  returning id into default_portfolio_id;

  insert into public.portfolio_categories (portfolio_id, user_id, name, sort_order)
  values
    (default_portfolio_id, current_user_id, 'Kerninvestment', 0),
    (default_portfolio_id, current_user_id, 'Momentumtrade', 1),
    (default_portfolio_id, current_user_id, 'taktische Beimischung', 2),
    (default_portfolio_id, current_user_id, 'Hedge', 3);

  insert into public.portfolio_settings (
    portfolio_id,
    user_id,
    risk_model,
    risk_per_trade_pct,
    max_margin_pct,
    max_position_pct,
    max_sector_pct,
    max_drawdown_pct
  )
  values (
    default_portfolio_id,
    current_user_id,
    'risk_per_trade',
    0.82,
    50,
    15,
    50,
    8
  );

  insert into public.positions (
    portfolio_id,
    user_id,
    category_id,
    ticker,
    instrument_name,
    instrument_type,
    direction,
    quantity,
    entry_price,
    current_price,
    market_value,
    risk_amount,
    sector,
    status,
    notes
  )
  select
    default_portfolio_id,
    current_user_id,
    category.id,
    demo.ticker,
    demo.instrument_name,
    case when demo.ticker like '%PUT%' then 'option' else 'stock' end,
    demo.direction,
    1,
    demo.market_value,
    demo.market_value,
    demo.market_value,
    demo.risk_amount,
    demo.sector,
    demo.status,
    'Beispieldatensatz für Meilenstein 1'
  from jsonb_to_recordset($positions$
    [
      {"ticker":"NOW","instrument_name":"ServiceNow","category_name":"Kerninvestment","direction":"long","market_value":12000,"risk_amount":520,"sector":"Software","status":"high"},
      {"ticker":"NVO","instrument_name":"Novo Nordisk","category_name":"Kerninvestment","direction":"long","market_value":8500,"risk_amount":390,"sector":"Gesundheit","status":"active"},
      {"ticker":"ANET","instrument_name":"Arista Networks","category_name":"Momentumtrade","direction":"long","market_value":6500,"risk_amount":410,"sector":"Netzwerk","status":"active"},
      {"ticker":"SHOP","instrument_name":"Shopify","category_name":"Momentumtrade","direction":"long","market_value":5800,"risk_amount":360,"sector":"Software","status":"watch"},
      {"ticker":"MSFT","instrument_name":"Microsoft","category_name":"Kerninvestment","direction":"long","market_value":7200,"risk_amount":280,"sector":"Software","status":"active"},
      {"ticker":"NVDA","instrument_name":"Nvidia","category_name":"Momentumtrade","direction":"long","market_value":6800,"risk_amount":470,"sector":"Halbleiter","status":"high"},
      {"ticker":"QQQ PUT","instrument_name":"Nasdaq Hedge","category_name":"Hedge","direction":"long_put","market_value":1700,"risk_amount":170,"sector":"Index","status":"active"},
      {"ticker":"ORCL","instrument_name":"Oracle","category_name":"Kerninvestment","direction":"long","market_value":6500,"risk_amount":270,"sector":"Software","status":"active"},
      {"ticker":"GLW","instrument_name":"Corning","category_name":"taktische Beimischung","direction":"long","market_value":4200,"risk_amount":250,"sector":"Hardware","status":"active"},
      {"ticker":"LRCX","instrument_name":"Lam Research","category_name":"Momentumtrade","direction":"long","market_value":5100,"risk_amount":340,"sector":"Halbleiter","status":"active"},
      {"ticker":"CRDO","instrument_name":"Credo Technology","category_name":"Momentumtrade","direction":"long","market_value":3800,"risk_amount":320,"sector":"Halbleiter","status":"watch"},
      {"ticker":"META","instrument_name":"Meta Platforms","category_name":"Kerninvestment","direction":"long","market_value":6800,"risk_amount":290,"sector":"Kommunikation","status":"active"},
      {"ticker":"NET","instrument_name":"Cloudflare","category_name":"taktische Beimischung","direction":"long","market_value":3400,"risk_amount":260,"sector":"Software","status":"watch"},
      {"ticker":"UNH","instrument_name":"UnitedHealth","category_name":"taktische Beimischung","direction":"long","market_value":4000,"risk_amount":230,"sector":"Gesundheit","status":"active"},
      {"ticker":"AAPL","instrument_name":"Apple","category_name":"Kerninvestment","direction":"long","market_value":4000,"risk_amount":180,"sector":"Hardware","status":"active"},
      {"ticker":"GOOG","instrument_name":"Alphabet","category_name":"Kerninvestment","direction":"long","market_value":5241,"risk_amount":260,"sector":"Kommunikation","status":"active"}
    ]
  $positions$::jsonb) as demo(
    ticker text,
    instrument_name text,
    category_name text,
    direction text,
    market_value numeric,
    risk_amount numeric,
    sector text,
    status text
  )
  join public.portfolio_categories as category
    on category.portfolio_id = default_portfolio_id
   and category.name = demo.category_name;

  return default_portfolio_id;
end;
$$;

revoke all on function public.initialize_default_portfolio() from public;
revoke all on function public.initialize_default_portfolio() from anon;
grant execute on function public.initialize_default_portfolio() to authenticated;
