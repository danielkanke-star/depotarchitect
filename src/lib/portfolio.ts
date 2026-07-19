import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Portfolio, PortfolioCategory, PortfolioSettings, Position } from "@/lib/database.types";

export async function getUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return userId;
}

export async function getOrCreatePortfolio() {
  const supabase = await createClient();
  await getUserId();

  const { data: portfolioId, error: initializationError } = await supabase.rpc("initialize_default_portfolio");
  if (initializationError) throw new Error(initializationError.message);

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .select("*")
    .eq("id", portfolioId)
    .single();

  if (portfolioError) throw new Error(portfolioError.message);

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

  if (settingsError) throw new Error(settingsError.message);
  if (categoriesError) throw new Error(categoriesError.message);
  if (positionsError) throw new Error(positionsError.message);

  return { portfolio, settings, categories, positions };
}
