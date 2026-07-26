-- Cover the composite owner foreign key used to keep portfolio_id and user_id
-- inseparable for capital movements.

create index portfolio_capital_movements_portfolio_owner_idx
  on public.portfolio_capital_movements(portfolio_id, user_id);
