"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { calculatePosition } from "@/lib/calculations/position-calculations";
import type { Direction, InstrumentType, MarketDataStatus } from "@/lib/calculations/calculation-types";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePortfolio, getUserId } from "@/lib/portfolio";
import { resolveWritableInstrumentType } from "@/lib/portfolio-write-policy";

const DIRECTIONS = new Set<Direction>(["long", "short", "long_put", "long_call", "short_put", "short_call"]);
const INSTRUMENT_TYPES = new Set<InstrumentType>(["stock", "etf", "option", "warrant", "knock_out", "cash", "other"]);
const STATUSES = new Set(["active", "watch", "high", "danger"]);
const MARKET_DATA_STATUSES = new Set<MarketDataStatus>([
  "live", "delayed", "end_of_day", "manually_updated", "stale", "missing", "demo",
]);
const REAL_MARKET_DATA_STATUSES = new Set<MarketDataStatus>([
  "live", "delayed", "end_of_day", "manually_updated", "stale",
]);

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const nullableNumber = (formData: FormData, key: string) => {
  const raw = text(formData, key);
  if (!raw) return null;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : null;
};

export async function savePosition(formData: FormData) {
  const supabase = await createClient();
  const userId = await getUserId();
  const portfolio = await getOrCreatePortfolio();
  const id = text(formData, "id");
  const ticker = text(formData, "ticker").toUpperCase();
  const direction = text(formData, "direction") as Direction;
  const instrumentType = (text(formData, "instrument_type") || "stock") as InstrumentType;
  const status = text(formData, "status") || "active";
  const quantity = nullableNumber(formData, "quantity");
  const multiplier = nullableNumber(formData, "multiplier");
  const entryPrice = nullableNumber(formData, "entry_price");
  const currentPrice = nullableNumber(formData, "current_price_native");
  const stopPrice = nullableNumber(formData, "stop_price_native");
  const marginRatePercent = nullableNumber(formData, "margin_rate_percent");
  const marginRate = marginRatePercent === null ? null : marginRatePercent / 100;
  const directMarginRequirement = nullableNumber(formData, "margin_requirement");
  const strikePrice = nullableNumber(formData, "strike_price");
  const optionType = text(formData, "option_type") || null;
  const expirationDate = text(formData, "expiration_date") || null;
  const instrumentCurrency = (text(formData, "instrument_currency") || portfolio.currency).toUpperCase();
  const entryFxToBase = nullableNumber(formData, "entry_fx_to_base");
  const enteredCurrentFx = nullableNumber(formData, "current_fx_to_base");
  const currentFxToBase = enteredCurrentFx ?? (instrumentCurrency === portfolio.currency.toUpperCase() ? 1 : null);
  const currentPriceAsOf = normalizedDateTime(formData, "current_price_as_of");
  const currentFxAsOf = normalizedDateTime(formData, "current_fx_as_of");
  const currentPriceStatus = nullableMarketDataStatus(formData, "current_price_status", currentPrice);
  const currentFxStatus = nullableMarketDataStatus(formData, "current_fx_status", currentFxToBase);
  const categoryId = text(formData, "category_id") || null;
  const currentPriceSource = text(formData, "current_price_source");
  const currentFxSource = text(formData, "current_fx_source");
  const stopUpdatedAt = normalizedDateTime(formData, "stop_updated_at");
  const marginAsOf = normalizedDateTime(formData, "margin_as_of");
  const marginSource = text(formData, "margin_source") || (directMarginRequirement !== null ? "manual_direct" : marginRate !== null ? "estimated" : "missing");

  if (!ticker || ticker.length > 40 || !DIRECTIONS.has(direction) || !INSTRUMENT_TYPES.has(instrumentType) || !STATUSES.has(status)) {
    throw new Error("Die Positionsangaben sind ungültig.");
  }
  if (quantity === null || quantity <= 0 || multiplier === null || multiplier <= 0 || entryPrice === null || entryPrice < 0) {
    throw new Error("Menge, Multiplikator und Einstandskurs sind ungültig.");
  }
  if ((currentPrice !== null && currentPrice < 0) || (stopPrice !== null && stopPrice < 0) || (marginRate !== null && (marginRate < 0 || marginRate > 1)) || (directMarginRequirement !== null && directMarginRequirement < 0)) {
    throw new Error("Preis-, Stopp- oder Marginangaben dürfen nicht negativ sein.");
  }
  if (!/^[A-Z]{3}$/.test(instrumentCurrency) || (entryFxToBase !== null && entryFxToBase <= 0) || (currentFxToBase !== null && currentFxToBase <= 0)) {
    throw new Error("Währung oder Wechselkurs ist ungültig.");
  }
  assertCompleteMarketData("Kurs", currentPrice, currentPriceSource, currentPriceAsOf, currentPriceStatus);
  if (instrumentCurrency !== portfolio.currency.toUpperCase()) {
    assertCompleteMarketData("FX", currentFxToBase, currentFxSource, currentFxAsOf, currentFxStatus);
  }
  if (stopPrice !== null && !stopUpdatedAt) {
    throw new Error("Für einen Trading-Stopp ist der Aktualisierungszeitpunkt erforderlich.");
  }
  if (directMarginRequirement !== null && !["broker", "manual_direct"].includes(marginSource)) {
    throw new Error("Ein direktes Margin Requirement benötigt die Quelle Broker oder Manuell.");
  }
  if (directMarginRequirement !== null && !marginAsOf) {
    throw new Error("Für ein direktes Margin Requirement ist der Datenzeitpunkt erforderlich.");
  }
  if (instrumentType === "option" && (!optionType || !new Set(["call", "put"]).has(optionType) || strikePrice === null || strikePrice < 0 || !expirationDate)) {
    throw new Error("Für Optionen sind Optionsart, Ausübungspreis und Verfallsdatum erforderlich.");
  }
  if (categoryId) {
    const { data: category } = await supabase.from("portfolio_categories").select("id").eq("id", categoryId).eq("portfolio_id", portfolio.id).maybeSingle();
    if (!category) throw new Error("Die Kategorie gehört nicht zu diesem Depot.");
  }

  let existingInstrumentType: InstrumentType | null = null;
  if (id) {
    const { data: existingPosition, error: existingPositionError } = await supabase
      .from("positions")
      .select("instrument_type")
      .eq("id", id)
      .eq("portfolio_id", portfolio.id)
      .maybeSingle();
    if (existingPositionError || !existingPosition) throw new Error("Die Position konnte nicht geprüft werden.");
    existingInstrumentType = existingPosition.instrument_type as InstrumentType;
  }
  const writableInstrumentType = resolveWritableInstrumentType(instrumentType, existingInstrumentType);

  const calculation = calculatePosition({
    id: id || "new",
    ticker,
    instrumentType: writableInstrumentType,
    direction,
    quantity,
    multiplier,
    entryPrice,
    currentPrice,
    currentPriceStatus,
    entryFxToBase,
    currentFxToBase,
    currentFxStatus,
    netLiquidity: portfolio.net_liquidity,
    effectiveStopPrice: stopPrice,
    directMarginRequirement,
    directMarginProvenance: directMarginRequirement === null
      ? undefined
      : marginSource as "broker" | "manual_direct",
    marginRate,
  });
  const payload = {
    portfolio_id: portfolio.id,
    user_id: userId,
    category_id: categoryId,
    ticker,
    instrument_name: text(formData, "instrument_name") || null,
    instrument_type: writableInstrumentType,
    direction,
    quantity,
    multiplier,
    entry_price: entryPrice,
    current_price: currentPrice,
    current_price_native: currentPrice,
    instrument_currency: instrumentCurrency,
    entry_fx_to_base: entryFxToBase,
    current_fx_to_base: currentFxToBase,
    current_fx_as_of: currentFxAsOf,
    current_fx_source: currentFxToBase === null ? null : instrumentCurrency === portfolio.currency.toUpperCase() ? "identity" : currentFxSource,
    current_fx_status: currentFxStatus,
    current_price_as_of: currentPriceAsOf,
    current_price_source: currentPrice === null ? null : currentPriceSource,
    current_price_status: currentPriceStatus,
    stop_price: stopPrice,
    stop_price_native: stopPrice,
    stop_updated_at: stopPrice === null ? null : stopUpdatedAt,
    stop_comment: stopPrice === null ? null : text(formData, "stop_comment") || null,
    market_value: calculation.positionValueBase.value,
    risk_amount: calculation.stopRisk.value,
    margin_requirement: directMarginRequirement,
    margin_rate: marginRate,
    margin_source: directMarginRequirement !== null ? marginSource as "broker" | "manual_direct" : marginRate !== null ? "estimated" as const : "missing" as const,
    margin_currency: directMarginRequirement === null ? null : portfolio.currency.toUpperCase(),
    margin_as_of: directMarginRequirement === null && marginRate === null ? null : marginAsOf ?? currentPriceAsOf,
    margin_calculation_type: directMarginRequirement !== null ? "direct_requirement" as const : marginRate !== null ? "rate_estimate" as const : null,
    margin_confidence: directMarginRequirement !== null ? "trusted" as const : marginRate !== null ? "estimated" as const : "missing" as const,
    option_type: writableInstrumentType === "option" ? optionType : null,
    strike_price: writableInstrumentType === "option" ? strikePrice : null,
    expiration_date: writableInstrumentType === "option" ? expirationDate : null,
    sector: text(formData, "sector") || null,
    strategy: text(formData, "strategy") || null,
    notes: text(formData, "notes") || null,
    entry_date: text(formData, "entry_date") || null,
    status,
    updated_at: new Date().toISOString(),
  };

  const result = id
    ? await supabase.from("positions").update(payload).eq("id", id).eq("portfolio_id", portfolio.id)
    : await supabase.from("positions").insert(payload);
  if (result.error) throw new Error("Die Position konnte nicht gespeichert werden.");
  revalidatePath("/depot");
  revalidatePath("/cockpit");
  redirect("/depot");
}

