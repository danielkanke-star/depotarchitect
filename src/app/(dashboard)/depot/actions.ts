"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Direction, InstrumentType } from "@/lib/calculations/calculation-types";
import { getOrCreatePortfolio, getUserId } from "@/lib/portfolio";
import { normalizeMarginInput, normalizePositionSale, validateCapitalMovement } from "@/lib/portfolio-entry";
import { resolveWritableInstrumentType } from "@/lib/portfolio-write-policy";
import { createClient } from "@/lib/supabase/server";

const DIRECTIONS = new Set<Direction>(["long", "short"]);
const INSTRUMENT_TYPES = new Set<InstrumentType>(["stock", "etf", "option", "warrant", "knock_out", "other"]);

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
  const requestedInstrumentType = (text(formData, "instrument_type") || "stock") as InstrumentType;
  const quantity = nullableNumber(formData, "quantity");
  const entryPrice = nullableNumber(formData, "entry_price");
  const currentPrice = nullableNumber(formData, "current_price");
  const originalCurrentPrice = nullableNumber(formData, "original_current_price");
  const stopPrice = nullableNumber(formData, "stop_price");
  const instrumentCurrency = (text(formData, "instrument_currency") || portfolio.currency).toUpperCase();
  const categoryId = text(formData, "category_id") || null;
  const notes = text(formData, "notes") || null;
  const entryDate = optionalIsoDate(text(formData, "entry_date"), "Das Einstiegsdatum ist ungültig.");

  if (!ticker || ticker.length > 40 || !DIRECTIONS.has(direction) || !INSTRUMENT_TYPES.has(requestedInstrumentType)) {
    throw new Error("Die Positionsangaben sind ungültig.");
  }
  if (quantity === null || quantity <= 0 || entryPrice === null || entryPrice < 0 || currentPrice === null || currentPrice < 0) {
    throw new Error("Menge, Einstandskurs und aktueller Kurs sind erforderlich und dürfen nicht negativ sein.");
  }
  if (stopPrice !== null && stopPrice < 0) throw new Error("Der Trading-Stopp darf nicht negativ sein.");
  if (!/^[A-Z]{3}$/.test(instrumentCurrency)) throw new Error("Die Instrumentwährung ist ungültig.");
  if (notes && notes.length > 1000) throw new Error("Der Kommentar darf höchstens 1.000 Zeichen enthalten.");

  if (categoryId) {
    const { data: category } = await supabase
      .from("portfolio_categories")
      .select("id")
      .eq("id", categoryId)
      .eq("portfolio_id", portfolio.id)
      .maybeSingle();
    if (!category) throw new Error("Die Kategorie gehört nicht zu diesem Depot.");
  }

  const { data: existing, error: existingError } = id
    ? await supabase.from("positions").select("*").eq("id", id).eq("portfolio_id", portfolio.id).maybeSingle()
    : { data: null, error: null };
  if (existingError || (id && !existing)) throw new Error("Die Position konnte nicht geprüft werden.");

  const instrumentType = resolveWritableInstrumentType(
    requestedInstrumentType,
    existing?.instrument_type as InstrumentType | null,
  );
  const requestedStatus = text(formData, "position_status") === "closed" ? "closed" : "open";
  const sale = normalizePositionSale({
    quantity,
    soldQuantity: nullableNumber(formData, "sold_quantity"),
    salePrice: nullableNumber(formData, "sale_price"),
    saleDate: optionalIsoDate(text(formData, "sale_date"), "Das Verkaufsdatum ist ungültig."),
    requestedStatus,
  });
  const marginInputType = text(formData, "margin_input_type") === "amount" ? "amount" : "rate";
  const margin = normalizeMarginInput({
    accountType: portfolio.account_type,
    inputType: marginInputType,
    value: nullableNumber(formData, "margin_value"),
  });
  const now = new Date().toISOString();
  const shouldWriteManualPrice = !existing
    || existing.ticker !== ticker
    || existing.instrument_currency !== instrumentCurrency
    || currentPrice !== originalCurrentPrice;

  const payload = {
    category_id: categoryId,
    ticker,
    instrument_type: instrumentType,
    direction,
    quantity,
    entry_price: entryPrice,
    instrument_currency: instrumentCurrency,
    stop_price: stopPrice,
    stop_price_native: stopPrice,
    stop_updated_at: stopPrice === null ? null : now,
    sold_quantity: sale.soldQuantity,
    sale_price: sale.salePrice,
    sale_date: sale.saleDate,
    margin_requirement: margin.marginRequirement,
    margin_rate: margin.marginRate,
    margin_source: margin.marginSource,
    margin_currency: margin.marginRequirement === null ? null : portfolio.currency.toUpperCase(),
    margin_as_of: margin.marginRequirement === null && margin.marginRate === null ? null : now,
    margin_calculation_type: margin.marginRequirement !== null ? "direct_requirement" as const : margin.marginRate !== null ? "rate_estimate" as const : null,
    margin_confidence: margin.marginRequirement !== null ? "trusted" as const : margin.marginRate !== null ? "estimated" as const : "missing" as const,
    notes,
    entry_date: entryDate,
    status: sale.status,
    ...(shouldWriteManualPrice ? {
      current_price: currentPrice,
      current_price_native: currentPrice,
      current_price_source: "manual",
      current_price_as_of: now,
      current_price_status: "manually_updated" as const,
    } : {}),
    updated_at: now,
  };

  let result;
  if (existing) {
    const technicalInvalidation = {
      ...(existing.ticker !== ticker ? {
        external_position_id: null,
        market_value: null,
        risk_amount: null,
      } : {}),
      ...(existing.instrument_currency !== instrumentCurrency ? {
        entry_fx_to_base: instrumentCurrency === portfolio.currency.toUpperCase() ? 1 : null,
        current_fx_to_base: instrumentCurrency === portfolio.currency.toUpperCase() ? 1 : null,
        current_fx_source: instrumentCurrency === portfolio.currency.toUpperCase() ? "identity" : null,
        current_fx_as_of: instrumentCurrency === portfolio.currency.toUpperCase() ? now : null,
        current_fx_status: instrumentCurrency === portfolio.currency.toUpperCase() ? "manually_updated" as const : "missing" as const,
        fx_to_base: instrumentCurrency === portfolio.currency.toUpperCase() ? 1 : null,
        market_value: null,
        risk_amount: null,
      } : {}),
    };
    result = await supabase.from("positions").update({ ...payload, ...technicalInvalidation }).eq("id", existing.id).eq("portfolio_id", portfolio.id);
  } else {
    const baseCurrencyPosition = instrumentCurrency === portfolio.currency.toUpperCase();
    result = await supabase.from("positions").insert({
      ...payload,
      portfolio_id: portfolio.id,
      user_id: userId,
      multiplier: 1,
      source_type: "manual",
      entry_fx_to_base: baseCurrencyPosition ? 1 : null,
      current_fx_to_base: baseCurrencyPosition ? 1 : null,
      current_fx_source: baseCurrencyPosition ? "identity" : null,
      current_fx_as_of: baseCurrencyPosition ? now : null,
      current_fx_status: baseCurrencyPosition ? "manually_updated" : "missing",
      fx_to_base: baseCurrencyPosition ? 1 : null,
      market_value: null,
      risk_amount: null,
    });
  }
  if (result.error) throw new Error("Die Position konnte nicht gespeichert werden.");
  revalidatePortfolioPages();
  redirect("/depot");
}

