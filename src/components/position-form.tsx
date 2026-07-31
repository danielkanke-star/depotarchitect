"use client";

import { useActionState, useState } from "react";
import {
  lookupPositionMarketData,
  savePosition,
  type MarketDataLookupState,
} from "@/app/(dashboard)/depot/actions";
import type {
  PortfolioAccountType,
  PortfolioCategory,
  Position,
  PositionMarketDataMapping,
} from "@/lib/database.types";
import { isMarginAccount } from "@/lib/portfolio-entry";

type EditablePosition = Pick<Position,
  "id" | "ticker" | "category_id" | "instrument_type" | "direction" | "quantity"
  | "instrument_currency" | "entry_price" | "entry_date" | "stop_price_native"
  | "stop_price" | "status" | "notes" | "sold_quantity" | "sale_price" | "sale_date"
  | "margin_rate" | "margin_requirement" | "margin_source"
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
  const initiallyPartial = !initiallyClosed && Number(position?.sold_quantity ?? 0) > 0;
  const [positionStatus, setPositionStatus] = useState<"open" | "closed">(initiallyClosed ? "closed" : "open");
  const [partialSale, setPartialSale] = useState(initiallyPartial);
  const [lookupState, lookupAction, lookupPending] = useActionState(
    lookupPositionMarketData,
    INITIAL_LOOKUP_STATE,
  );
  const marginApplicable = isMarginAccount(accountType);
  const directMargin = position?.margin_source === "manual_direct" || position?.margin_source === "broker";
  const showSale = positionStatus === "closed" || partialSale;

  return (
    <form action={savePosition} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <input type="hidden" name="id" value={position?.id ?? ""} />
      <label>Ticker<input name="ticker" required maxLength={40} defaultValue={position?.ticker ?? ""} /></label>
      <label>Kategorie<select name="category_id" defaultValue={position?.category_id ?? ""}><option value="">Keine</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label>Positionstyp<select name="instrument_type" defaultValue={position?.instrument_type ?? "stock"}><option value="stock">Aktie</option><option value="etf">ETF</option><option value="option">Option</option><option value="warrant">Optionsschein</option><option value="knock_out">Knock-out</option><option value="other">Sonstiges</option></select></label>
      <label>Richtung<select name="direction" defaultValue={position?.direction === "short" ? "short" : "long"}><option value="long">Long</option><option value="short">Short</option></select></label>
      <label>Status<select name="position_status" value={positionStatus} onChange={(event) => {
        const nextStatus = event.target.value as "open" | "closed";
        setPositionStatus(nextStatus);
        if (nextStatus === "closed") setPartialSale(false);
      }}><option value="open">Offen</option><option value="closed">Geschlossen</option></select></label>
      <label>Menge<input name="quantity" required inputMode="decimal" defaultValue={position?.quantity ?? 1} /></label>
      <label>Instrumentwährung<input name="instrument_currency" required maxLength={3} defaultValue={position?.instrument_currency ?? baseCurrency} /></label>
      <label>Einstandskurs<input name="entry_price" required inputMode="decimal" defaultValue={position?.entry_price ?? ""} /></label>
      <label>Aktueller Kurs<input key={lookupState.status === "success" ? `${lookupState.symbol}-${lookupState.micCode}-${lookupState.observedAt}` : "initial"} name="current_price" required inputMode="decimal" defaultValue={lookupState.status === "success" ? lookupState.price : currentPrice ?? ""} /><span className="mt-1 block text-[11px] text-muted">{currentPriceSource ? `Aktive Quelle: ${currentPriceSource}.` : "Notwendiger Rückfallkurs."} Twelve Data wird automatisch versucht. Ein späterer gültiger IBKR-Kurs hat automatisch Vorrang.</span></label>
      <input type="hidden" name="original_current_price" value={currentPrice ?? ""} />
      <label>Börsenplatz · optional<input name="market_data_mic" maxLength={4} autoCapitalize="characters" placeholder="z. B. XETR" defaultValue={marketDataMapping?.mic_code ?? ""} /><span className="mt-1 block text-[11px] text-muted">Leer lassen für die automatisch gewählte Hauptnotierung. {marketDataMapping?.exchange ? `Aktuell: ${marketDataMapping.exchange}.` : "Ein MIC dient nur zur gezielten Korrektur."}</span></label>
      <div className="flex items-end">
        <button formAction={lookupAction} formNoValidate disabled={lookupPending} className="w-full rounded-xl border border-accent/50 px-4 py-2.5 text-sm text-accent disabled:opacity-60">
          {lookupPending ? "Kurs wird gesucht …" : "Unternehmen & Kurs suchen"}
        </button>
      </div>
      <MarketDataLookupResult state={lookupState} />
      <label>Einstiegsdatum<input type="date" name="entry_date" defaultValue={position?.entry_date ?? ""} /></label>
      <label>Trading-Stopp<input name="stop_price" inputMode="decimal" defaultValue={position?.stop_price_native ?? position?.stop_price ?? ""} /></label>

      {positionStatus === "open" && <label className="flex items-end gap-2 rounded-xl border border-border/70 px-3 py-2.5 text-sm"><input className="h-4 w-4" type="checkbox" checked={partialSale} onChange={(event) => setPartialSale(event.target.checked)} />Teilverkauf erfassen</label>}
      {showSale && <>
        <label>Verkaufte Menge<input name="sold_quantity" required inputMode="decimal" defaultValue={positionStatus === "closed" ? position?.quantity ?? "" : position?.sold_quantity ?? ""} /></label>
        <label>Verkaufskurs<input name="sale_price" required inputMode="decimal" defaultValue={position?.sale_price ?? ""} /></label>
        <label>Verkaufsdatum<input type="date" name="sale_date" required defaultValue={position?.sale_date ?? ""} /></label>
      </>}

      {marginApplicable ? <>
        <label>Marginangabe<select name="margin_input_type" defaultValue={directMargin ? "amount" : "rate"}><option value="rate">Marginquote in Prozent</option><option value="amount">Marginbetrag</option></select></label>
        <label>Marginwert<input name="margin_value" inputMode="decimal" defaultValue={directMargin ? position?.margin_requirement ?? "" : position?.margin_rate == null ? "" : position.margin_rate * 100} /></label>
      </> : <div className="rounded-xl border border-border/70 bg-background/30 p-3 text-sm text-muted sm:col-span-2">Margin ist für dieses Kontomodell nicht zutreffend.</div>}

      <label className="sm:col-span-2 xl:col-span-4">Kommentar · optional<textarea name="notes" rows={3} maxLength={1000} defaultValue={position?.notes ?? ""} /></label>
      <div className="sm:col-span-2 xl:col-span-4"><button className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-[#062218]">Position speichern</button></div>
    </form>
  );
}

function MarketDataLookupResult({ state }: { state: MarketDataLookupState }) {
  if (state.status === "idle") {
    return <div className="rounded-xl border border-border/70 bg-background/30 p-3 text-xs text-muted sm:col-span-2 xl:col-span-4">Ticker und Handelswährung genügen. Die Hauptnotierung wird automatisch ermittelt; der gefundene Kurs wird in das Kursfeld übernommen.</div>;
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
      {state.symbol} · {state.exchange ?? "Börse nicht benannt"} ({state.micCode}) · {state.price.toLocaleString("de-DE", { maximumFractionDigits: 6 })} {state.currency} · {statusLabel} · {observedAt}
    </div>
    <div className="mt-1 text-[11px] text-emerald-50/60">Quelle: Twelve Data. Ein gültiger IBKR-Kurs überschreibt diese Rückfallquelle später automatisch.</div>
  </div>;
}