function nullableMarketDataStatus(formData: FormData, key: string, sourceValue: number | null) {
  if (sourceValue === null) return "missing" as const;
  const value = (text(formData, key) || "manually_updated") as MarketDataStatus;
  if (!MARKET_DATA_STATUSES.has(value)) throw new Error("Der Marktdatenstatus ist ungültig.");
  return value;
}

function assertCompleteMarketData(
  label: string,
  value: number | null,
  source: string,
  asOf: string | null,
  status: MarketDataStatus,
) {
  if (value === null) return;
  if (!source || !asOf || (!REAL_MARKET_DATA_STATUSES.has(status) && status !== "demo")) {
    throw new Error(`${label} benötigt Quelle, Zeitpunkt und einen realen Datenstatus.`);
  }
}

function normalizedDateTime(formData: FormData, key: string) {
  const raw = text(formData, key);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error("Der Datenzeitpunkt ist ungültig.");
  return date.toISOString();
}

export async function deletePosition(formData: FormData) {
  const supabase = await createClient();
  const portfolio = await getOrCreatePortfolio();
  const id = text(formData, "id");
  const { error } = await supabase.from("positions").delete().eq("id", id).eq("portfolio_id", portfolio.id);
  if (error) throw new Error("Die Position konnte nicht gelöscht werden.");
  revalidatePath("/depot");
  revalidatePath("/cockpit");
}

