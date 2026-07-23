-- Demo values need complete provenance even though the calculation engine
-- deliberately excludes them from real current valuations.

update public.positions
set current_price_source = coalesce(current_price_source, 'demo'),
    current_price_as_of = coalesce(current_price_as_of, data_as_of, updated_at, created_at),
    current_price_status = 'demo'
where source_type = 'demo'
  and current_price_native is not null;

update public.positions
set current_fx_source = coalesce(current_fx_source, 'demo'),
    current_fx_as_of = coalesce(current_fx_as_of, data_as_of, updated_at, created_at),
    current_fx_status = 'demo'
where source_type = 'demo'
  and current_fx_to_base is not null
  and current_fx_source <> 'identity';
