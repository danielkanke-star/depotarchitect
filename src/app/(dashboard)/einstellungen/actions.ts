"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { getOrCreatePortfolio, getUserId } from "@/lib/portfolio";
import { normalizeTradingProfile, parseBerlinDateTime } from "@/lib/risk-rules";
import { unstable_rethrow } from "next/navigation";

const nullableNum = (formData: FormData, key: string) => {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value)) throw new Error("Bitte eine gültige Zahl ohne Tausendertrennzeichen eingeben.");
  return value;
};
type Feedback = { message: string; ok: boolean };

function refreshDepotViews() {
  for (const path of ["/cockpit", "/depot", "/risiko", "/einstellungen", "/import", "/performance"]) revalidatePath(path);
}

async function activeDepotFor(form: FormData) {
  const [identity, portfolio] = await Promise.all([requireUser(), getOrCreatePortfolio()]);
  if (form.get("portfolio_id") !== portfolio.id) throw new Error("Das aktive Depot wurde gewechselt. Bitte die Ansicht neu öffnen.");
  return { supabase: identity.supabase, portfolio };
}

export async function saveSettingsWithFeedback(_previous: Feedback, form: FormData): Promise<Feedback> {
  try {
    const { supabase, portfolio } = await activeDepotFor(form);
    const accountType = normalizedAccountType(form);
    const profile = normalizeTradingProfile(String(form.get("risk_profile") ?? ""));
    if (!profile) throw new Error("Bitte ein Trading-Profil wählen.");
    const { error } = await supabase.rpc("save_depot_preferences", {
      target_portfolio: portfolio.id, base_currency: normalizedCurrency(form), depot_type: accountType, trading_profile: profile,
      trade_pct: requiredNumber(form, "risk_per_trade_pct", "Risiko je Trade"),
      budget_pct: nullableNum(form, "risk_budget_pct"),
      margin_pct: nullableNum(form, "max_margin_pct"),
      concentration_basis_pct: requiredNumber(form, "max_position_pct", "Basisgrenze Wertpapier"),
    });
    if (error) throw new Error(error.code === "P0001" ? error.message : "Einstellungen konnten nicht gespeichert werden.");
    revalidatePath("/", "layout");
    refreshDepotViews();
    return { ok: true, message: "Einstellungen gespeichert." };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, message: error instanceof Error ? error.message : "Speichern fehlgeschlagen." };
  }
}

export async function saveDepotValue(_previous: Feedback, form: FormData): Promise<Feedback> {
  try {
    const { supabase, portfolio } = await activeDepotFor(form);
    const amount = requiredNumber(form, "net_liquidity", "Nettoliquidität");
    const observedAt = normalizedDateTime(form, "data_as_of");
    if (!observedAt) throw new Error("Bitte den Zeitpunkt aus dem Brokerbericht eintragen.");
    const { data, error } = await supabase.rpc("record_depot_value", { target_portfolio: portfolio.id, amount, observed_at: observedAt });
    if (error) throw new Error(error.code === "P0001" ? error.message : "Depotwert konnte nicht gespeichert werden.");
    if (!data) return { ok: false, message: "Ein gleich aktueller Brokerwert oder ein neuerer Depotwert ist bereits gespeichert." };
    refreshDepotViews();
    return { ok: true, message: "Depotwert gespeichert." };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, message: error instanceof Error ? error.message : "Speichern fehlgeschlagen." };
  }
}

export async function manageCategory(_previous: Feedback, form: FormData): Promise<Feedback> {
  try {
    const { supabase, portfolio } = await activeDepotFor(form);
    const { data, error } = await supabase.rpc("manage_depot_category", {
      target_portfolio: portfolio.id, operation: String(form.get("operation") ?? ""),
      category_id: String(form.get("category_id") ?? "") || null,
      category_name: String(form.get("name") ?? "").trim() || null,
      goal_min: nullableNum(form, "target_min"), goal_max: nullableNum(form, "target_max"),
    });
    if (error?.code === "23505") throw new Error("Dieser Kategoriename ist bereits vergeben.");
    if (error) throw new Error(error.code === "P0001" ? error.message : "Kategorie konnte nicht geändert werden.");
    const messages: Record<string, string> = {
      created: "Kategorie hinzugefügt.", updated: "Kategorie gespeichert.", deleted: "Kategorie gelöscht.",
      archived: "Kategorie archiviert. Bestehende Zuordnungen bleiben erhalten.", restored: "Kategorie wieder aktiviert.",
    };
    refreshDepotViews();
    return { ok: true, message: messages[data ?? ""] ?? "Kategorie gespeichert." };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, message: error instanceof Error ? error.message : "Speichern fehlgeschlagen." };
  }
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
  const date = parseBerlinDateTime(value);
  if (!date) throw new Error("Der Datenzeitpunkt in Europe/Berlin ist ungültig.");
  return date;
}

function normalizedCurrency(formData: FormData, key = "currency") {
  const currency = String(formData.get(key) ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Die Basiswährung ist ungültig.");
  return currency;
}

function normalizedAccountType(formData: FormData) {
  const value = String(formData.get("account_type") ?? "").trim();
  if (!["cash_account", "margin_account", "portfolio_margin_account", "other"].includes(value)) {
    throw new Error("Das Kontomodell ist ungültig.");
  }
  return value as "cash_account" | "margin_account" | "portfolio_margin_account" | "other";
}

function requiredNumber(formData: FormData, key: string, label: string) {
  const value = nullableNum(formData, key);
  if (value === null) throw new Error(`${label} ist erforderlich.`);
  return value;
}