export async function saveFxRate(formData: FormData) {
  const supabase = await createClient();
  const userId = await getUserId();
  const portfolio = await getOrCreatePortfolio();
  const sourceCurrency = text(formData, "source_currency").toUpperCase();
  const targetCurrency = portfolio.currency.toUpperCase();
  const rate = nullableNumber(formData, "rate");
  const sourceType = text(formData, "source_type") || "manual";
  const sourceName = text(formData, "source_name");
  const rateAsOf = normalizedDateTime(formData, "rate_as_of");
  const status = (text(formData, "status") || "manually_updated") as MarketDataStatus;

  if (!/^[A-Z]{3}$/.test(sourceCurrency) || sourceCurrency === targetCurrency || rate === null || rate <= 0) {
    throw new Error("Das FX-Paar oder der Wechselkurs ist ungültig.");
  }
  if (!["manual", "broker", "market_data_provider"].includes(sourceType) || !sourceName || !rateAsOf || !REAL_MARKET_DATA_STATUSES.has(status)) {
    throw new Error("Der reale Wechselkurs benötigt Quelle, Zeitpunkt und Datenstatus.");
  }

  const { error } = await supabase.from("portfolio_fx_rates").insert({
    user_id: userId,
    portfolio_id: portfolio.id,
    source_currency: sourceCurrency,
    target_currency: targetCurrency,
    rate,
    source_type: sourceType as "manual" | "broker" | "market_data_provider",
    source_name: sourceName,
    rate_as_of: rateAsOf,
    status,
  });
  if (error) throw new Error("Der Wechselkurs konnte nicht gespeichert werden.");
  revalidatePath("/depot");
  revalidatePath("/cockpit");
}

