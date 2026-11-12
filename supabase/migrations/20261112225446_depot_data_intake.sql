create function public.create_named_portfolio(depot_name text, base_currency text, depot_type text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare caller uuid := auth.uid(); target uuid;
begin
  if caller is null or not exists(select 1 from public.user_profiles where user_id=caller and account_status='active') then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if depot_name is null or length(btrim(depot_name)) not between 1 and 60
    or coalesce(base_currency,'') !~ '^[A-Z]{3}$'
    or coalesce(depot_type,'') not in ('cash_account','margin_account','portfolio_margin_account','other') then
    raise exception 'Ungültige Depotangaben.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('depotarchitect:initialize:' || caller::text,0));
  insert into public.portfolios(user_id,name,currency,account_type,risk_profile)
    values(caller,btrim(depot_name),base_currency,depot_type,'Normal 0,8') returning id into target;
  insert into public.portfolio_categories(portfolio_id,user_id,name,sort_order) values
    (target,caller,'Kerninvestment',0),(target,caller,'Momentumtrade',1),(target,caller,'taktische Beimischung',2),(target,caller,'Hedge',3);
  insert into public.portfolio_settings(portfolio_id,user_id) values(target,caller);
  return target;
end $$;

create table app_private.depot_trade_sources (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null,
  user_id uuid not null,
  kind text not null check(kind in ('csv','flatex','ibkr')),
  account_key text not null check(account_key ~ '^[a-f0-9]{64}$'),
  foreign key (portfolio_id,user_id) references public.portfolios(id,user_id) on delete cascade,
  unique(portfolio_id,kind),
  unique(user_id,kind,account_key)
);
create table app_private.depot_executions (
  source_id uuid not null references app_private.depot_trade_sources(id) on delete cascade,
  reference text not null check(length(reference) between 1 and 150),
  payload jsonb not null,
  position_id uuid references public.positions(id) on delete set null,
  primary key(source_id,reference)
);
create index depot_executions_lots on app_private.depot_executions
  (source_id,(payload->>'instrument'),(payload->>'currency'),(payload->>'direction'),(payload->>'date'),(payload->>'time'),reference)
  where position_id is not null;
create index depot_executions_position on app_private.depot_executions(position_id) where position_id is not null;
alter table app_private.depot_trade_sources enable row level security;
alter table app_private.depot_executions enable row level security;
revoke all on app_private.depot_trade_sources,app_private.depot_executions from public,anon,authenticated;

create table app_private.depot_execution_sales (
  sale_id uuid primary key references public.position_sales(id) on delete cascade,
  source_id uuid not null,
  reference text not null,
  foreign key (source_id,reference) references app_private.depot_executions(source_id,reference) on delete cascade
);
create index depot_execution_sales_execution_idx on app_private.depot_execution_sales(source_id,reference);
alter table app_private.depot_execution_sales enable row level security;
revoke all on app_private.depot_execution_sales from public,anon,authenticated;

create function app_private.guard_imported_sale() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null and exists(select 1 from app_private.depot_execution_sales where sale_id=old.id) then
    raise exception 'Die Ausführung stammt aus einem Brokerbeleg.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger position_sales_guard_imported before update or delete on public.position_sales
for each row execute function app_private.guard_imported_sale();
revoke all on function app_private.guard_imported_sale() from public,anon,authenticated;

create function app_private.guard_imported_lot() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from app_private.depot_executions where position_id=old.id) then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_op='DELETE' then raise exception 'Importierte Einstiege gehören zum Handelsjournal.'; end if;
  if (new.entry_date,new.entry_price,new.quantity,new.direction,new.instrument_type,new.instrument_currency,
      new.multiplier,new.journal_source_key,new.option_type,new.strike_price,new.expiration_date,new.entry_fx_to_base)
    is distinct from (old.entry_date,old.entry_price,old.quantity,old.direction,old.instrument_type,old.instrument_currency,
      old.multiplier,old.journal_source_key,old.option_type,old.strike_price,old.expiration_date,old.entry_fx_to_base) then
    raise exception 'Der importierte Einstieg bleibt als Buchung erhalten.';
  end if;
  return new;
end $$;
create trigger positions_guard_imported_lot before update or delete on public.positions
for each row execute function app_private.guard_imported_lot();

