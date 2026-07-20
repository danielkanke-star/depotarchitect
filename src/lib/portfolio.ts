import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Portfolio, PortfolioCategory, PortfolioSettings, Position } from "@/lib/database.types";

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
}> {
  const supabase = await createClient();
  const portfolio = await getOrCreatePortfolio();

  const [{ data: settings, error: settingsError }, { data: categories, error: categoriesError }, { data: positions, error: positionsError }] = await Promise.all([
    supabase.from("portfolio_settings").select("*").eq("portfolio_id", portfolio.id).single(),
    supabase.from("portfolio_categories").select("*").eq("portfolio_id", portfolio.id).order("sort_order"),
    supabase.from("positions").select("*").eq("portfolio_id", portfolio.id).neq("status", "closed").order("market_value", { ascending: false }),
  ]);

  if (settingsError) throw new Error("Die Einstellungen konnten nicht geladen werden.");
  if (categoriesError) throw new Error("Die Kategorien konnten nicht geladen werden.");
  if (positionsError) throw new Error("Die Positionen konnten nicht geladen werden.");

  return { portfolio, settings, categories, positions };
}