export async function deleteFxRate(formData: FormData) {
  const supabase = await createClient();
  const portfolio = await getOrCreatePortfolio();
  const id = text(formData, "id");
  const { error } = await supabase.from("portfolio_fx_rates").delete().eq("id", id).eq("portfolio_id", portfolio.id);
  if (error) throw new Error("Der Wechselkurs konnte nicht gelöscht werden.");
  revalidatePath("/depot");
  revalidatePath("/cockpit");
}

export async function saveCashBalance(formData: FormData) {
  const supabase = await createClient();
  const userId = await getUserId();
  const portfolio = await getOrCreatePortfolio();
  const currency = text(formData, "currency").toUpperCase();
  const balanceNative = nullableNumber(formData, "balance_native");
  const balanceAsOf = normalizedDateTime(formData, "balance_as_of");
  const enteredFx = nullableNumber(formData, "current_fx_to_base");
  const currentFx = currency === portfolio.currency.toUpperCase() ? 1 : enteredFx;
  const fxAsOf = currency === portfolio.currency.toUpperCase() ? null : normalizedDateTime(formData, "fx_as_of");
  const fxSource = currency === portfolio.currency.toUpperCase() ? "identity" : text(formData, "fx_source");
  const fxStatus = currency === portfolio.currency.toUpperCase()
    ? "manually_updated" as const
    : nullableMarketDataStatus(formData, "fx_status", currentFx);

  if (!/^[A-Z]{3}$/.test(currency) || balanceNative === null || !balanceAsOf) {
    throw new Error("Cashwährung, Saldo und Datenzeitpunkt sind erforderlich.");
  }
  if (currency !== portfolio.currency.toUpperCase()) {
    assertCompleteMarketData("Cash-FX", currentFx, fxSource, fxAsOf, fxStatus);
  }

  const payload = {
    user_id: userId,
    portfolio_id: portfolio.id,
    currency,
    balance_native: balanceNative,
    balance_as_of: balanceAsOf,
    current_fx_to_base: currentFx,
    fx_as_of: fxAsOf,
    fx_source: fxSource,
    fx_status: fxStatus,
    source_type: "manual",
    source_reference: fxSource,
  } as const;
  const { data: existing } = await supabase
    .from("portfolio_cash_balances")
    .select("id")
    .eq("portfolio_id", portfolio.id)
    .eq("source_type", "manual")
    .eq("currency", currency)
    .is("broker_account_id", null)
    .maybeSingle();
  const { error } = existing
    ? await supabase.from("portfolio_cash_balances").update(payload).eq("id", existing.id).eq("portfolio_id", portfolio.id)
    : await supabase.from("portfolio_cash_balances").insert(payload);
  if (error) throw new Error("Der Cashbestand konnte nicht gespeichert werden.");
  revalidatePath("/depot");
  revalidatePath("/cockpit");
}