create or replace function public.freeze_journal_instrument_reference()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.journal_source_key is not null and new.source_import_id is not null then
      new.journal_instrument_ref:=jsonb_build_array(
        case when new.journal_source_key like 'execution:%' then coalesce(new.external_position_id,new.ticker) else new.ticker end,
        new.instrument_currency,new.instrument_type,new.option_type,new.strike_price,new.expiration_date)::text;
    else new.journal_instrument_ref:=null;
    end if;
  elsif new.journal_instrument_ref is distinct from old.journal_instrument_ref then
    raise exception 'Original journal instrument reference is immutable' using errcode='22023';
  end if;
  return new;
end $$;

create function app_private.apply_depot_executions(target_portfolio uuid, source_kind text, account_hash text, entries jsonb, allow_existing boolean, preview boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  caller uuid := auth.uid(); depot_currency text; source_key uuid; import_key uuid; item jsonb; saved jsonb;
  lot record; remaining numeric; fill numeric; units numeric; price numeric; factor numeric; rate numeric;
  traded_on date; position_key uuid; sale_key uuid; known_count integer := 0; opened_count integer := 0; closed_count integer := 0;
  match_direction text; chronological_key text; last_close_key text;
begin
  if caller is null or not exists(select 1 from public.user_profiles where user_id=caller and account_status='active') then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  select currency into depot_currency from public.portfolios where id=target_portfolio and user_id=caller for update;
  if not found then raise exception 'Depot nicht verfügbar.' using errcode='42501'; end if;
  if coalesce(source_kind,'') not in ('csv','flatex','ibkr') or coalesce(account_hash,'') !~ '^[a-f0-9]{64}$'
    or entries is null or jsonb_typeof(entries)<>'array' or jsonb_array_length(entries)>2000 then
    raise exception 'Ungültiger Handelsimport.';
  end if;

  -- A dry run executes exactly the same checks and writes in a rolled-back subtransaction.
  begin
    select id into source_key from app_private.depot_trade_sources where portfolio_id=target_portfolio and kind=source_kind and account_key=account_hash;
    if source_key is null then
      if exists(select 1 from app_private.depot_trade_sources where portfolio_id=target_portfolio and kind=source_kind) then
        raise exception 'Dieses Depot ist bereits einem anderen Konto dieser Quelle zugeordnet.';
      end if;
      if exists(select 1 from app_private.depot_trade_sources where user_id=caller and kind=source_kind and account_key=account_hash) then
        raise exception 'Dieses Brokerkonto gehört bereits zu einem anderen Depot.';
      end if;
      if not coalesce(allow_existing,false) and exists(select 1 from public.positions where portfolio_id=target_portfolio and source_type<>'demo') then
        raise exception 'In diesem Depot sind bereits Positionen erfasst. Wähle ein neues Depot oder bestätige, dass sich die Buchungen nicht überschneiden.';
      end if;
      insert into app_private.depot_trade_sources(portfolio_id,user_id,kind,account_key)
        values(target_portfolio,caller,source_kind,account_hash) returning id into source_key;
    end if;
    if jsonb_array_length(entries)>0 then
      insert into public.portfolio_imports(user_id,portfolio_id,source_type,original_filename,total_rows,valid_rows,warning_rows,rejected_rows,import_status,metadata)
      values(caller,target_portfolio,'custom_csv',case source_kind when 'ibkr' then 'IBKR Flex' when 'flatex' then 'flatex-Abrechnungen' else 'Handelsdatei' end,
        jsonb_array_length(entries),jsonb_array_length(entries),0,0,'processing',jsonb_build_object('mode','executions','provider',source_kind)) returning id into import_key;
    end if;
    for item in select value from jsonb_array_elements(entries) order by value->>'date',value->>'time',value->>'effect' desc,value->>'reference' loop
      if coalesce(item->>'effect','') not in ('open','close') or coalesce(item->>'side','') not in ('buy','sell')
        or coalesce(item->>'direction','') not in ('long','short','long_put','long_call','short_put','short_call')
        or coalesce(item->>'type','') not in ('stock','etf','option','other')
        or (left(item->>'direction',4)='long') <> ((item->>'side'='buy')=(item->>'effect'='open'))
        or coalesce(item->>'currency','') !~ '^[A-Z]{3}$'
        or coalesce(item->>'date','') !~ '^\d{4}-\d{2}-\d{2}$'
        or coalesce(item->>'time','') !~ '^(([01]\d|2[0-3]):[0-5]\d:[0-5]\d)?$'
        or length(coalesce(item->>'reference','')) not between 1 and 150
        or length(coalesce(item->>'ticker','')) not between 1 and 80
        or length(coalesce(item->>'instrument','')) not between 1 and 100
        or length(coalesce(item->>'name',''))>200 or length(coalesce(item->>'conversionSource',''))>200 then
        raise exception 'Ungültige Buchung im Bericht.';
      end if;
      units := (item->>'quantity')::numeric;
      price := (item->>'price')::numeric;
      factor := (item->>'multiplier')::numeric;
      traded_on := (item->>'date')::date;
      match_direction := item->>'direction';
      rate := case when depot_currency=item->>'currency' then 1 else (item->>'conversion')::numeric end;
      if units is null or not (units>0 and units<1e12) or scale(trim_scale(units))>6
        or price is null or not (price>=0 and price<1e12) or scale(trim_scale(price))>6
        or factor is null or not (factor>0 and factor<1e9) or scale(trim_scale(factor))>6
        or (rate is not null and not (rate>0 and rate<1e12))
        or traded_on>(now() at time zone 'Europe/Berlin')::date then raise exception 'Datum, Stückzahl oder Kurs im Bericht prüfen.'; end if;

      select payload into saved from app_private.depot_executions where source_id=source_key and reference=item->>'reference';
      if found then
        if (saved - array['conversion','conversionSource','name','ticker','isin']) is distinct from (item - array['conversion','conversionSource','name','ticker','isin']) then
          raise exception 'Eine bereits importierte Buchungsnummer enthält geänderte Handelsdaten. Bitte den Brokerbeleg prüfen.';
        end if;
        known_count:=known_count+1;
        continue;
      end if;

      chronological_key := (item->>'date') || ' ' || coalesce(item->>'time','');
      select max((e.payload->>'date') || ' ' || coalesce(e.payload->>'time','')) into last_close_key
        from app_private.depot_executions e where source_id=source_key and e.payload->>'effect'='close'
          and e.payload->>'instrument'=item->>'instrument' and e.payload->>'currency'=item->>'currency' and e.payload->>'direction'=match_direction;
      if last_close_key is not null and (chronological_key < last_close_key or (chronological_key=last_close_key and item->>'effect'='open')) then
        raise exception 'Buchung für % liegt vor einem bereits importierten Verkauf. Bitte in einem neuen Depot vollständig und chronologisch importieren.',item->>'ticker';
      end if;

      if item->>'effect'='open' then
        insert into public.positions(portfolio_id,user_id,ticker,instrument_name,instrument_type,direction,quantity,multiplier,
          entry_price,entry_date,instrument_currency,entry_fx_to_base,current_fx_to_base,current_fx_status,current_price_status,
          option_type,strike_price,expiration_date,external_position_id,source_type,source_import_id,imported_at,journal_source_key,quantity_step)
        values(target_portfolio,caller,item->>'ticker',nullif(item->>'name',''),item->>'type',match_direction,units,factor,
          price,traded_on,item->>'currency',rate,case when depot_currency=item->>'currency' then 1 end,
          case when depot_currency=item->>'currency' then 'manually_updated' else 'missing' end,'missing',
          item->>'option',(item->>'strike')::numeric,(item->>'expiry')::date,case when source_kind='ibkr' then 'ibkr:'||(item->>'instrument') end,'custom_csv',import_key,now(),
          'execution:'||source_key::text||':'||(item->>'reference'),case when scale(trim_scale(units))=0 then 1 else 0.000001 end)
        returning id into position_key;
        opened_count:=opened_count+1;
        insert into app_private.depot_executions(source_id,reference,payload,position_id)
          values(source_key,item->>'reference',item,position_key);
      else
        insert into app_private.depot_executions(source_id,reference,payload,position_id)
          values(source_key,item->>'reference',item,null);
        remaining:=units;
        for lot in select p.id,p.quantity-p.sold_quantity as available from app_private.depot_executions e join public.positions p on p.id=e.position_id
          where e.source_id=source_key and e.payload->>'instrument'=item->>'instrument' and e.payload->>'currency'=item->>'currency'
            and e.payload->>'direction'=match_direction and p.multiplier=factor and p.quantity>p.sold_quantity
            and ((e.payload->>'date') || ' ' || coalesce(e.payload->>'time',''))<=chronological_key
          order by e.payload->>'date',e.payload->>'time',e.reference for update of p loop
          fill:=least(remaining,lot.available);
          sale_key:=public.record_position_sale(lot.id,fill,price,traded_on,rate,
            case when depot_currency=item->>'currency' then 'identity' else item->>'conversionSource' end,gen_random_uuid());
          update public.position_sales set source=source_kind where id=sale_key;
          insert into app_private.depot_execution_sales values(sale_key,source_key,item->>'reference');
          remaining:=remaining-fill;
          exit when remaining=0;
        end loop;
        if remaining>0 then
          raise exception 'Für % am % fehlt ein passender Einstieg. Bitte den früheren Kauf bzw. die Eröffnung mit importieren.',item->>'ticker',traded_on;
        end if;
        closed_count:=closed_count+1;
      end if;
    end loop;

    if import_key is not null then
      if opened_count+closed_count=0 then delete from public.portfolio_imports where id=import_key;
      else update public.portfolio_imports set import_status='completed',inserted_position_count=opened_count,
        metadata=jsonb_build_object('mode','executions','provider',source_kind,'sales',closed_count,'skipped',known_count) where id=import_key;
      end if;
    end if;
    if preview then raise exception 'preview rollback' using errcode='DA001'; end if;
  exception when sqlstate 'DA001' then
    if not preview then raise; end if;
  end;
  return jsonb_build_object('opened',opened_count,'closed',closed_count,'skipped',known_count);
end $$;

create function public.import_depot_executions(target_portfolio uuid, source_kind text, account_hash text, entries jsonb, allow_existing boolean, preview boolean)
returns jsonb language sql security definer set search_path='' as $$
  select app_private.apply_depot_executions(target_portfolio,source_kind,account_hash,entries,allow_existing,preview)
$$;

revoke all on function app_private.guard_imported_lot(), app_private.apply_depot_executions(uuid,text,text,jsonb,boolean,boolean) from public,anon,authenticated;
revoke all on function public.create_named_portfolio(text,text,text),public.import_depot_executions(uuid,text,text,jsonb,boolean,boolean) from public,anon,authenticated;
grant execute on function public.create_named_portfolio(text,text,text),public.import_depot_executions(uuid,text,text,jsonb,boolean,boolean) to authenticated;

create table app_private.ibkr_flex_connections (
  portfolio_id uuid primary key,
  user_id uuid not null,
  credentials text not null check(length(credentials) between 30 and 500 and credentials ~ '^[a-zA-Z0-9_-]+$'),
  worker_hash text not null check(worker_hash ~ '^[a-f0-9]{64}$'),
  account_hash text not null check(account_hash ~ '^[a-f0-9]{64}$'),
  account_label text not null check(account_label ~ '^[A-Z0-9-]{4}$'),
  expires_on date not null,
  last_success timestamptz not null default now(),
  next_run timestamptz not null default now()+interval '20 hours',
  last_error text check(last_error in ('credentials','report','unavailable','pending','ledger')),
  lease uuid unique,
  lease_until timestamptz,
  foreign key (portfolio_id,user_id) references public.portfolios(id,user_id) on delete cascade
);
create index ibkr_flex_connections_user_idx on app_private.ibkr_flex_connections(user_id);
create index ibkr_flex_connections_due_idx on app_private.ibkr_flex_connections(worker_hash,next_run);
create table app_private.ibkr_flex_validation (
  user_id uuid primary key references auth.users(id) on delete cascade,
  available_at timestamptz not null
);
alter table app_private.ibkr_flex_connections enable row level security;
alter table app_private.ibkr_flex_validation enable row level security;
revoke all on app_private.ibkr_flex_connections,app_private.ibkr_flex_validation from public,anon,authenticated;

create function public.ibkr_flex_status(target_portfolio uuid) returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object('account',account_label,'expires',expires_on,'lastSuccess',last_success,'lastError',last_error)
  from app_private.ibkr_flex_connections
  where portfolio_id=target_portfolio and user_id=auth.uid()
$$;
create function public.ibkr_flex_disconnect(target_portfolio uuid) returns void
language sql security definer set search_path='' as $$
  delete from app_private.ibkr_flex_connections where portfolio_id=target_portfolio and user_id=auth.uid()
$$;
create function public.ibkr_flex_allow_validation() returns boolean
language plpgsql security definer set search_path='' as $$
declare granted boolean;
begin
  if auth.uid() is null or not exists(select 1 from public.user_profiles where user_id=auth.uid() and account_status='active') then
    return false;
  end if;
  insert into app_private.ibkr_flex_validation as v values(auth.uid(),now()+interval '6 seconds')
    on conflict(user_id) do update set available_at=excluded.available_at where v.available_at<=now() returning true into granted;
  return coalesce(granted,false);
end $$;

create function app_private.apply_ibkr_flex_valuation(target_portfolio uuid, source_account text, valuation jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare report_day date; amount numeric;
begin
  if valuation is null or jsonb_typeof(valuation)<>'object' then return; end if;
  if valuation->'netAssetValue' is not null then
    report_day:=(valuation->'netAssetValue'->>'date')::date;
    amount:=(valuation->'netAssetValue'->>'total')::numeric;
    if report_day<=(now() at time zone 'Europe/Berlin')::date and amount>=0 and amount<1e15 then
      update public.portfolios set net_liquidity=amount, data_as_of=report_day::timestamp at time zone 'Europe/Berlin'
      where id=target_portfolio and user_id=auth.uid() and (data_as_of is null or data_as_of<=report_day::timestamp at time zone 'Europe/Berlin');
    end if;
  end if;
  if coalesce(jsonb_typeof(valuation->'marks'),'null')<>'array' or jsonb_array_length(valuation->'marks')>2000 then return; end if;
  insert into public.position_price_observations(user_id,portfolio_id,position_id,ticker,currency,price_native,source_type,source_name,observed_at,status,source_reference)
  select p.user_id,p.portfolio_id,p.id,p.ticker,p.instrument_currency,(mark->>'price')::numeric,'ibkr','IBKR Flex · Schlusskurs',
    (mark->>'date')::date::timestamp at time zone 'Europe/Berlin','end_of_day','ibkr_flex:'||(mark->>'conid')
  from app_private.depot_trade_sources src join app_private.depot_executions e on e.source_id=src.id
    join public.positions p on p.id=e.position_id
    join jsonb_array_elements(valuation->'marks') mark on mark->>'conid'=e.payload->>'instrument' and mark->>'currency'=p.instrument_currency
  where src.portfolio_id=target_portfolio and src.user_id=auth.uid() and src.kind='ibkr' and src.account_key=source_account
    and p.status<>'closed' and p.entry_date<=(mark->>'date')::date and (mark->>'date')::date<=(now() at time zone 'Europe/Berlin')::date
    and (mark->>'price')::numeric>=0 and (mark->>'price')::numeric<1e12
  on conflict(position_id,source_type,observed_at,price_native) do nothing;
end $$;
revoke all on function app_private.apply_ibkr_flex_valuation(uuid,text,jsonb) from public,anon,authenticated;

create function public.ibkr_flex_connect(target_portfolio uuid, source_account text, display_account text, sealed text,
  worker_key_hash text, expires date, entries jsonb, valuation jsonb, allow_existing boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare outcome jsonb; caller uuid:=auth.uid();
begin
  if expires is null or expires < current_date or expires > current_date+366 then raise exception 'Gültigkeitsdatum des Tokens prüfen.'; end if;
  outcome:=app_private.apply_depot_executions(target_portfolio,'ibkr',source_account,entries,allow_existing,false);
  perform app_private.apply_ibkr_flex_valuation(target_portfolio,source_account,valuation);
  insert into app_private.ibkr_flex_connections(portfolio_id,user_id,account_hash,account_label,credentials,worker_hash,expires_on)
  values(target_portfolio,caller,source_account,display_account,sealed,worker_key_hash,expires)
  on conflict(portfolio_id) do update set credentials=excluded.credentials,worker_hash=excluded.worker_hash,expires_on=excluded.expires_on,
    last_success=now(),next_run=now()+interval '20 hours',last_error=null,lease=null,lease_until=null;
  return outcome;
end $$;

create function public.ibkr_flex_claim(worker_key text, target_portfolio uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare leased app_private.ibkr_flex_connections; depot_currency text;
begin
  if length(coalesce(worker_key,'')) not between 16 and 200 then return null; end if;
  select c.* into leased from app_private.ibkr_flex_connections c
  join public.user_profiles p on p.user_id=c.user_id and p.account_status='active'
  where c.worker_hash=encode(sha256(convert_to(worker_key,'UTF8')),'hex')
    and c.expires_on>=current_date and coalesce(c.lease_until,'-infinity'::timestamptz)<=now()
    and ((target_portfolio is null and c.next_run<=now() and c.last_error is distinct from 'credentials')
      or (target_portfolio=c.portfolio_id and auth.uid()=c.user_id and c.next_run<=now()+interval '19 hours 59 minutes'))
  order by c.next_run limit 1 for update of c skip locked;
  if not found then return null; end if;
  update app_private.ibkr_flex_connections set lease=gen_random_uuid(),lease_until=now()+interval '60 seconds',
    next_run=now()+interval '20 hours' where portfolio_id=leased.portfolio_id returning * into leased;
  select currency into depot_currency from public.portfolios where id=leased.portfolio_id;
  return jsonb_build_object('portfolio',leased.portfolio_id,'lease',leased.lease,'credentials',leased.credentials,
    'account',leased.account_hash,'currency',depot_currency);
end $$;

create function public.ibkr_flex_finish(worker_key text, job_lease uuid, report_account text, entries jsonb, valuation jsonb, failure text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c app_private.ibkr_flex_connections; result jsonb; caller text:=coalesce(current_setting('request.jwt.claim.sub',true),'');
begin
  if length(coalesce(worker_key,'')) not between 16 and 200 then return null; end if;
  select * into c from app_private.ibkr_flex_connections where lease=job_lease and lease_until>now()
    and worker_hash=encode(sha256(convert_to(worker_key,'UTF8')),'hex');
  if not found then return null; end if;
  -- Maintain a consistent lock order with initial connection and renewal.
  perform 1 from public.portfolios where id=c.portfolio_id for update;
  select * into c from app_private.ibkr_flex_connections where portfolio_id=c.portfolio_id and lease=job_lease and lease_until>now()
    and worker_hash=encode(sha256(convert_to(worker_key,'UTF8')),'hex') for update;
  if not found then return null; end if;
  if failure is not null and failure not in ('credentials','report','unavailable','pending','ledger') then failure:='report'; end if;
  if failure is null and report_account is distinct from c.account_hash then failure:='report'; end if;
  if failure is null then
    perform set_config('request.jwt.claim.sub',c.user_id::text,true);
    begin
      result:=app_private.apply_depot_executions(c.portfolio_id,'ibkr',c.account_hash,entries,false,false);
      perform app_private.apply_ibkr_flex_valuation(c.portfolio_id,c.account_hash,valuation);
    exception when raise_exception or invalid_text_representation or numeric_value_out_of_range or check_violation or insufficient_privilege then
      failure:='ledger';
      result:=jsonb_build_object('message',sqlerrm);
    end;
    perform set_config('request.jwt.claim.sub',caller,true);
  end if;
  update app_private.ibkr_flex_connections set last_error=failure,lease=null,lease_until=null,
    last_success=case when failure is null then now() else last_success end
    where portfolio_id=c.portfolio_id;
  return coalesce(result,'{}'::jsonb)||jsonb_build_object('error',failure);
end $$;

revoke all on function public.ibkr_flex_status(uuid),public.ibkr_flex_disconnect(uuid),public.ibkr_flex_allow_validation(),
  public.ibkr_flex_connect(uuid,text,text,text,text,date,jsonb,jsonb,boolean),public.ibkr_flex_claim(text,uuid),
  public.ibkr_flex_finish(text,uuid,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.ibkr_flex_status(uuid),public.ibkr_flex_disconnect(uuid),public.ibkr_flex_allow_validation(),
  public.ibkr_flex_connect(uuid,text,text,text,text,date,jsonb,jsonb,boolean) to authenticated;
grant execute on function public.ibkr_flex_claim(text,uuid),public.ibkr_flex_finish(text,uuid,text,jsonb,jsonb,text) to anon,authenticated;

create function public.export_my_trade_sources() returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object(
    'executions', coalesce((select jsonb_agg(jsonb_build_object('portfolio_id',s.portfolio_id,'source',s.kind,
      'position_id',e.position_id,'execution',e.payload)) from app_private.depot_executions e
      join app_private.depot_trade_sources s on s.id=e.source_id where s.user_id=auth.uid()),'[]'::jsonb),
    'ibkr_flex_connections', coalesce((select jsonb_agg(jsonb_build_object('portfolio_id',c.portfolio_id,
      'account_suffix',c.account_label,'expires_on',c.expires_on,'last_success',c.last_success,'last_error',c.last_error))
      from app_private.ibkr_flex_connections c where c.user_id=auth.uid()),'[]'::jsonb))
$$;
revoke all on function public.export_my_trade_sources() from public,anon,authenticated;
grant execute on function public.export_my_trade_sources() to authenticated;
