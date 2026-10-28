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
import { berlinDate } from "@/lib/risk-rules";

type EditablePosition = Pick<Position,
  "id" | "ticker" | "category_id" | "instrument_type" | "direction" | "quantity"
  | "instrument_currency" | "entry_price" | "entry_date" | "stop_price_native"
  | "stop_price" | "status" | "notes" | "sold_quantity" | "sale_price" | "sale_date"
  | "margin_rate" | "margin_requirement" | "margin_source"
  | "entry_margin_base" | "entry_fx_to_base" | "current_fx_to_base" | "tradingview_url" | "quantity_step" | "multiplier"
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
}: {
  position?: EditablePosition;
  categories: PortfolioCategory[];
  accountType: PortfolioAccountType;
  baseCurrency: string;
  currentPrice?: number | null;
  currentPriceSource?: string | null;
  marketDataMapping?: Pick<PositionMarketDataMapping, "mic_code" | "exchange"> | null;
}) {
  const initiallyClosed = position?.status === "closed";
  const entryLocked = Boolean(position && (position.sold_quantity > 0 || position.entry_margin_base != null));
  const [saveState, saveAction, savePending] = useActionState(savePositionWithFeedback, { message: "" });
  const [entryDate, setEntryDate] = useState(position ? position.entry_date ?? "" : berlinDate());
  const [lookupState, lookupAction, lookupPending] = useActionState(
    lookupPositionMarketData,
    INITIAL_LOOKUP_STATE,
  );
  const marginApplicable = isMarginAccount(accountType);
  const directMargin = ["manual_direct", "broker", "imported_direct"].includes(position?.margin_source ?? "");

  return (
    <form action={saveAction} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {entryLocked && <>{position && position.sold_quantity > 0 && <input type="hidden" name="category_id" value={position.category_id ?? ""} />}<input type="hidden" name="instrument_type" value={position?.instrument_type} /><input type="hidden" name="direction" value={position?.direction} /></>}
      <input type="hidden" name="id" value={position?.id ?? ""} />
      <input type="hidden" name="position_status" value={initiallyClosed ? "closed" : "open"} />
      <input type="hidden" name="sold_quantity" value={position?.sold_quantity ?? ""} />
      <input type="hidden" name="sale_price" value={position?.sale_price ?? ""} />
      <input type="hidden" name="sale_date" value={position?.sale_date ?? ""} />
      <label>Ticker oder Unternehmen<input key={lookupState.status === "success" ? `ticker-${lookupState.symbol}` : "ticker-initial"} name="ticker" readOnly={entryLocked} required maxLength={80} defaultValue={lookupState.status === "success" ? lookupState.symbol : position?.ticker ?? ""} /><span className="mt-1 block text-[11px] text-muted">Für neue Positionen genügt ein Suchbegriff. Name, Börsenplatz, MIC, Währung und Kurs werden gemeinsam aufgelöst.</span></label>
      <label>Kategorie<select name="category_id" disabled={Boolean(position && position.sold_quantity > 0)} defaultValue={position?.category_id ?? ""}><option value="">Keine</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label>Positionstyp<select name="instrument_type" disabled={entryLocked} defaultValue={position?.instrument_type ?? "stock"}><option value="stock">Aktie</option><option value="etf">ETF</option><option value="option">Option</option><option value="warrant">Optionsschein</option><option value="knock_out">Knock-out</option><option value="other">Sonstiges</option></select></label>
      <label>Richtung<select name="direction" disabled={entryLocked} defaultValue={position?.direction === "short" ? "short" : "long"}><option value="long">Long</option><option value="short">Short</option></select></label>
      <div className="rounded-xl border border-border p-3 text-xs text-muted">Verkäufe werden separat im Verkaufsjournal erfasst. Bei vorhandenen Verkäufen bleiben die Einstiegsdaten erhalten.</div>
      <label>Menge beim Einstieg<input name="quantity" readOnly={entryLocked} required inputMode="decimal" defaultValue={position?.quantity ?? 1} /></label>
      <label>Instrumentwährung<input key={lookupState.status === "success" ? `currency-${lookupState.currency}` : "currency-initial"} name="instrument_currency" required maxLength={3} readOnly={entryLocked || lookupState.status === "success"} defaultValue={lookupState.status === "success" ? lookupState.currency : position?.instrument_currency ?? baseCurrency} /><span className="mt-1 block text-[11px] text-muted">Wird bei erfolgreicher Notierungswahl automatisch gesetzt; ohne Anbieter bleibt die manuelle Rückfalleingabe möglich.</span></label>
      <label>Einstandskurs<input name="entry_price" readOnly={entryLocked} required inputMode="decimal" defaultValue={position?.entry_price ?? ""} /></label>
      <label>Aktueller Kurs<input key={lookupState.status === "success" ? `${lookupState.symbol}-${lookupState.micCode}-${lookupState.observedAt}` : "initial"} name="current_price" required inputMode="decimal" defaultValue={lookupState.status === "success" ? lookupState.price : currentPrice ?? ""} /><span className="mt-1 block text-[11px] text-muted">{currentPriceSource ? `Aktive Quelle: ${currentPriceSource}.` : "Notwendiger Rückfallkurs."} Twelve Data wird automatisch versucht. Ein späterer gültiger IBKR-Kurs hat automatisch Vorrang.</span></label>
      <input type="hidden" name="original_current_price" value={currentPrice ?? ""} />
      <input type="hidden" name="market_data_mic" value={lookupState.status === "success" ? lookupState.micCode : marketDataMapping?.mic_code ?? ""} />
      {lookupState.status === "success" && lookupState.candidates.length > 1 ? <label>Alternative Notierung<select name="market_listing_selection" defaultValue={`${lookupState.symbol}@${lookupState.micCode}:${lookupState.currency}`}>
        {lookupState.candidates.map((candidate) => <option key={`${candidate.symbol}@${candidate.micCode}:${candidate.currency}`} value={`${candidate.symbol}@${candidate.micCode}:${candidate.currency}`}>{candidate.symbol} · {candidate.exchange ?? candidate.micCode} ({candidate.micCode}) · {candidate.currency}</option>)}
      </select><span className="mt-1 block text-[11px] text-muted">Die erste Auswahl folgt ausschließlich der Anbieterrelevanz und ist keine Aussage zur Liquidität. Alternative wählen und erneut laden.</span></label> : <div className="rounded-xl border border-border/70 bg-background/30 p-3 text-xs text-muted">{marketDataMapping?.exchange ? `Aktuelle Zuordnung: ${marketDataMapping.exchange} (${marketDataMapping.mic_code}).` : "Die Notierung wird als vollständiges Tupel aus Symbol, MIC und Währung gespeichert."}</div>}
      <div className="flex items-end">
        <button formAction={lookupAction} formNoValidate disabled={lookupPending} className="w-full rounded-xl border border-accent/50 px-4 py-2.5 text-sm text-accent disabled:opacity-60">
          {lookupPending ? "Kurs wird gesucht …" : lookupState.status === "success" ? "Ausgewählte Notierung laden" : "Unternehmen & Kurs suchen"}
        </button>
      </div>
      <MarketDataLookupResult state={lookupState} />
      <label>Einstiegsdatum<input type="date" name="entry_date" readOnly={entryLocked} required={!position || position.entry_date !== null} value={entryDate} onChange={e => setEntryDate(e.target.value)} />{position?.entry_date === null && <span className="mt-1 block text-xs text-muted">Bei diesem Altbestand ist das Datum unbekannt. Für eine Stoppänderung darf es leer bleiben.</span>}</label>
      <label>Trading-Stopp beim Broker<input name="stop_price" inputMode="decimal" defaultValue={position?.stop_price_native ?? position?.stop_price ?? ""} /><span className="mt-1 block text-xs text-muted">Den tatsächlich beim Broker gesetzten Stopp dokumentieren.</span></label>
      <label>Aktueller Wechselkurs · 1 Instrumentwährung in {baseCurrency}<input key={`fx-${lookupState.status === "success" ? lookupState.observedAt : "stored"}`} name="current_fx_to_base" inputMode="decimal" defaultValue={lookupState.status === "success" ? lookupState.fxToBase ?? "" : position?.current_fx_to_base ?? ""} /><span className="mt-1 block text-xs text-muted">Wird bei der Kurssuche und beim Speichern automatisch geladen. Nur für einen eigenen Referenzkurs ausfüllen.</span></label>

      {marginApplicable ? <>
        <label>Marginangabe<select name="margin_input_type" defaultValue={directMargin ? "amount" : "rate"}><option value="rate">Marginquote in Prozent</option><option value="amount">Marginbetrag</option></select></label>
        <label>Marginwert<input name="margin_value" inputMode="decimal" defaultValue={directMargin ? position?.margin_requirement ?? "" : position?.margin_rate == null ? "" : position.margin_rate * 100} /></label>
      </> : <div className="rounded-xl border border-border/70 bg-background/30 p-3 text-sm text-muted sm:col-span-2">Margin ist für dieses Kontomodell nicht zutreffend.</div>}

      <details className="sm:col-span-2 xl:col-span-4 rounded-xl border border-border p-3"><summary className="cursor-pointer text-sm">Einstiegsreferenz, Stückelung und TradingView</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label>Wechselkurs beim Einstieg · 1 Instrumentwährung in {baseCurrency}<input key={`entry-fx-${entryDate}-${lookupState.status === "success" ? lookupState.observedAt : "stored"}`} name="entry_fx_to_base" inputMode="decimal" defaultValue={position?.entry_fx_to_base ?? (entryDate === berlinDate() && lookupState.status === "success" && !lookupState.fxStale ? lookupState.fxToBase ?? "" : "")} /><span className="mt-1 block text-xs text-muted">Bei älteren Einstiegen historischen Kurs angeben. Kein heutiger Ersatz.</span></label>
        <label>Einstiegsmargin · {baseCurrency}<input name="entry_margin_base" inputMode="decimal" readOnly={position?.entry_margin_base != null} defaultValue={position?.entry_margin_base ?? ""} /><span className="mt-1 block text-xs text-muted">Wird einmal festgehalten. Bei einem heutigen Neueinstieg aus dessen Marginangabe und Einstieg-Wechselkurs berechnet. Ältere Einstiege benötigen eine historische Referenz.</span></label>
        <label>Multiplikator<input name="multiplier" readOnly={entryLocked} type="number" min="0.000001" step="any" defaultValue={position?.multiplier ?? 1} /></label>
        <label>Zulässige Stückelung<input name="quantity_step" type="number" min="0.000001" step="any" defaultValue={position?.quantity_step ?? 1} /></label>
        <label className="sm:col-span-2">TradingView-Link<input name="tradingview_url" type="url" placeholder="https://www.tradingview.com/x/…" defaultValue={position?.tradingview_url ?? ""} /></label>
      </div></details>

      <label className="sm:col-span-2 xl:col-span-4">Kommentar · optional<textarea name="notes" rows={3} maxLength={1000} defaultValue={position?.notes ?? ""} /></label>
      {entryLocked && <p className="sm:col-span-2 xl:col-span-4 text-xs text-muted">Die Einstiegsreferenz ist festgehalten. Weitere Käufe als neue Teilposition erfassen; Einstiegsdatum, Kategorie, Währung und Richtung dieser Referenz bleiben erhalten.</p>}
      <div className="sm:col-span-2 xl:col-span-4"><button disabled={savePending || lookupPending} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-[#062218] disabled:opacity-50">{savePending ? "Wird gespeichert …" : "Position speichern"}</button></div>
      {saveState.message && <p role="status" className="sm:col-span-2 xl:col-span-4 text-sm text-amber-200">{saveState.message}</p>}
    </form>
  );
}

function MarketDataLookupResult({ state }: { state: MarketDataLookupState }) {
  if (state.status === "idle") {
    return <div className="rounded-xl border border-border/70 bg-background/30 p-3 text-xs text-muted sm:col-span-2 xl:col-span-4">Ticker oder Unternehmensname genügt. Die erste Notierung folgt der Relevanzreihenfolge des Anbieters; bis zu zwei Alternativen werden nur angeboten, wenn Symbol, MIC und Währung eindeutig vorliegen.</div>;
  }
  if (state.status !== "success") {
    return <div role="status" aria-live="polite" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100 sm:col-span-2 xl:col-span-4">{state.message}</div>;
  }

  const observedAt = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(state.observedAt));
  const statusLabel = state.dataStatus === "delayed"
    ? "verzögert"
    : state.dataStatus === "end_of_day"
      ? "Schlusskurs"
      : "veraltet";

  return <div role="status" aria-live="polite" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 sm:col-span-2 xl:col-span-4">
    <div className="font-medium text-emerald-100">{state.name ?? state.symbol}</div>
    <div className="mt-1 text-xs text-emerald-50/80">
      {state.symbol} · {state.exchange ?? "Börse nicht benannt"} ({state.micCode}) · {state.price.toLocaleString("de-DE", { maximumFractionDigits: 6 })} {state.currency} · {statusLabel} · {state.isMarketOpen ? "Markt laut Anbieter offen" : "Markt laut Anbieter geschlossen"} · {observedAt}
    </div>
    <div className="mt-1 text-[11px] text-emerald-50/60">Quelle: Twelve Data. Ein gültiger IBKR-Kurs überschreibt diese Rückfallquelle später automatisch.</div>
  </div>;
}
