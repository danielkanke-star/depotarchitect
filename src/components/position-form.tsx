"use client";

import { useActionState, useState } from "react";
import {
  lookupPositionMarketData,
  savePositionWithFeedback,
  type MarketDataLookupState,
} from "@/app/(dashboard)/depot/actions";
import type {
  PortfolioAccountType,
  PortfolioCategory,
  Position,
  PositionMarketDataMapping,
} from "@/lib/database.types";
import { isMarginAccount } from "@/lib/portfolio-entry";
import { InfoTip } from "./info-tip";
import { berlinDate } from "@/lib/risk-rules";

type EditablePosition = Pick<Position,
  "id" | "ticker" | "category_id" | "instrument_type" | "direction" | "quantity"
  | "instrument_currency" | "entry_price" | "entry_date" | "stop_price_native"
  | "stop_price" | "status" | "notes" | "sold_quantity" | "sale_price" | "sale_date"
  | "margin_rate" | "margin_requirement" | "margin_source"
  | "journal_source_key" | "entry_margin_base" | "entry_fx_to_base" | "current_fx_to_base" | "tradingview_url" | "quantity_step" | "multiplier"
>;

const INITIAL_LOOKUP_STATE: MarketDataLookupState = { status: "idle" };

export function PositionForm({
  position,
  categories,
  accountType,
  baseCurrency,
  currentPrice,
  currentPriceSource,
  marketDataMapping,
  portfolioId,
}: {
  position?: EditablePosition;
  portfolioId: string;
  categories: PortfolioCategory[];
  accountType: PortfolioAccountType;
  baseCurrency: string;
  currentPrice?: number | null;
  currentPriceSource?: string | null;
  marketDataMapping?: Pick<PositionMarketDataMapping, "mic_code" | "exchange"> | null;
}) {
  const initiallyClosed = position?.status === "closed";
  const brokerEntry = position?.journal_source_key?.startsWith("execution:") ?? false;
  const entryLocked = Boolean(position && (brokerEntry || position.sold_quantity > 0 || position.entry_margin_base != null));
  const [saveState, saveAction, savePending] = useActionState(savePositionWithFeedback, { message: "" });
  const [entryDate, setEntryDate] = useState(position ? position.entry_date ?? "" : berlinDate());
  const [lookupState, lookupAction, lookupPending] = useActionState(
    lookupPositionMarketData,
    INITIAL_LOOKUP_STATE,
  );
  const marginApplicable = isMarginAccount(accountType);
  const directMargin = ["manual_direct", "broker", "imported_direct"].includes(position?.margin_source ?? "");

  const [security, setSecurity] = useState(position?.ticker ?? "");
  const [searched, setSearched] = useState("");
  const market = lookupState.status === "success" && searched === security ? lookupState : null;
  const foundCurrency = market && (!entryLocked || market.currency === position?.instrument_currency) ? market.currency : null;
  const manualCurrency = position?.instrument_currency ?? "";
  const [chosenCurrency, setChosenCurrency] = useState(manualCurrency);
  const [instrumentType, setInstrumentType] = useState(position?.instrument_type ?? "stock");

  return (
    <form action={saveAction} className="space-y-5">
      <input type="hidden" name="portfolio_id" value={portfolioId} />
      <input type="hidden" name="id" value={position?.id ?? ""} />
      <input type="hidden" name="position_status" value={initiallyClosed ? "closed" : "open"} />
      <input type="hidden" name="sold_quantity" value={position?.sold_quantity ?? ""} />
      <input type="hidden" name="sale_price" value={position?.sale_price ?? ""} />
      <input type="hidden" name="sale_date" value={position?.sale_date ?? ""} />
      <input type="hidden" name="ticker" value={entryLocked ? position?.ticker ?? "" : market?.symbol ?? security} />
      <input type="hidden" name="market_data_symbol" value={foundCurrency ? market?.symbol : ""} />
      <input type="hidden" name="original_current_price" value={currentPrice ?? ""} />
      <input type="hidden" name="market_data_mic" value={foundCurrency ? market?.micCode : marketDataMapping?.mic_code ?? ""} />
      {entryLocked && <><input type="hidden" name="instrument_type" value={position?.instrument_type} /><input type="hidden" name="direction" value={position?.direction} /></>}
      {Boolean(position && position.sold_quantity > 0) && <input type="hidden" name="category_id" value={position?.category_id ?? ""} />}

      {entryLocked && <p className="text-sm font-medium">{position?.ticker}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1">{entryLocked ? "Kursnotierung suchen" : "Wertpapier"}
          <input name="search_term" required={!entryLocked} maxLength={80} placeholder="Name oder Ticker" value={security}
            onChange={event => { setSecurity(event.target.value); setSearched(""); }} />
        </label>
        <button formAction={lookupAction} formNoValidate onClick={() => setSearched(security)} disabled={lookupPending || savePending} className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:border-accent/60 disabled:opacity-45">
          {lookupPending ? "Wird gesucht …" : market && market.candidates.length > 1 ? "Notierung laden" : "Wertpapier suchen"}
        </button>
      </div>
      {searched === security && <MarketDataLookupResult state={lookupState} />}
      {market && entryLocked && !foundCurrency && <p className="text-sm text-amber-200">Bitte eine Notierung in {position?.instrument_currency} wählen.</p>}
      {market && market.candidates.length > 1 && <label className="max-w-lg">Notierung<select key={market.micCode} name="market_listing_selection" defaultValue={`${market.symbol}@${market.micCode}:${market.currency}`}>
        {market.candidates.map(candidate => <option key={`${candidate.symbol}@${candidate.micCode}:${candidate.currency}`} value={`${candidate.symbol}@${candidate.micCode}:${candidate.currency}`}>{candidate.symbol} · {candidate.exchange ?? candidate.micCode} · {candidate.currency}</option>)}
      </select></label>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label>Stückzahl<input name="quantity" readOnly={entryLocked} required inputMode="decimal" defaultValue={position?.quantity ?? ""} /></label>
        <label>Einstiegskurs<input name="entry_price" readOnly={entryLocked} required inputMode="decimal" defaultValue={position?.entry_price ?? ""} /></label>
        <label>Einstiegsdatum<input type="date" name="entry_date" readOnly={entryLocked} required={!position || position.entry_date !== null} value={entryDate} onChange={e => setEntryDate(e.target.value)} /></label>
        <label>Handelswährung<input key={foundCurrency ?? "manual-currency"} name="instrument_currency" required maxLength={3} readOnly={entryLocked || Boolean(foundCurrency)}
          value={foundCurrency ?? chosenCurrency} onChange={event => setChosenCurrency(event.target.value.toUpperCase())} /></label>
        <label>Stopp beim Broker<input name="stop_price" inputMode="decimal" placeholder="Optional" defaultValue={position?.stop_price_native ?? position?.stop_price ?? ""} /></label>
        <label>Kategorie<select name="category_id" disabled={Boolean(position && position.sold_quantity > 0)} defaultValue={position?.category_id ?? ""}><option value="">Ohne Kategorie</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      </div>

      <details className="rounded-xl border border-border px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">Weitere Angaben</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label>Instrumenttyp<select name="instrument_type" disabled={entryLocked} value={instrumentType} onChange={event => setInstrumentType(event.target.value as EditablePosition["instrument_type"])}>
            <option value="stock">Aktie</option><option value="etf">ETF</option><option value="option">Option</option><option value="warrant">Optionsschein</option><option value="knock_out">Knock-out</option><option value="other">Sonstiges</option>
          </select></label>
          <label>Richtung<select name="direction" disabled={entryLocked} defaultValue={position?.direction ?? "long"}><option value="long">Long</option><option value="short">Short</option>{instrumentType === "option" && <><option value="long_call">Long Call</option><option value="long_put">Long Put</option><option value="short_call">Short Call</option><option value="short_put">Short Put</option></>}</select></label>
          <label>Aktueller Kurs · optional<input name="current_price" inputMode="decimal" defaultValue={currentPrice ?? ""} placeholder="Automatisch, falls verfügbar" />{currentPriceSource && <span className="text-xs text-muted">{currentPriceSource}</span>}</label>
          {marginApplicable && <>
            <label>Margin als<select name="margin_input_type" defaultValue={directMargin ? "amount" : "rate"}><option value="rate">Prozent</option><option value="amount">Betrag in {baseCurrency}</option></select></label>
            <label>Margin<input name="margin_value" inputMode="decimal" defaultValue={directMargin ? position?.margin_requirement ?? "" : position?.margin_rate == null ? "" : position.margin_rate * 100} /></label>
            <label>Einstiegsmargin in {baseCurrency}<input name="entry_margin_base" inputMode="decimal" readOnly={position?.entry_margin_base != null} defaultValue={position?.entry_margin_base ?? ""} /></label>
          </>}
          <label>Kontraktgröße<input name="multiplier" readOnly={entryLocked} type="number" min="0.000001" step="any" defaultValue={position?.multiplier ?? 1} /></label>
          <label>Zulässige Stückelung<input name="quantity_step" type="number" min="0.000001" step="any" defaultValue={position?.quantity_step ?? 1} /></label>
          <label>TradingView-Link<input name="tradingview_url" type="url" placeholder="https://www.tradingview.com/x/…" defaultValue={position?.tradingview_url ?? ""} /></label>
          <label className="sm:col-span-2">Kommentar<textarea name="notes" rows={2} maxLength={1000} defaultValue={position?.notes ?? ""} /></label>
        </div>
        {Boolean(foundCurrency ?? chosenCurrency) && (foundCurrency ?? chosenCurrency) !== baseCurrency && <details className="mt-3 text-sm text-muted">
          <summary className="cursor-pointer">Währungsumrechnung</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label>Referenzkurs für die Bewertung<input name="current_fx_to_base" inputMode="decimal" placeholder="Automatisch" /></label>
            <label>Wechselkurs beim Einstieg<input name="entry_fx_to_base" inputMode="decimal" readOnly={brokerEntry} defaultValue={position?.entry_fx_to_base ?? ""} placeholder="Automatisch" /></label>
          </div>
        </details>}
      </details>

      <div className="flex flex-wrap items-center gap-4">
        <button disabled={savePending || lookupPending} className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-[#062218] disabled:opacity-45">{savePending ? "Wird gespeichert …" : "Position speichern"}</button>
        {Boolean(foundCurrency ?? chosenCurrency) && (foundCurrency ?? chosenCurrency) !== baseCurrency && <span className="flex items-center gap-1.5 text-xs text-muted">Umrechnung in {baseCurrency}<InfoTip label="Währungsumrechnung">DepotArchitect rechnet automatisch in die Depotwährung um. Der Kurs am Handelstag und der Kurs für die heutige Bewertung können sich unterscheiden.</InfoTip></span>}
      </div>
      {saveState.message && <p role="alert" className="text-sm text-amber-200">{saveState.message}</p>}
    </form>
  );
}

function MarketDataLookupResult({ state }: { state: MarketDataLookupState }) {
  if (state.status === "idle") return null;
  if (state.status !== "success") {
    return <div role="status" aria-live="polite" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100 sm:col-span-2 xl:col-span-4">{state.message}</div>;
  }

  const observedAt = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(state.observedAt));
  const statusLabel = state.dataStatus === "live" ? "Echtzeitversorgung" : state.dataStatus === "manually_updated" ? "Depotbewertung · Kurszeit unbestätigt" : state.dataStatus === "delayed"
    ? "verzögert"
    : state.dataStatus === "end_of_day"
      ? "Schlusskurs"
      : "veraltet";

  return <div role="status" aria-live="polite" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 sm:col-span-2 xl:col-span-4">
    <div className="font-medium text-emerald-100">{state.name ?? state.symbol}</div>
    <div className="mt-1 text-xs text-emerald-50/80">
      {state.symbol} · {state.exchange ?? "Börse nicht benannt"} ({state.micCode}) · {state.price.toLocaleString("de-DE", { maximumFractionDigits: 6 })} {state.currency} · {statusLabel} · {observedAt}
    </div>
    <div className="mt-1 text-[11px] text-emerald-50/60">Quelle: {state.sourceName ?? "Twelve Data"}.</div>
  </div>;
}
