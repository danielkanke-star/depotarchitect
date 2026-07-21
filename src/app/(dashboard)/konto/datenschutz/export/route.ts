import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const { supabase, userId } = await requireUser();
  const [profile, portfolios, categories, positions, settings, legalAcceptances, importHistory] = await Promise.all([
    supabase.from("user_profiles").select("user_id, account_status, plan, created_at, updated_at, last_seen_at, onboarding_completed_at, scheduled_deletion_at").eq("user_id", userId).single(),
    supabase.from("portfolios").select("*").eq("user_id", userId),
    supabase.from("portfolio_categories").select("*").eq("user_id", userId),
    supabase.from("positions").select("*").eq("user_id", userId),
    supabase.from("portfolio_settings").select("*").eq("user_id", userId),
    supabase.from("legal_acceptances").select("document_type, document_version, accepted_at, withdrawn_at, created_at").eq("user_id", userId),
    supabase.from("portfolio_imports").select("id, portfolio_id, source_type, original_filename, imported_at, total_rows, valid_rows, warning_rows, rejected_rows, import_status, replaced_position_count, inserted_position_count, metadata, created_at").eq("user_id", userId),
  ]);
  const queries = [profile, portfolios, categories, positions, settings, legalAcceptances, importHistory];
  if (queries.some((query) => query.error)) {
    return Response.json({ error: "Der Export konnte nicht erstellt werden." }, { status: 500 });
  }

  const body = {
    export_version: "2a",
    exported_at: new Date().toISOString(),
    user_profile: profile.data,
    portfolios: portfolios.data ?? [],
    categories: categories.data ?? [],
    positions: positions.data ?? [],
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
