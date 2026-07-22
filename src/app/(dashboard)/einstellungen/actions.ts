"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePortfolio } from "@/lib/portfolio";

const num = (formData: FormData, key: string) => Number(String(formData.get(key) ?? "0").replace(",", ".")) || 0;
const nullableNum = (formData: FormData, key: string) => {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : null;
};
export async function saveSettings(formData: FormData) {
  const supabase = await createClient();
  const portfolio = await getOrCreatePortfolio();
  const [{ error: portfolioError }, { error: settingsError }] = await Promise.all([
    supabase.from("portfolios").update({ net_liquidity: nullableNum(formData, "net_liquidity"), cash_balance: nullableNum(formData, "cash_balance"), currency: normalizedCurrency(formData), data_as_of: normalizedDateTime(formData, "data_as_of"), margin_used_pct: null, risk_budget_used_pct: null, risk_profile: String(formData.get("risk_profile") ?? "Aggressiv 1,0"), updated_at: new Date().toISOString() }).eq("id", portfolio.id),
    supabase.from("portfolio_settings").update({ risk_per_trade_pct: num(formData, "risk_per_trade_pct"), max_margin_pct: num(formData, "max_margin_pct"), max_position_pct: num(formData, "max_position_pct"), max_sector_pct: num(formData, "max_sector_pct"), max_drawdown_pct: num(formData, "max_drawdown_pct"), updated_at: new Date().toISOString() }).eq("portfolio_id", portfolio.id),
  ]);
  if (portfolioError) throw new Error("Die Portfolioeinstellungen konnten nicht gespeichert werden.");
  if (settingsError) throw new Error("Die Risikoeinstellungen konnten nicht gespeichert werden.");
  revalidatePath("/cockpit"); revalidatePath("/risiko"); revalidatePath("/einstellungen");
}

function normalizedDateTime(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Der Datenzeitpunkt ist ungültig.");
  return date.toISOString();
}

function normalizedCurrency(formData: FormData) {
  const currency = String(formData.get("currency") ?? "EUR").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Die Basiswährung ist ungültig.");
  return currency;
}
