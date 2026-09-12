"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Direction, InstrumentType } from "@/lib/calculations/calculation-types";
import type { Database, Position } from "@/lib/database.types";
import { isMissingMarketDataTable } from "@/lib/market-data-mappings";
import { getTwelveDataQuote, searchTwelveData } from "@/lib/market-data-providers/twelve-data";
import type { TwelveDataInstrument } from "@/lib/market-data-providers/twelve-data-core";
import { getOrCreatePortfolio, getUserId } from "@/lib/portfolio";
import { normalizeMarginInput, normalizePositionSale, validateCapitalMovement } from "@/lib/portfolio-entry";
import { resolveWritableInstrumentType } from "@/lib/portfolio-write-policy";
import { createClient } from "@/lib/supabase/server";

const DIRECTIONS = new Set<Direction>(["long", "short"]);
const INSTRUMENT_TYPES = new Set<InstrumentType>(["stock", "etf", "option", "warrant", "knock_out", "other"]);
const MARKET_DATA_SOURCE = "market_data_provider:twelve_data";
const MIC_PATTERN = /^[A-Z0-9]{4}$/;
const PROVIDER_REFRESH_COOLDOWN_MS = 60_000;

type AppSupabaseClient = SupabaseClient<Database>;
type PriceRefreshOutcome =
  | "updated"
  | "provider-disabled"
  | "not-found"
  | "provider-error"
  | "higher-priority-active";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const nullableNumber = (formData: FormData, key: string) => {
  const raw = text(formData, key);
  if (!raw) return null;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : null;
};

export type MarketDataLookupState = {
  status: "idle" | "disabled" | "not_found" | "error";
  message?: string;
} | {
  status: "success";
  symbol: string;
  name: string | null;
  exchange: string | null;
  micCode: string;
  currency: string;
  price: number;
  observedAt: string;
  dataStatus: "delayed" | "end_of_day" | "stale";
  isMarketOpen: boolean;
  candidates: TwelveDataInstrument[];
};

export async function lookupPositionMarketData(
  previousState: MarketDataLookupState,
  formData: FormData,
): Promise<MarketDataLookupState> {
  if (!process.env.TWELVE_DATA_API_KEY?.trim()) {
    return { status: "disabled", message: "Die automatische Kurssuche ist in dieser Umgebung noch nicht aktiviert." };
  }
  const supabase = await createClient();
  await getUserId();
  const searchTerm = text(formData, "ticker");
  if (!searchTerm || searchTerm.length > 80) return { status: "error", message: "Bitte Ticker oder Unternehmensname eingeben." };

  const selectedKey = text(formData, "market_listing_selection");
  let candidates = previousState.status === "success" ? previousState.candidates : [];
  let selected = candidates.find((candidate) => listingSelectionKey(candidate) === selectedKey) ?? null;
  if (!selected) {
    if (!await claimInteractiveProviderCredit(supabase, "symbol_search")) {
      return { status: "error", message: "Das kostenlose Tages- oder Minutenbudget ist reserviert beziehungsweise ausgeschöpft. Bitte später erneut versuchen." };
    }
    const searchResult = await searchTwelveData(searchTerm);
    if (searchResult.status === "disabled") return { status: "disabled", message: "Die automatische Kurssuche ist in dieser Umgebung noch nicht aktiviert." };
    if (searchResult.status === "not_found") return { status: "not_found", message: "Für den Suchbegriff wurde keine passende Notierung gefunden." };
    if (searchResult.status !== "success") return { status: "error", message: "Die Instrumentensuche ist momentan nicht verfügbar. Bitte später erneut versuchen." };
    candidates = distinctListingCandidates(searchResult.data).slice(0, 3);
    selected = candidates[0] ?? null;
  }
  if (!selected) return { status: "not_found", message: "Für den Suchbegriff wurde keine passende Notierung gefunden." };

  if (!await claimInteractiveProviderCredit(supabase, "quote")) {
    return { status: "error", message: "Das kostenlose Tages- oder Minutenbudget ist reserviert beziehungsweise ausgeschöpft. Bitte später erneut versuchen." };
  }
  const result = await getTwelveDataQuote({ symbol: selected.symbol, currency: selected.currency, micCode: selected.micCode });
  if (result.status === "disabled") {
    return { status: "disabled", message: "Die automatische Kurssuche ist in dieser Umgebung noch nicht aktiviert." };
  }
  if (result.status === "not_found") {
    return { status: "not_found", message: "Für Ticker und Währung wurde keine passende Notierung gefunden." };
  }
  if (result.status !== "success") {
    return { status: "error", message: "Die Kursquelle ist momentan nicht verfügbar. Bitte später erneut versuchen." };
  }
  return {
    status: "success",
    symbol: result.data.symbol,
    name: result.data.name,
    exchange: result.data.exchange,
    micCode: result.data.micCode,
    currency: result.data.currency,
    price: result.data.price,
    observedAt: result.data.observedAt,
    dataStatus: result.data.status,
    isMarketOpen: result.data.isMarketOpen,
    candidates,
  };
}

