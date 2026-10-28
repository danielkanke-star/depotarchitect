-- A paired local device reads IBKR; it never receives order commands or a service key.
-- Machine credentials live in an unexposed schema. Public data remains owner-scoped.
create table public.ibkr_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','paired','revoked')),
  gateway_authenticated boolean not null default false,
  brokerage_authenticated boolean not null default false,
  last_seen_at timestamptz,
  last_requested_at timestamptz,
  last_error text check (last_error in ('gateway_offline','login_required','session_competing','account_selection_required','broker_error') or last_error is null),
  created_at timestamptz not null default now(),
  unique(portfolio_id), unique(id,user_id)
);
create index ibkr_connections_user_idx on public.ibkr_connections(user_id);
alter table public.ibkr_connections enable row level security;
revoke all on public.ibkr_connections from public,anon,authenticated;
grant select on public.ibkr_connections to authenticated;
create policy ibkr_connections_owner on public.ibkr_connections for select to authenticated using ((select auth.uid())=user_id);

create table app_private.ibkr_credentials (
  connection_id uuid primary key references public.ibkr_connections(id) on delete cascade,
  pairing_hash text,
  pairing_expires_at timestamptz,
  device_hash text,
  device_expires_at timestamptz
);
alter table app_private.ibkr_credentials enable row level security;
revoke all on app_private.ibkr_credentials from public,anon,authenticated;
create unique index ibkr_device_hash_idx on app_private.ibkr_credentials(device_hash) where device_hash is not null;
create unique index ibkr_pairing_hash_idx on app_private.ibkr_credentials(pairing_hash) where pairing_hash is not null;

create table public.ibkr_quotes (
  connection_id uuid not null,
  user_id uuid not null,
  conid bigint not null check (conid>0),
  quote jsonb not null check (jsonb_typeof(quote)='object' and octet_length(quote::text)<8000),
  fetched_at timestamptz not null default now(),
  primary key(connection_id,conid),
  foreign key(connection_id,user_id) references public.ibkr_connections(id,user_id) on delete cascade
);
create index ibkr_quotes_user_idx on public.ibkr_quotes(user_id);
alter table public.ibkr_quotes enable row level security;
revoke all on public.ibkr_quotes from public,anon,authenticated;
grant select on public.ibkr_quotes to authenticated;
create policy ibkr_quotes_owner on public.ibkr_quotes for select to authenticated using ((select auth.uid())=user_id);

