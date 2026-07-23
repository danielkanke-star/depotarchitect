"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePortfolio, getUserId } from "@/lib/portfolio";

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
    supabase.from("portfolios").update({ net_liquidity: nullableNum(formData, "net_liquidity"), currency: normalizedCurrency(formData), data_as_of: normalizedDateTime(formData, "data_as_of"), margin_used_pct: null, risk_budget_used_pct: null, risk_profile: String(formData.get("risk_profile") ?? "Aggressiv 1,0"), updated_at: new Date().toISOString() }).eq("id", portfolio.id),
    supabase.from("portfolio_settings").update({ risk_per_trade_pct: num(formData, "risk_per_trade_pct"), max_margin_pct: num(formData, "max_margin_pct"), max_position_pct: num(formData, "max_position_pct"), max_sector_pct: num(formData, "max_sector_pct"), max_drawdown_pct: num(formData, "max_drawdown_pct"), updated_at: new Date().toISOString() }).eq("portfolio_id", portfolio.id),
  ]);
  if (portfolioError) throw new Error("Die Portfolioeinstellungen konnten nicht gespeichert werden.");
  if (settingsError) throw new Error("Die Risikoeinstellungen konnten nicht gespeichert werden.");
  revalidatePath("/cockpit"); revalidatePath("/risiko"); revalidatePath("/einstellungen");
}

export async function saveCashBalance(formData: FormData) {
  const supabase = await createClient();
  const portfolio = await getOrCreatePortfolio();
  const userId = await getUserId();
  const currency = normalizedCurrency(formData, "cash_currency");
  const balanceNative = requiredNumber(formData, "balance_native", "Cashsaldo");
  const settledCashNative = nullableNum(formData, "settled_cash_native");
  const enteredFx = nullableNum(formData, "current_fx_to_base");
  const currentFxToBase = currency === portfolio.currency.toUpperCase() ? 1 : enteredFx;
  const balanceAsOf = normalizedDateTime(formData, "balance_as_of");
  const fxAsOf = normalizedDateTime(formData, "fx_as_of");

  if (currentFxToBase !== null && currentFxToBase <= 0) throw new Error("Der aktuelle Wechselkurs muss größer als null sein.");
  if (!balanceAsOf) throw new Error("Der Zeitpunkt des Cashbestands ist erforderlich.");

  const { data: existing, error: lookupError } = await supabase
    .from("portfolio_cash_balances")
    .select("id")
    .eq("portfolio_id", portfolio.id)
    .eq("source_type", "manual")
    .eq("currency", currency)
    .is("broker_account_id", null)
    .maybeSingle();
  if (lookupError) throw new Error("Der bestehende Cashbestand konnte nicht geprüft werden.");

  const payload = {
    user_id: userId,
    portfolio_id: portfolio.id,
    currency,
    balance_native: balanceNative,
    settled_cash_native: settledCashNative,
    current_fx_to_base: currentFxToBase,
    balance_as_of: balanceAsOf,
    fx_as_of: fxAsOf,
    source_type: "manual" as const,
    source_reference: null,
  };
  const result = existing
    ? await supabase.from("portfolio_cash_balances").update(payload).eq("id", existing.id).eq("portfolio_id", portfolio.id)
    : await supabase.from("portfolio_cash_balances").insert(payload);
  if (result.error) throw new Error("Der Cashbestand konnte nicht gespeichert werden.");

  revalidatePath("/cockpit");
  revalidatePath("/depot");
  revalidatePath("/einstellungen");
}

export async function deleteCashBalance(formData: FormData) {
  const supabase = await createClient();
  const portfolio = await getOrCreatePortfolio();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Der Cashbestand ist ungültig.");
  const { error } = await supabase.from("portfolio_cash_balances").delete().eq("id", id).eq("portfolio_id", portfolio.id);
  if (error) throw new Error("Der Cashbestand konnte nicht gelöscht werden.");
  revalidatePath("/cockpit");
  revalidatePath("/depot");
  revalidatePath("/einstellungen");
}

function normalizedDateTime(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Der Datenzeitpunkt ist ungültig.");
  return date.toISOString();
}

function normalizedCurrency(formData: FormData, key = "currency") {
  const currency = String(formData.get(key) ?? "EUR").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Die Basiswährung ist ungültig.");
  return currency;
}

function requiredNumber(formData: FormData, key: string, label: string) {
  const value = nullableNum(formData, key);
  if (value === null) throw new Error(`${label} ist erforderlich.`);
  return value;
}
