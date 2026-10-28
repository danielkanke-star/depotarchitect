"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { RiskIndicator, formatMoney, formatRatio } from "@/components/risk-indicator";
import { calculateSizing, budgetTone, depotRiskBudget } from "@/lib/risk-rules";
import { lookupPositionMarketData, type MarketDataLookupState } from "@/app/(dashboard)/depot/actions";

type Props = { initialNetLiquidity: number | null; initialRiskPct: number; initialMargin?: number | null; maxMargin?: number;
  existingRisk?: number | null; riskComplete?: boolean; riskIssues?: { id: string; ticker: string; message: string }[]; profile?: string; baseCurrency?: string; demo?: boolean };
type Override = { key: string; value: number } | null;
const listingKey = (value: { symbol: string; micCode: string; currency: string }) => `${value.symbol}@${value.micCode}:${value.currency}`;

export function RiskCalculator({ initialNetLiquidity, initialRiskPct, existingRisk = null, riskComplete = false,
  riskIssues = [], profile = "Aggressiv 1,0", baseCurrency = "EUR", demo = false }: Props) {
  const [ticker, setTicker] = useState(demo ? "AMZN" : "");
  const [loaded, setLoaded] = useState<{ term: string; state: MarketDataLookupState } | null>(null);
  const [pending, startTransition] = useTransition();
  const request = useRef(0);
  const term = ticker.trim().toUpperCase();
  const lookup = loaded?.term === term ? loaded.state : null;
  const market = lookup?.status === "success" ? lookup : null;
  const [riskPct, setRiskPct] = useState(initialRiskPct);
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [entryOverride, setEntryOverride] = useState<Override>(null);
  const [stopOverride, setStopOverride] = useState<Override>(null);
  const [stepOverride, setStepOverride] = useState<Override>(null);
  const [multiplierOverride, setMultiplierOverride] = useState<Override>(null);
  const [fxOverride, setFxOverride] = useState<Override>(null);
  const currency = market?.currency ?? (demo ? "USD" : baseCurrency);
  const instrumentKey = market ? listingKey(market) : `${demo ? "demo" : "unresolved"}:${term}`;
  const quote = market?.price ?? (demo ? 102.5 : null);
  const entry = entryOverride?.key === instrumentKey ? entryOverride.value : quote;
  const stopKey = `${instrumentKey}:${direction}`;
  const stop = stopOverride?.key === stopKey ? stopOverride.value : entry === null ? null : Number((entry * (direction === "long" ? 0.9 : 1.1)).toFixed(8));
  const step = stepOverride?.key === instrumentKey ? stepOverride.value : market?.quantityStep ?? 1;
  const multiplier = multiplierOverride?.key === instrumentKey ? multiplierOverride.value : market?.contractMultiplier ?? 1;
  const fxKey = `${instrumentKey}:${market?.fxAsOf ?? "manual"}`;
  const fx = currency === baseCurrency ? 1 : fxOverride?.key === fxKey ? fxOverride.value : market?.fxToBase ?? (demo ? 0.9 : null);

  const load = useCallback((query: string, selection = "", previous: MarketDataLookupState = { status: "idle" }) => {
    const id = ++request.current;
    startTransition(async () => {
      const form = new FormData();
      form.set("ticker", query);
      if (selection) form.set("market_listing_selection", selection);
      let state: MarketDataLookupState;
      try { state = await lookupPositionMarketData(previous, form); }
      catch { state = { status: "error", message: "Kursabruf fehlgeschlagen. Bitte Verbindung prüfen und erneut laden." }; }
      if (id === request.current) setLoaded({ term: query, state });
    });
  }, []);

  useEffect(() => {
    if (demo || !term) return;
    // Wait until typing pauses; never request every individual keystroke.
    const timer = window.setTimeout(() => load(term), 900);
    return () => window.clearTimeout(timer);
  }, [term, demo, load]);

  const budget = depotRiskBudget(initialNetLiquidity, profile);
  const result = calculateSizing({ netLiquidity: initialNetLiquidity, existingRisk, riskComplete, riskPct,
    entry: entry ?? NaN, stop: stop ?? NaN, fxToBase: fx, step, multiplier, direction, budget });
  const computed = (market || demo) && result.error === null ? result : null;
  const issue = !term ? "Gib einen Ticker ein. Kurs und Währungsumrechnung werden automatisch geladen."
    : !market && !demo ? pending || !lookup ? "Kurs und Wechselkurs werden geladen …" : lookup.status !== "success" ? lookup.message : null
    : fx === null ? "Für diese Währung ist gerade kein Wechselkurs erreichbar. Erneut laden oder unter Details einen Referenzkurs angeben."
    : initialNetLiquidity === null ? "Bitte zuerst deine Nettoliquidität in den Einstellungen hinterlegen."
    : result.error;

  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <Fact label="Nettoliquidität" value={formatMoney(initialNetLiquidity, baseCurrency)} />
      <Fact label="Bestehendes Stopprisiko" value={riskComplete ? formatMoney(existingRisk, baseCurrency) : "Unvollständig"} />
      <Fact label="Berechnungsbasis nach Stopprisiko" value={initialNetLiquidity !== null && existingRisk !== null && riskComplete ? formatMoney(initialNetLiquidity - existingRisk, baseCurrency) : "Nicht berechenbar"} />
    </div>
    {!riskComplete && riskIssues.length > 0 && <div role="status" className="rounded-xl border border-amber-500/40 p-4 text-sm">
      <p className="font-medium text-amber-200">Diese Angaben fehlen für die Stückzahlberechnung</p>
      <p className="mt-2 text-muted">Die Berechnungsbasis zieht das gesamte bestehende Stopprisiko ab. Bitte vervollständige dafür diese Positionen:</p>
      <ul className="mt-3 space-y-2">{riskIssues.map(position => <li key={position.id} className="flex flex-wrap items-center justify-between gap-2">
        <span>{position.ticker} · {position.message}</span><Link className="text-accent underline underline-offset-4" href={`/depot?edit=${encodeURIComponent(position.id)}`}>{position.ticker} bearbeiten</Link>
      </li>)}</ul>
    </div>}
    <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
      <Card><h2 className="mb-4 font-medium">Einstieg planen</h2>
        <form onSubmit={event => { event.preventDefault(); if (!demo && term) load(term); }} className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <label>Ticker oder Unternehmen<input name="ticker" value={ticker} onChange={event => { request.current++; setTicker(event.target.value); }} autoComplete="off" spellCheck={false} maxLength={80} required placeholder="Zum Beispiel AMZN" /></label>
          <button disabled={pending || demo || !term} className="self-end rounded-xl border border-accent/50 px-4 py-2.5 text-accent disabled:opacity-50">{pending ? "Lädt …" : "Aktualisieren"}</button>
        </form>
        {lookup && lookup.status !== "success" && <p role="status" className="mb-4 text-sm text-amber-300">{lookup.message}</p>}
        {(market || demo) && <div role="status" aria-live="polite" className="mb-4 rounded-xl border border-accent/30 bg-accent/5 p-3">
          <div className="text-sm text-muted">{market?.name ?? ticker} · {market?.exchange ?? "Beispiel"} · {currency}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(quote, currency)}</div>
          <p className="mt-1 text-xs text-muted">{market ? `${market.dataStatus === "stale" ? "Älterer Kurs" : market.dataStatus === "live" ? "Echtzeitversorgung" : market.dataStatus === "manually_updated" ? "Depotbewertung · kein bestätigter Echtzeitkurs" : market.dataStatus === "end_of_day" ? "Schlusskurs" : "Verzögerter Kurs"} · ${market.sourceName?.startsWith("IBKR") ? "Abgerufen " : ""}${new Date(market.observedAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} · ${market.sourceName ?? "Twelve Data"}` : "Fiktiver Beispielkurs"}</p>
          {currency !== baseCurrency && <p className="mt-2 text-xs text-muted">{fx !== null ? `Automatische Umrechnung: 1 ${currency} = ${fx.toLocaleString("de-DE", { maximumFractionDigits: 6 })} ${baseCurrency}` : "Wechselkurs wird nicht geliefert."}{market?.fxSource ? ` · ${market.fxSource}` : ""}{market?.fxAsOf ? ` · Stand ${new Date(market.fxAsOf).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}` : ""}</p>}
          {market?.fxStale && <p className="mt-2 text-xs text-amber-300">Der Wechselkurs ist älter. Die Berechnung verwendet den angezeigten Referenzstand.</p>}
        </div>}
        {market && market.candidates.length > 1 && <label className="mb-4 block">Handelsplatz<select value={listingKey(market)} disabled={pending} onChange={event => load(term, event.target.value, market)}>
          {market.candidates.map(c => <option key={listingKey(c)} value={listingKey(c)}>{c.symbol} · {c.exchange ?? c.micCode} · {c.currency}</option>)}
        </select><span className="text-xs text-muted">Handelsplatz und Handelswährung gehören zusammen.</span></label>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Numeric label="Risiko je Trade (%)" value={riskPct} set={setRiskPct} />
          <label>Richtung<select value={direction} onChange={e => setDirection(e.target.value as "long" | "short")}><option value="long">Long</option><option value="short">Short</option></select></label>
          <Numeric label={`Geplanter Einstiegskurs · ${currency}`} value={entry} set={value => setEntryOverride({ key: instrumentKey, value })} />
          <Numeric label={`Trading-Stopp · ${currency}`} value={stop} set={value => setStopOverride({ key: stopKey, value })} />
          <button type="button" disabled={quote === null} onClick={() => setEntryOverride(null)} className="rounded-xl border border-border p-2 text-sm disabled:opacity-40">Aktuellen Kurs übernehmen</button>
          <button type="button" disabled={entry === null} onClick={() => setStopOverride(null)} className="rounded-xl border border-border p-2 text-sm disabled:opacity-40">Stopp 10 % {direction === "long" ? "unter" : "über"} Einstieg</button>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted">Der aktuelle Kurs wird beim ersten Laden als Einstieg übernommen. Du kannst einen eigenen Orderkurs und Stopp eintragen. Die Planung führt keine Order aus.</p>
        <details className="mt-4 border-t border-border pt-3"><summary className="cursor-pointer text-sm text-muted">Stückelung und Umrechnung anpassen</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Numeric label="Zulässige Stückelung" value={step} set={value => setStepOverride({ key: instrumentKey, value })} />
          <Numeric label="Multiplikator" value={multiplier} set={value => setMultiplierOverride({ key: instrumentKey, value })} />
          {currency !== baseCurrency && <Numeric label={`Referenzkurs · 1 ${currency} in ${baseCurrency}`} value={fx} set={value => setFxOverride({ key: fxKey, value })} />}
        </div><p className="mt-2 text-xs text-muted">Die erlaubte Stückelung hängt von deinem Handelszugang ab. Für Bruchstücke zum Beispiel 0,001 angeben.</p></details>
      </Card>
      <Card><h2 className="mb-4 font-medium">Geplante Position</h2>
        {issue && <p role="status" className="mb-4 rounded-xl border border-amber-500/40 p-3 text-sm text-amber-200">{issue}{riskIssues.length === 0 && result.error === "Das bestehende Stopprisiko ist unvollständig." && " Bitte fehlende Kurse, Wechselkurse oder Stopps im Depot ergänzen."}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Fact label="Vorgesehener Risikobetrag" value={formatMoney(computed?.plannedRisk, baseCurrency)} />
          <Fact label="Stückzahl" value={computed ? computed.quantity.toLocaleString("de-DE", { maximumFractionDigits: 6 }) : "—"} />
          <Fact label={`Positionswert ${currency}`} value={formatMoney(computed?.nativeValue, currency)} />
          <Fact label={`Positionswert ${baseCurrency}`} value={formatMoney(computed?.baseValue, baseCurrency)} />
          <Fact label="Anteil an NetLiq" value={formatRatio(computed?.netLiqShare)} />
          <Fact label="Tatsächliches Risiko nach Abrundung" value={formatMoney(computed?.actualRisk, baseCurrency)} />
        </div>
        <div className="mt-4"><RiskIndicator tone={budgetTone(computed?.utilizationAfter ?? null)}>Budgetauslastung nach Trade: {formatRatio(computed?.utilizationAfter)}</RiskIndicator></div>
        {computed && computed.quantity === 0 && <p className="mt-3 text-sm text-amber-300">Innerhalb dieses Risikobetrags ist mit der gewählten Stückelung keine positive Menge möglich.</p>}
        {computed?.utilizationAfter != null && computed.utilizationAfter >= 1 && <p className="mt-3 text-sm text-amber-300">Das persönliche Depotrisikobudget wäre ausgeschöpft oder überschritten. Die Stückzahl wurde deshalb nicht automatisch gekappt.</p>}
        <details className="mt-5 border-t border-border pt-3"><summary className="cursor-pointer text-sm text-muted">Ergänzende Zielkurse</summary><div className="mt-3 space-y-2">{computed?.targets.map((target, i) => <div key={i} className="flex justify-between text-sm"><span>CRV {i + 1}:1</span><span>{target >= 0 ? formatMoney(target, currency) : "Kein positiver Zielkurs"}</span></div>)}</div></details>
        <p className="mt-5 text-xs leading-5 text-muted">Berechnungsbasis = NetLiq − bestehendes Stopprisiko. Davon wird dein Risiko je Trade angesetzt. Stopprisiko ist ein Szenario mit Ausführung zum Stoppkurs, keine garantierte Verlustobergrenze.</p>
      </Card>
    </div>
  </div>;
}
function Numeric({ label, value, set }: { label: string; value: number | null; set: (value: number) => void }) {
  return <label>{label}<input type="number" step="any" value={value === null || !Number.isFinite(value) ? "" : value} onChange={e => set(e.target.value === "" ? NaN : Number(e.target.value))} /></label>;
}
function Fact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border/70 bg-background/40 p-3"><div className="text-xs text-muted">{label}</div><div className="mt-1 text-xl font-semibold tabular-nums">{value}</div></div>;
}
