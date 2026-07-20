create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Hauptdepot',
  currency text not null default 'EUR',
  net_liquidity numeric(18,2) not null default 0 check (net_liquidity >= 0),
  margin_used_pct numeric(8,2) not null default 0 check (margin_used_pct >= 0),
  risk_budget_used_pct numeric(8,2) not null default 0 check (risk_budget_used_pct >= 0),
  risk_profile text not null default 'Aggressiv 1,0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.portfolio_categories (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (portfolio_id, name)
);

create table if not exists public.portfolio_settings (
  portfolio_id uuid primary key references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  risk_model text not null default 'risk_per_trade',
  risk_per_trade_pct numeric(8,3) not null default 0.82 check (risk_per_trade_pct >= 0),
  max_margin_pct numeric(8,2) not null default 50 check (max_margin_pct >= 0),
  max_position_pct numeric(8,2) not null default 15 check (max_position_pct >= 0),
  max_sector_pct numeric(8,2) not null default 50 check (max_sector_pct >= 0),
  max_drawdown_pct numeric(8,2) not null default 8 check (max_drawdown_pct >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.portfolio_categories(id) on delete set null,
  ticker text not null,
  instrument_name text,
  instrument_type text not null default 'stock' check (instrument_type in ('stock','etf','option','cash','other')),
  direction text not null default 'long' check (direction in ('long','short','long_put','long_call','short_put','short_call')),
  quantity numeric(18,6) not null default 0 check (quantity >= 0),
  multiplier numeric(18,4) not null default 1 check (multiplier > 0),
  entry_price numeric(18,6) not null default 0 check (entry_price >= 0),
  current_price numeric(18,6) check (current_price >= 0),
  stop_price numeric(18,6) check (stop_price >= 0),
  market_value numeric(18,2) not null default 0 check (market_value >= 0),
  risk_amount numeric(18,2) not null default 0 check (risk_amount >= 0),
  margin_requirement numeric(18,2) not null default 0 check (margin_requirement >= 0),
  sector text,
  entry_date date,
  status text not null default 'active' check (status in ('active','watch','high','danger','closed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portfolios_user_id_idx on public.portfolios(user_id);
create index if not exists portfolio_categories_user_id_idx on public.portfolio_categories(user_id);
create index if not exists positions_user_id_idx on public.positions(user_id);
create index if not exists positions_portfolio_id_idx on public.positions(portfolio_id);
create index if not exists positions_category_id_idx on public.positions(category_id);
create index if not exists positions_sector_idx on public.positions(sector);

alter table public.portfolios enable row level security;
alter table public.portfolio_categories enable row level security;
alter table public.portfolio_settings enable row level security;
alter table public.positions enable row level security;

create policy "portfolios_select_own" on public.portfolios for select to authenticated using ((select auth.uid()) = user_id);
create policy "portfolios_insert_own" on public.portfolios for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "portfolios_update_own" on public.portfolios for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "portfolios_delete_own" on public.portfolios for delete to authenticated using ((select auth.uid()) = user_id);

create policy "categories_select_own" on public.portfolio_categories for select to authenticated using ((select auth.uid()) = user_id);
create policy "categories_insert_own" on public.portfolio_categories for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "categories_update_own" on public.portfolio_categories for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "categories_delete_own" on public.portfolio_categories for delete to authenticated using ((select auth.uid()) = user_id);

create policy "settings_select_own" on public.portfolio_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "settings_insert_own" on public.portfolio_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "settings_update_own" on public.portfolio_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "settings_delete_own" on public.portfolio_settings for delete to authenticated using ((select auth.uid()) = user_id);

create policy "positions_select_own" on public.positions for select to authenticated using ((select auth.uid()) = user_id);
create policy "positions_insert_own" on public.positions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "positions_update_own" on public.positions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "positions_delete_own" on public.positions for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.portfolios from anon;
revoke all on public.portfolio_categories from anon;
revoke all on public.portfolio_settings from anon;
revoke all on public.positions from anon;

grant select, insert, update, delete on public.portfolios to authenticated;
grant select, insert, update, delete on public.portfolio_categories to authenticated;
grant select, insert, update, delete on public.portfolio_settings to authenticated;
grant select, insert, update, delete on public.positions to authenticated;