create table public.ibkr_quote_requests (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null,
  user_id uuid not null,
  query text not null check (length(query) between 1 and 80),
  conid bigint check(conid>0),
  state text not null default 'pending' check(state in ('pending','processing','completed')),
  lease uuid,
  lease_until timestamptz,
  result jsonb check(result is null or octet_length(result::text)<64000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '2 minutes',
  foreign key(connection_id,user_id) references public.ibkr_connections(id,user_id) on delete cascade
);
create index ibkr_quote_requests_owner_idx on public.ibkr_quote_requests(user_id,created_at);
create index ibkr_quote_requests_queue_idx on public.ibkr_quote_requests(connection_id,state,created_at);
alter table public.ibkr_quote_requests enable row level security;
revoke all on public.ibkr_quote_requests from public,anon,authenticated;
grant select on public.ibkr_quote_requests to authenticated;
create policy ibkr_quote_requests_owner on public.ibkr_quote_requests for select to authenticated using ((select auth.uid())=user_id);

create function public.create_ibkr_pairing(target_portfolio uuid, code_hash text)
returns uuid language plpgsql security definer set search_path='' as $$
declare connection uuid; caller uuid:=auth.uid();
begin
  if caller is null or not exists(select 1 from public.portfolios where id=target_portfolio and user_id=caller)
    or not exists(select 1 from public.user_profiles where user_id=caller and account_status='active') then
    raise exception 'Not authorized';
  end if;
  if code_hash is null or code_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid pairing'; end if;
  insert into public.ibkr_connections(user_id,portfolio_id) values(caller,target_portfolio)
  on conflict(portfolio_id) do update set state=case when public.ibkr_connections.state='revoked' then 'pending' else public.ibkr_connections.state end
  returning id into connection;
  insert into app_private.ibkr_credentials(connection_id,pairing_hash,pairing_expires_at)
    values(connection,code_hash,now()+interval '10 minutes')
    on conflict(connection_id) do update set pairing_hash=excluded.pairing_hash,pairing_expires_at=excluded.pairing_expires_at;
  return connection;
end $$;
revoke all on function public.create_ibkr_pairing(uuid,text) from public,anon,authenticated;
grant execute on function public.create_ibkr_pairing(uuid,text) to authenticated;

create function public.revoke_ibkr_connection(target_portfolio uuid)
returns void language plpgsql security definer set search_path='' as $$
declare connection uuid;
begin
  select id into connection from public.ibkr_connections where portfolio_id=target_portfolio and user_id=auth.uid() for update;
  if connection is null then raise exception 'Not authorized'; end if;
  update public.ibkr_connections set state='revoked',gateway_authenticated=false,brokerage_authenticated=false where id=connection;
  delete from app_private.ibkr_credentials where connection_id=connection;
end $$;
revoke all on function public.revoke_ibkr_connection(uuid) from public,anon,authenticated;
grant execute on function public.revoke_ibkr_connection(uuid) to authenticated;

create function public.ibkr_bridge_pair(pairing_code text, device_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare connection uuid;
begin
  if pairing_code !~ '^[A-Za-z0-9_-]{43}$' or device_token !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'Invalid pairing'; end if;
  select c.connection_id into connection from app_private.ibkr_credentials c
    join public.ibkr_connections b on b.id=c.connection_id
    join public.user_profiles u on u.user_id=b.user_id and u.account_status='active'
    where c.pairing_hash=encode(sha256(convert_to(pairing_code,'UTF8')),'hex')
      and c.pairing_expires_at>now() and b.state<>'revoked' for update of c;
  if connection is null then raise exception 'Pairing expired or invalid'; end if;
  update app_private.ibkr_credentials set pairing_hash=null,pairing_expires_at=null,
    device_hash=encode(sha256(convert_to(device_token,'UTF8')),'hex'),device_expires_at=now()+interval '30 days'
    where connection_id=connection;
  update public.ibkr_connections set state='paired',last_seen_at=now() where id=connection;
  return connection;
end $$;
revoke all on function public.ibkr_bridge_pair(text,text) from public,anon,authenticated;
grant execute on function public.ibkr_bridge_pair(text,text) to anon,authenticated;

create function app_private.check_ibkr_device(device_token text)
returns uuid language plpgsql set search_path='' as $$
declare connection uuid;
begin
  if device_token !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'Invalid device'; end if;
  select c.connection_id into connection from app_private.ibkr_credentials c
    join public.ibkr_connections b on b.id=c.connection_id and b.state='paired'
    join public.user_profiles u on u.user_id=b.user_id and u.account_status='active'
    where c.device_hash=encode(sha256(convert_to(device_token,'UTF8')),'hex') and c.device_expires_at>now();
  if connection is null then raise exception 'Device expired or revoked'; end if;
  return connection;
end $$;
revoke all on function app_private.check_ibkr_device(text) from public,anon,authenticated;

create function public.request_ibkr_quote(target_portfolio uuid, search_query text, contract_id bigint default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare connection public.ibkr_connections%rowtype; job uuid;
begin
  select * into connection from public.ibkr_connections where portfolio_id=target_portfolio and user_id=auth.uid() and state='paired' for update;
  if connection.id is null then raise exception 'IBKR not paired'; end if;
  if length(btrim(search_query)) not between 1 and 80 or (contract_id is not null and contract_id<=0) then raise exception 'Invalid query'; end if;
  update public.ibkr_connections set last_requested_at=now() where id=connection.id;
  select id into job from public.ibkr_quote_requests where connection_id=connection.id
    and query=upper(btrim(search_query)) and conid is not distinct from contract_id and expires_at>now()
    and (state<>'completed' or created_at>now()-interval '30 seconds') order by created_at desc limit 1;
  if job is not null then return job; end if;
  if (select count(*) from public.ibkr_quote_requests where connection_id=connection.id and created_at>now()-interval '1 minute')>=20 then raise exception 'Quote request limit'; end if;
  insert into public.ibkr_quote_requests(connection_id,user_id,query,conid) values(connection.id,connection.user_id,upper(btrim(search_query)),contract_id) returning id into job;
  return job;
end $$;
revoke all on function public.request_ibkr_quote(uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.request_ibkr_quote(uuid,text,bigint) to authenticated;

create function public.mark_ibkr_active(target_portfolio uuid)
returns void language sql security definer set search_path='' as $$
  update public.ibkr_connections set last_requested_at=now() where portfolio_id=target_portfolio and user_id=auth.uid() and state='paired';
$$;
revoke all on function public.mark_ibkr_active(uuid) from public,anon,authenticated;
grant execute on function public.mark_ibkr_active(uuid) to authenticated;

create function public.ibkr_bridge_poll(device_token text, gateway_ok boolean, brokerage_ok boolean, error_code text default null, quotes jsonb default '[]')
returns jsonb language plpgsql security definer set search_path='' as $$
declare connection uuid; owner_id uuid; active_at timestamptz; jobs jsonb; q jsonb;
begin
  connection:=app_private.check_ibkr_device(device_token);
  if error_code is not null and error_code not in ('gateway_offline','login_required','session_competing','account_selection_required','broker_error') then raise exception 'Invalid status'; end if;
  if jsonb_typeof(quotes)<>'array' or jsonb_array_length(quotes)>1000 or octet_length(quotes::text)>1000000 then raise exception 'Invalid quote payload'; end if;
  update public.ibkr_connections set last_seen_at=now(),gateway_authenticated=gateway_ok,brokerage_authenticated=brokerage_ok,last_error=error_code
    where id=connection returning user_id,last_requested_at into owner_id,active_at;
  for q in select value from jsonb_array_elements(quotes) loop
    if jsonb_typeof(q)<>'object' or not (q ?& array['conid','symbol','currency','assetClass','quality','price','observedAt','fetchedAt','multiplier']) or (q->>'conid') !~ '^[1-9][0-9]{0,15}$'
      or (q->>'currency') !~ '^[A-Z]{3}$' or q->>'assetClass' not in ('STK','OPT')
      or q->>'quality' not in ('live','delayed','end_of_day','broker_valuation','stale')
      or jsonb_typeof(q->'price')<>'number' or (q->>'price')::numeric<0 then raise exception 'Invalid quote'; end if;
    insert into public.ibkr_quotes(connection_id,user_id,conid,quote) values(connection,owner_id,(q->>'conid')::bigint,q)
      on conflict(connection_id,conid) do update set quote=excluded.quote,fetched_at=now();
  end loop;
  delete from public.ibkr_quote_requests where connection_id=connection and created_at<now()-interval '1 day';
  with next_jobs as (
    select id from public.ibkr_quote_requests where connection_id=connection and expires_at>now()
      and (state='pending' or (state='processing' and lease_until<now())) order by created_at limit 3 for update skip locked
  ), claimed as (
    update public.ibkr_quote_requests r set state='processing',lease=gen_random_uuid(),lease_until=now()+interval '45 seconds'
      from next_jobs j where r.id=j.id returning r.id,r.query,r.conid,r.lease
  ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into jobs from claimed;
  return jsonb_build_object('jobs',jobs,'active',coalesce(active_at>now()-interval '2 minutes',false),'waitSeconds',case when active_at>now()-interval '2 minutes' then 2 else 10 end);
end $$;
revoke all on function public.ibkr_bridge_poll(text,boolean,boolean,text,jsonb) from public,anon,authenticated;
grant execute on function public.ibkr_bridge_poll(text,boolean,boolean,text,jsonb) to anon,authenticated;

create function public.ibkr_bridge_complete(device_token text, request_id uuid, request_lease uuid, response jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare connection uuid; changed int;
begin
  connection:=app_private.check_ibkr_device(device_token);
  if jsonb_typeof(response)<>'object' or octet_length(response::text)>64000 then raise exception 'Invalid response'; end if;
  update public.ibkr_quote_requests set state='completed',result=response where id=request_id and connection_id=connection
    and state='processing' and lease=request_lease and lease_until>now() and expires_at>now();
  get diagnostics changed=row_count;
  return changed=1;
end $$;
revoke all on function public.ibkr_bridge_complete(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ibkr_bridge_complete(text,uuid,uuid,jsonb) to anon,authenticated;