export async function deletePosition(formData: FormData) {
  const supabase = await createClient();
  const portfolio = await getOrCreatePortfolio();
  const id = text(formData, "id");
  const { error } = await supabase.from("positions").delete().eq("id", id).eq("portfolio_id", portfolio.id);
  if (error) throw new Error("Die Position konnte nicht gelöscht werden.");
  revalidatePortfolioPages();
}

export async function saveCapitalMovement(formData: FormData) {
  const supabase = await createClient();
  const userId = await getUserId();
  const portfolio = await getOrCreatePortfolio();
  const movement = validateCapitalMovement({
    type: text(formData, "movement_type"),
    amount: nullableNumber(formData, "amount"),
    currency: text(formData, "currency").toUpperCase(),
    date: text(formData, "movement_date"),
    comment: text(formData, "comment"),
  });
  const { error } = await supabase.from("portfolio_capital_movements").insert({
    user_id: userId,
    portfolio_id: portfolio.id,
    movement_type: movement.type,
    amount_native: movement.amount,
    currency: movement.currency,
    movement_date: movement.date,
    comment: movement.comment,
  });
  if (error) throw new Error("Die Ein- oder Auszahlung konnte nicht gespeichert werden.");
  revalidatePath("/depot");
  revalidatePath("/konto/datenschutz");
  redirect("/depot#capital-movements");
}

function optionalIsoDate(value: string, message: string) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(message);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    date.getUTCFullYear() !== Number(match[1])
    || date.getUTCMonth() !== Number(match[2]) - 1
    || date.getUTCDate() !== Number(match[3])
  ) throw new Error(message);
  return value;
}

function revalidatePortfolioPages() {
  revalidatePath("/depot");
  revalidatePath("/cockpit");
  revalidatePath("/risiko");
}
