-- Milestone 2B.5 keeps technical market data internal while adding only the
-- user-facing source data needed for account type, sales and capital movements.

alter table public.portfolios
  add column account_type text not null default 'margin_account'
  check (
    account_type in (
      'cash_account',
      'margin_account',
      'portfolio_margin_account',
      'other'
    )
  );

comment on column public.portfolios.account_type is
  'Determines whether position-level margin input is applicable in the regular user flow.';

alter table public.positions
  add column sold_quantity numeric(18,6) not null default 0
    check (sold_quantity >= 0 and sold_quantity <= quantity),
  add column sale_price numeric(18,6)
    check (sale_price is null or sale_price >= 0),
  add column sale_date date,
  add constraint positions_sale_details_check check (
    (sold_quantity = 0 and sale_price is null and sale_date is null)
    or
    (sold_quantity > 0 and sale_price is not null and sale_date is not null)
  );

comment on column public.positions.sold_quantity is
  'Cumulative sold quantity. Remaining open quantity is quantity minus sold_quantity.';
comment on column public.positions.sale_price is
  'Simplified cumulative sale reference price in instrument currency; detailed transactions follow in 2C.';
comment on column public.positions.sale_date is
  'Date of the simplified cumulative sale reference; detailed transactions follow in 2C.';

alter table public.portfolios
  add constraint portfolios_id_user_id_unique unique (id, user_id);

create table public.portfolio_capital_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null,
  movement_type text not null check (
    movement_type in ('deposit', 'withdrawal')
  ),
  amount_native numeric(18,2) not null check (amount_native > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  movement_date date not null,
  comment text check (
    comment is null or char_length(comment) <= 500
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_capital_movements_portfolio_owner_fk
    foreign key (portfolio_id, user_id)
    references public.portfolios(id, user_id)
    on delete cascade
);

create index portfolio_capital_movements_user_id_idx
  on public.portfolio_capital_movements(user_id);

create index portfolio_capital_movements_portfolio_date_idx
  on public.portfolio_capital_movements(portfolio_id, movement_date desc);

alter table public.portfolio_capital_movements enable row level security;

create policy "capital_movements_select_own"
  on public.portfolio_capital_movements
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "capital_movements_insert_own"
  on public.portfolio_capital_movements
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on public.portfolio_capital_movements
  from public, anon, authenticated;
grant select, insert on public.portfolio_capital_movements
  to authenticated;

comment on table public.portfolio_capital_movements is
  'External deposits and withdrawals assigned to one portfolio. They are separate from cash balances, security transactions, NetLiq and performance.';