async function claimInteractiveProviderCredit(
  supabase: AppSupabaseClient,
  requestKind: "quote" | "symbol_search",
) {
  const { data, error } = await supabase.rpc("claim_market_data_request", {
    target_provider: "twelve_data",
    request_mode: "interactive",
    request_kind: requestKind,
  });
  if (error && isMissingMarketDataTable(error)) return true;
  return !error && data === "claimed";
}

function listingSelectionKey(candidate: Pick<TwelveDataInstrument, "symbol" | "micCode" | "currency">) {
  return `${candidate.symbol}@${candidate.micCode}:${candidate.currency}`;
}

function distinctListingCandidates(candidates: TwelveDataInstrument[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = listingSelectionKey(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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
  const marketDataMic = text(formData, "market_data_mic").toUpperCase() || null;
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
  if (marketDataMic && !MIC_PATTERN.test(marketDataMic)) {
    throw new Error("Der Börsenplatz muss als vierstelliger MIC angegeben werden, zum Beispiel XETR oder XNAS.");
  }

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
        instrument_name: null,
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
    result = await supabase
      .from("positions")
      .update({ ...payload, ...technicalInvalidation })
      .eq("id", existing.id)
      .eq("portfolio_id", portfolio.id)
      .select("id")
      .single();
  } else {
    const baseCurrencyPosition = instrumentCurrency === portfolio.currency.toUpperCase();
    result = await supabase
      .from("positions")
      .insert({
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
      })
      .select("id")
      .single();
  }
  if (result.error || !result.data) throw new Error("Die Position konnte nicht gespeichert werden.");
  const priceOutcome = sale.status === "closed"
    ? null
    : await refreshPositionFromTwelveData({
      supabase,
      userId,
      portfolioId: portfolio.id,
      positionId: result.data.id,
      ticker,
      currency: instrumentCurrency,
      requestedMic: marketDataMic,
      currentPriceSource: shouldWriteManualPrice ? "manual" : existing?.current_price_source ?? "manual",
    });
  revalidatePortfolioPages();
  redirect(priceOutcome ? `/depot?price=${priceOutcome}` : "/depot");
}

export async function refreshPositionPrice(formData: FormData) {
  const supabase = await createClient();
  const userId = await getUserId();
  const portfolio = await getOrCreatePortfolio();
  const id = text(formData, "id");
  if (!id) throw new Error("Die Position fehlt.");

  const { data: position, error: positionError } = await supabase
    .from("positions")
    .select("*")
    .eq("id", id)
    .eq("portfolio_id", portfolio.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (positionError || !position || position.instrument_type === "cash" || position.status === "closed") {
    throw new Error("Die Position kann nicht aktualisiert werden.");
  }

  const { data: mapping, error: mappingError } = await supabase
    .from("position_market_data_mappings")
    .select("mic_code")
    .eq("position_id", position.id)
    .eq("provider", "twelve_data")
    .maybeSingle();
  if (mappingError && !isMissingMarketDataTable(mappingError)) {
    throw new Error("Die Kurszuordnung konnte nicht geprüft werden.");
  }

  const outcome = await refreshPositionFromTwelveData({
    supabase,
    userId,
    portfolioId: portfolio.id,
    positionId: position.id,
    ticker: position.ticker,
    currency: position.instrument_currency ?? portfolio.currency,
    requestedMic: mapping?.mic_code ?? null,
    currentPriceSource: position.current_price_source,
  });
  revalidatePortfolioPages();
  redirect(`/depot?price=${outcome}`);
}

export async function refreshActiveMarketData() {
  if (!process.env.TWELVE_DATA_API_KEY?.trim()) return { status: "provider-disabled" as const };
  const supabase = await createClient();
  const userId = await getUserId();
  const { data: positions, error: positionError } = await supabase
    .from("positions")
    .select("id,listing_id")
    .eq("user_id", userId)
    .eq("status", "open")
    .neq("instrument_type", "cash");
  if (positionError && isMissingMarketDataTable(positionError)) return { status: "schema-pending" as const };
  if (positionError) return { status: "error" as const };
  const unassignedPositionCount = (positions ?? []).filter((position) => !position.listing_id).length;
  const listingIds = [...new Set((positions ?? []).flatMap((position) => position.listing_id ? [position.listing_id] : []))];
  if (listingIds.length === 0) {
    return { status: unassignedPositionCount > 0 ? "mapping-required" as const : "idle" as const };
  }

  const [{ data: mappings, error: mappingError }, { data: quotes, error: quoteError }] = await Promise.all([
    supabase.from("market_listing_provider_mappings").select("listing_id,provider_symbol,provider_mic,provider_currency").in("listing_id", listingIds).eq("provider", "twelve_data").eq("provider_status", "verified"),
    supabase.from("market_listing_quotes").select("listing_id,fetched_at,is_market_open").in("listing_id", listingIds).eq("provider", "twelve_data"),
  ]);
  if ((mappingError && isMissingMarketDataTable(mappingError)) || (quoteError && isMissingMarketDataTable(quoteError))) return { status: "schema-pending" as const };
  if (mappingError || quoteError) return { status: "error" as const };

  for (const mapping of mappings ?? []) {
    const cached = (quotes ?? []).find((quote) => quote.listing_id === mapping.listing_id);
    const maximumAgeMs = cached?.is_market_open === false ? 12 * 60 * 60 * 1_000 : 60 * 60 * 1_000;
    const minimumFetchedAt = new Date(Date.now() - maximumAgeMs).toISOString();
    const { data: claim, error: claimError } = await supabase.rpc("claim_market_quote_refresh", {
      target_listing: mapping.listing_id,
      target_provider: "twelve_data",
      refresh_mode: "automatic",
      minimum_fetched_at: minimumFetchedAt,
    });
    if (claimError && isMissingMarketDataTable(claimError)) return { status: "schema-pending" as const };
    if (claimError) return { status: "error" as const };
    if (!claim || typeof claim !== "object" || Array.isArray(claim) || claim.status !== "claimed" || typeof claim.lease_token !== "string") {
      if (typeof claim === "object" && !Array.isArray(claim) && claim?.status === "budget_exhausted") return { status: "budget" as const };
      continue;
    }
    const result = await getTwelveDataQuote({ symbol: mapping.provider_symbol, currency: mapping.provider_currency, micCode: mapping.provider_mic });
    if (result.status !== "success") {
      const seconds = result.status === "rate_limited" ? 3_600 : result.status === "not_found" ? 86_400 : 900;
      await supabase.rpc("fail_market_quote_refresh", {
        target_listing: mapping.listing_id,
        target_provider: "twelve_data",
        supplied_lease_token: claim.lease_token,
        failure: result.status,
        backoff_seconds: seconds,
      });
      return { status: result.status === "rate_limited" ? "rate-limited" as const : "stale" as const };
    }
    await supabase.rpc("complete_market_quote_refresh", {
      target_listing: mapping.listing_id,
      target_provider: "twelve_data",
      supplied_lease_token: claim.lease_token,
      quote_price: result.data.price,
      quote_currency: result.data.currency,
      quote_observed_at: result.data.observedAt,
      quote_status: result.data.status,
      market_open: result.data.isMarketOpen,
    });
    revalidatePortfolioPages();
    return { status: "updated" as const };
  }
  return { status: unassignedPositionCount > 0 ? "mapping-required" as const : "fresh" as const };
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

async function refreshPositionFromTwelveData({
  supabase,
  userId,
  portfolioId,
  positionId,
  ticker,
  currency,
  requestedMic,
  currentPriceSource,
}: {
  supabase: AppSupabaseClient;
  userId: string;
  portfolioId: string;
  positionId: string;
  ticker: string;
  currency: string;
  requestedMic: string | null;
  currentPriceSource: Position["current_price_source"];
}): Promise<PriceRefreshOutcome> {
  const { data: recentObservation, error: recentObservationError } = await supabase
    .from("position_price_observations")
    .select("observed_at")
    .eq("position_id", positionId)
    .eq("ticker", ticker.trim().toUpperCase())
    .eq("currency", currency.trim().toUpperCase())
    .eq("source_type", "market_data_provider")
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recentObservationError && !isMissingMarketDataTable(recentObservationError)) {
    return "provider-error";
  }
  if (
    recentObservation
    && Date.now() - Date.parse(recentObservation.observed_at) < PROVIDER_REFRESH_COOLDOWN_MS
  ) return "updated";

  const quoteResult = await getTwelveDataQuote({
    symbol: ticker,
    currency,
    micCode: requestedMic,
  });
  if (quoteResult.status === "disabled") return "provider-disabled";
  if (quoteResult.status === "not_found") return "not-found";
  if (quoteResult.status !== "success") return "provider-error";

  const quote = quoteResult.data;
  const { data: listingId, error: listingError } = await supabase.rpc("attach_position_listing", {
    target_position: positionId,
    provider_name: "twelve_data",
    listing_symbol: quote.symbol,
    listing_exchange: quote.exchange ?? "",
    listing_mic: quote.micCode,
    listing_currency: quote.currency,
    instrument_name: quote.name ?? quote.symbol,
    provider_instrument_type: quote.instrumentType ?? "",
    listing_country: quote.country,
    listing_timezone: quote.exchangeTimezone,
    user_selected: requestedMic !== null,
  });
  if (listingError && !isMissingMarketDataTable(listingError)) return "provider-error";
  if (listingId) {
    const { data: claim, error: claimError } = await supabase.rpc("claim_market_quote_refresh", {
      target_listing: listingId,
      target_provider: "twelve_data",
      refresh_mode: "interactive",
      minimum_fetched_at: null,
    });
    if (!claimError && claim && typeof claim === "object" && !Array.isArray(claim) && claim.status === "claimed" && typeof claim.lease_token === "string") {
      await supabase.rpc("complete_market_quote_refresh", {
        target_listing: listingId,
        target_provider: "twelve_data",
        supplied_lease_token: claim.lease_token,
        quote_price: quote.price,
        quote_currency: quote.currency,
        quote_observed_at: quote.observedAt,
        quote_status: quote.status,
        market_open: quote.isMarketOpen,
      });
    }
  }
  const { error: mappingError } = await supabase
    .from("position_market_data_mappings")
    .upsert({
      user_id: userId,
      portfolio_id: portfolioId,
      position_id: positionId,
      provider: "twelve_data",
      provider_symbol: quote.symbol,
      exchange: quote.exchange,
      mic_code: quote.micCode,
      currency: quote.currency,
      instrument_name: quote.name,
      instrument_type: quote.instrumentType,
      mapping_status: requestedMic ? "manual" : "verified",
      verified_at: quote.observedAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: "position_id,provider" });
  if (mappingError && !isMissingMarketDataTable(mappingError)) return "provider-error";

  if (quote.name) {
    const { error: nameError } = await supabase
      .from("positions")
      .update({ instrument_name: quote.name })
      .eq("id", positionId)
      .eq("portfolio_id", portfolioId)
      .eq("user_id", userId)
      .is("instrument_name", null);
    if (nameError) return "provider-error";
  }

  const { error: observationError } = await supabase
    .from("position_price_observations")
    .upsert({
      user_id: userId,
      portfolio_id: portfolioId,
      position_id: positionId,
      ticker: ticker.trim().toUpperCase(),
      currency: quote.currency,
      price_native: quote.price,
      source_type: "market_data_provider",
      source_name: "Twelve Data",
      observed_at: quote.observedAt,
      status: quote.status,
      source_reference: `${quote.symbol}@${quote.micCode}`,
    }, {
      onConflict: "position_id,source_type,observed_at,price_native",
      ignoreDuplicates: true,
    });

  if (!observationError) return "updated";
  if (!isMissingMarketDataTable(observationError)) return "provider-error";
  if (hasHigherPriorityCompatibilitySource(currentPriceSource)) return "higher-priority-active";

  const { error: compatibilityError } = await supabase
    .from("positions")
    .update({
      current_price: quote.price,
      current_price_native: quote.price,
      current_price_source: MARKET_DATA_SOURCE,
      current_price_as_of: quote.observedAt,
      current_price_status: quote.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", positionId)
    .eq("portfolio_id", portfolioId)
    .eq("user_id", userId);
  return compatibilityError ? "provider-error" : "updated";
}

function hasHigherPriorityCompatibilitySource(source: string | null) {
  const normalized = source?.trim().toLowerCase() ?? "";
  return normalized.includes("ibkr")
    || normalized.includes("interactive brokers")
    || (normalized.includes("broker") && !normalized.includes("provider"));
}
