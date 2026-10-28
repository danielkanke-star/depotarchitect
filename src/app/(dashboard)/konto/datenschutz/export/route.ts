import { requireUser } from "@/lib/auth";
import { allRows } from "@/lib/paged-query";

export const dynamic = "force-dynamic";

export async function GET() {
  const { supabase, userId } = await requireUser();
  const [profile, portfolios, categories, positions, priceObservations, marketDataMappings, cashBalances, capitalMovements, settings, legalAcceptances, importHistory, sales, saleRevisions, fxRates] = await Promise.all([
    supabase.from("user_profiles").select("user_id, account_status, plan, created_at, updated_at, last_seen_at, onboarding_completed_at, scheduled_deletion_at").eq("user_id", userId).single(),
    supabase.from("portfolios").select("*").eq("user_id", userId),
    supabase.from("portfolio_categories").select("*").eq("user_id", userId),
    allRows((from,to)=>supabase.from("positions").select("*").eq("user_id", userId).order("id").range(from,to)),
    allRows((from,to)=>supabase.from("position_price_observations").select("*").eq("user_id", userId).order("id").range(from,to)),
    supabase.from("position_market_data_mappings").select("*").eq("user_id", userId),
    supabase.from("portfolio_cash_balances").select("*").eq("user_id", userId),
    allRows((from,to)=>supabase.from("portfolio_capital_movements").select("*").eq("user_id", userId).order("id").range(from,to)),
    supabase.from("portfolio_settings").select("*").eq("user_id", userId),
    supabase.from("legal_acceptances").select("document_type, document_version, accepted_at, withdrawn_at, created_at").eq("user_id", userId),
    supabase.from("portfolio_imports").select("id, portfolio_id, source_type, original_filename, imported_at, total_rows, valid_rows, warning_rows, rejected_rows, import_status, replaced_position_count, inserted_position_count, metadata, created_at").eq("user_id", userId),
    allRows((from,to)=>supabase.from("position_sales").select("*").eq("user_id", userId).order("id").range(from,to)),
    allRows((from,to)=>supabase.from("position_sale_revisions").select("*").eq("user_id", userId).order("id").range(from,to)),
    supabase.from("portfolio_fx_rates").select("*").eq("user_id", userId),
  ]);
  const queries = [profile, portfolios, categories, positions, cashBalances, capitalMovements, settings, legalAcceptances, importHistory, fxRates];
  const priceTableUnavailable = isMissingTable(priceObservations.error);
  const mappingTableUnavailable = isMissingTable(marketDataMappings.error);
  if (
    queries.some((query) => query.error)
    || (sales.error && !isMissingTable(sales.error))
    || (saleRevisions.error && !isMissingTable(saleRevisions.error))
    || (priceObservations.error && !priceTableUnavailable)
    || (marketDataMappings.error && !mappingTableUnavailable)
  ) {
    return Response.json({ error: "Der Export konnte nicht erstellt werden." }, { status: 500 });
  }

  const body = {
    export_version: "first-usable.1",
    exported_at: new Date().toISOString(),
    user_profile: profile.data,
    portfolios: portfolios.data ?? [],
    categories: categories.data ?? [],
    positions: positions.data ?? [],
    position_sales: sales.data ?? [],
    position_sale_revisions: saleRevisions.data ?? [],
    portfolio_fx_rates: fxRates.data ?? [],
    position_price_observations: priceObservations.data ?? [],
    position_market_data_mappings: marketDataMappings.data ?? [],
    cash_balances: cashBalances.data ?? [],
    capital_movements: capitalMovements.data ?? [],
    settings: settings.data ?? [],
    legal_acceptances: legalAcceptances.data ?? [],
    import_history: importHistory.data ?? [],
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": "attachment; filename=depotarchitect-datenexport.json",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isMissingTable(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}
