-- Cover the complete owner-scoped connection FK for cascade and ownership checks.
create index ibkr_quotes_connection_owner_idx on public.ibkr_quotes(connection_id,user_id);
create index ibkr_requests_connection_owner_idx on public.ibkr_quote_requests(connection_id,user_id);
