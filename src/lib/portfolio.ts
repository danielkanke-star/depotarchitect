import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Portfolio, PortfolioCapitalMovement, PortfolioCashBalance, PortfolioCategory, PortfolioFxRate, PortfolioImport, PortfolioSettings, Position, PositionPriceObservation } from "@/lib/database.types";

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
  priceObservations: PositionPriceObservation[];
  latestImport: PortfolioImport | null;
  capitalMovements: PortfolioCapitalMovement[];
}> {
  const supabase = await createClient();
  const portfolio = await getOrCreatePortfolio();

  const [{ data: settings, error: settingsError }, { data: categories, error: categoriesError }, { data: positions, error: positionsError }, { data: cashBalances, error: cashError }, { data: fxRates, error: fxError }, { data: priceObservations, error: priceObservationsError }, { data: latestImport, error: importError }, { data: capitalMovements, error: capitalMovementError }] = await Promise.all([
    supabase.from("portfolio_settings").select("*").eq("portfolio_id", portfolio.id).single(),
    supabase.from("portfolio_categories").select("*").eq("portfolio_id", portfolio.id).order("sort_order"),
    supabase.from("positions").select("*").eq("portfolio_id", portfolio.id).order("created_at", { ascending: true }),
    supabase.from("portfolio_cash_balances").select("*").eq("portfolio_id", portfolio.id).order("currency"),
    supabase.from("portfolio_fx_rates").select("*").eq("portfolio_id", portfolio.id).order("rate_as_of", { ascending: false }),
    supabase.from("position_price_observations").select("*").eq("portfolio_id", portfolio.id).order("observed_at", { ascending: false }),
    supabase.from("portfolio_imports").select("*").eq("portfolio_id", portfolio.id).eq("import_status", "completed").order("imported_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("portfolio_capital_movements").select("*").eq("portfolio_id", portfolio.id).order("movement_date", { ascending: false }),
  ]);

  if (settingsError) throw new Error("Die Einstellungen konnten nicht geladen werden.");
  if (categoriesError) throw new Error("Die Kategorien konnten nicht geladen werden.");
  if (positionsError) throw new Error("Die Positionen konnten nicht geladen werden.");
  if (cashError) throw new Error("Die Cashbestände konnten nicht geladen werden.");
  if (fxError) throw new Error("Die Wechselkurse konnten nicht geladen werden.");
  // Preview and Production currently share one database. Keep the branch
  // deployable before its additive migration is deliberately released.
  if (
    priceObservationsError
    && priceObservationsError.code !== "42P01"
    && priceObservationsError.code !== "PGRST205"
  ) throw new Error("Die Kursquellen konnten nicht geladen werden.");
  if (importError) throw new Error("Die Importquelle konnte nicht geladen werden.");
  if (capitalMovementError) throw new Error("Die Ein- und Auszahlungen konnten nicht geladen werden.");

  return { portfolio, settings, categories, positions, cashBalances, fxRates, priceObservations: priceObservations ?? [], latestImport, capitalMovements };
}
import "server-only";
