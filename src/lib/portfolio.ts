import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Portfolio, PortfolioCashBalance, PortfolioCategory, PortfolioFxRate, PortfolioImport, PortfolioSettings, Position } from "@/lib/database.types";

export async function getUserId() {
  const { userId } = await requireUser();
  return userId;
}

export async function getOrCreatePortfolio() {
  const supabase = await createClient();
  await getUserId();

  const { data: portfolioId, error: initializationError } = await supabase.rpc("initialize_default_portfolio");
  if (initializationError) throw new Error("Das Portfolio konnte nicht initialisiert werden.");

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .select("*")
    .eq("id", portfolioId)
    .single();

  if (portfolioError) throw new Error("Das Portfolio konnte nicht geladen werden.");

  return portfolio;
}

export async function getPortfolioData(): Promise<{
  portfolio: Portfolio;
  settings: PortfolioSettings;
  categories: PortfolioCategory[];
  positions: Position[];
  cashBalances: PortfolioCashBalance[];
  fxRates: PortfolioFxRate[];
  latestImport: PortfolioImport | null;
}> {
  const supabase = await createClient();
  const portfolio = await getOrCreatePortfolio();

  const [{ data: settings, error: settingsError }, { data: categories, error: categoriesError }, { data: positions, error: positionsError }, { data: cashBalances, error: cashError }, { data: fxRates, error: fxError }, { data: latestImport, error: importError }] = await Promise.all([
    supabase.from("portfolio_settings").select("*").eq("portfolio_id", portfolio.id).single(),
    supabase.from("portfolio_categories").select("*").eq("portfolio_id", portfolio.id).order("sort_order"),
    supabase.from("positions").select("*").eq("portfolio_id", portfolio.id).neq("status", "closed").order("created_at", { ascending: true }),
    supabase.from("portfolio_cash_balances").select("*").eq("portfolio_id", portfolio.id).order("currency"),
    supabase.from("portfolio_fx_rates").select("*").eq("portfolio_id", portfolio.id).order("rate_as_of", { ascending: false }),
    supabase.from("portfolio_imports").select("*").eq("portfolio_id", portfolio.id).eq("import_status", "completed").order("imported_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (settingsError) throw new Error("Die Einstellungen konnten nicht geladen werden.");
  if (categoriesError) throw new Error("Die Kategorien konnten nicht geladen werden.");
  if (positionsError) throw new Error("Die Positionen konnten nicht geladen werden.");
  if (cashError) throw new Error("Die Cashbestände konnten nicht geladen werden.");
  if (fxError) throw new Error("Die Wechselkurse konnten nicht geladen werden.");
  if (importError) throw new Error("Die Importquelle konnte nicht geladen werden.");

  return { portfolio, settings, categories, positions, cashBalances, fxRates, latestImport };
}
import "server-only";
