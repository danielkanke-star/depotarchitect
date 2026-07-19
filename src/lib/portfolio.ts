import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Portfolio, PortfolioCategory, PortfolioSettings, Position } from "@/lib/database.types";

const demoPositions = [
  ["NOW", "ServiceNow", "Kerninvestment", "long", 12000, 520, "Software", "high"],
  ["NVO", "Novo Nordisk", "Kerninvestment", "long", 8500, 390, "Gesundheit", "active"],
  ["ANET", "Arista Networks", "Momentumtrade", "long", 6500, 410, "Netzwerk", "active"],
  ["SHOP", "Shopify", "Momentumtrade", "long", 5800, 360, "Software", "watch"],
  ["MSFT", "Microsoft", "Kerninvestment", "long", 7200, 280, "Software", "active"],
  ["NVDA", "Nvidia", "Momentumtrade", "long", 6800, 470, "Halbleiter", "high"],
  ["QQQ PUT", "Nasdaq Hedge", "Hedge", "long_put", 1700, 170, "Index", "active"],
  ["ORCL", "Oracle", "Kerninvestment", "long", 6500, 270, "Software", "active"],
  ["GLW", "Corning", "taktische Beimischung", "long", 4200, 250, "Hardware", "active"],
  ["LRCX", "Lam Research", "Momentumtrade", "long", 5100, 340, "Halbleiter", "active"],
  ["CRDO", "Credo Technology", "Momentumtrade", "long", 3800, 320, "Halbleiter", "watch"],
  ["META", "Meta Platforms", "Kerninvestment", "long", 6800, 290, "Kommunikation", "active"],
  ["NET", "Cloudflare", "taktische Beimischung", "long", 3400, 260, "Software", "watch"],
  ["UNH", "UnitedHealth", "taktische Beimischung", "long", 4000, 230, "Gesundheit", "active"],
  ["AAPL", "Apple", "Kerninvestment", "long", 4000, 180, "Hardware", "active"],
  ["GOOG", "Alphabet", "Kerninvestment", "long", 5241, 260, "Kommunikation", "active"],
] as const;

export async function getUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/auth/login");
  return userId;
}

export async function getOrCreatePortfolio() {
  const supabase = await createClient();
  const userId = await getUserId();

  const { data: existing, error: selectError } = await supabase
    .from("portfolios")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (selectError) throw new Error(selectError.message);
  if (existing) return existing;

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .insert({
      user_id: userId,
      name: "Hauptdepot",
      currency: "EUR",
      net_liquidity: 35682.07,
      margin_used_pct: 45.7,
      risk_budget_used_pct: 143,
      risk_profile: "Aggressiv 1,0",
    })
    .select("*")
    .single();

  if (portfolioError) throw new Error(portfolioError.message);

  const categoryNames = ["Kerninvestment", "Momentumtrade", "taktische Beimischung", "Hedge"];
  const { data: categories, error: categoryError } = await supabase
    .from("portfolio_categories")
    .insert(categoryNames.map((name, index) => ({
      portfolio_id: portfolio.id,
      user_id: userId,
      name,
      sort_order: index,
    })))
    .select("*");

  if (categoryError) throw new Error(categoryError.message);

  const { error: settingsError } = await supabase.from("portfolio_settings").insert({
    portfolio_id: portfolio.id,
    user_id: userId,
    risk_model: "risk_per_trade",
    risk_per_trade_pct: 0.82,
    max_margin_pct: 50,
    max_position_pct: 15,
    max_sector_pct: 50,
    max_drawdown_pct: 8,
  });
  if (settingsError) throw new Error(settingsError.message);

  const categoryMap = new Map(categories.map((category) => [category.name, category.id]));
  const { error: positionsError } = await supabase.from("positions").insert(
    demoPositions.map(([ticker, name, category, direction, marketValue, riskAmount, sector, status]) => ({
      portfolio_id: portfolio.id,
      user_id: userId,
      category_id: categoryMap.get(category) ?? null,
      ticker,
      instrument_name: name,
      instrument_type: ticker.includes("PUT") ? "option" : "stock",
      direction,
      quantity: 1,
      entry_price: marketValue,
      current_price: marketValue,
      market_value: marketValue,
      risk_amount: riskAmount,
      sector,
      status,
      notes: "Beispieldatensatz für Meilenstein 1",
    })),
  );
  if (positionsError) throw new Error(positionsError.message);

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
