"use client";
import { useActionState, useState } from "react";
import { Card } from "@/components/ui";
import { RiskIndicator, formatMoney, formatRatio } from "@/components/risk-indicator";
import { calculateSizing, budgetTone, depotRiskBudget } from "@/lib/risk-rules";
import { lookupPositionMarketData, type MarketDataLookupState } from "@/app/(dashboard)/depot/actions";

type Props = { initialNetLiquidity: number | null; initialRiskPct: number; initialMargin?: number | null; maxMargin?: number;
  existingRisk?: number | null; riskComplete?: boolean; profile?: string; baseCurrency?: string; demo?: boolean };
export function RiskCalculator({ initialNetLiquidity, initialRiskPct, existingRisk = null, riskComplete = false,
  profile = "Aggressiv 1,0", baseCurrency = "EUR", demo = false }: Props) {
  const [lookup, lookupAction, pending] = useActionState(lookupPositionMarketData, { status: "idle" } as MarketDataLookupState);
  const [riskPct, setRiskPct] = useState(initialRiskPct);
  const [entry, setEntry] = useState(100), [stop, setStop] = useState(90);
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [stepOverride, setStepOverride] = useState<{key:string;value:number}|null>(null), [multiplierOverride,setMultiplierOverride] = useState<{key:string;value:number}|null>(null);
  const [manualCurrency, setCurrency] = useState("USD");
  const [fxOverride, setFxOverride] = useState<{ key: string; value: number } | null>(null);
  const currency = lookup.status === "success" ? lookup.currency : manualCurrency;
  const instrumentKey = lookup.status === "success" ? `${lookup.symbol}@${lookup.micCode}:${currency}` : `manual:${currency}`;
  const step = stepOverride?.key === instrumentKey ? stepOverride.value : lookup.status === "success" ? lookup.quantityStep ?? 1 : 1;
  const multiplier = multiplierOverride?.key === instrumentKey ? multiplierOverride.value : lookup.status === "success" ? lookup.contractMultiplier ?? 1 : 1;
  const setStep = (value:number)=>setStepOverride({key:instrumentKey,value}), setMultiplier=(value:number)=>setMultiplierOverride({key:instrumentKey,value});
  const fxKey = `${currency}:${lookup.status === "success" ? lookup.observedAt : "manual"}`;
  const setFx = (value: number) => setFxOverride({ key: fxKey, value });
  const fx = currency === baseCurrency ? 1 : fxOverride?.key === fxKey ? fxOverride.value : lookup.status === "success" ? lookup.fxToBase ?? null : demo && currency === "USD" ? 0.9 : null;
  const quote = lookup.status === "success" ? lookup.price : demo ? 102.5 : null;
  const budget = depotRiskBudget(initialNetLiquidity, profile);
  const result = calculateSizing({ netLiquidity: initialNetLiquidity, existingRisk, riskComplete, riskPct, entry, stop, fxToBase: fx, step, multiplier, direction, budget });
  const computed = result.error === null ? result : null;
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <Fact label="Nettoliquidität" value={formatMoney(initialNetLiquidity, baseCurrency)} />
      <Fact label="Bestehendes Stopprisiko" value={riskComplete ? formatMoney(existingRisk, baseCurrency) : "Unvollständig"} />
      <Fact label="Berechnungsbasis nach Stopprisiko" value={initialNetLiquidity !== null && existingRisk !== null && riskComplete ? formatMoney(initialNetLiquidity - existingRisk, baseCurrency) : "Nicht berechenbar"} />
    </div>
    <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
      <Card><h2 className="mb-4 font-medium">Einstieg planen</h2>
        <form action={demo ? undefined : lookupAction} onSubmit={demo ? event => event.preventDefault() : undefined} className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto]">
          <label>Ticker oder Unternehmen<input name="ticker" defaultValue={demo ? "AMZN" : ""} required placeholder="Zum Beispiel AMZN" /></label>
          <button disabled={pending || demo} className="self-end rounded-xl border border-accent/50 px-4 py-2.5 text-accent disabled:opacity-50">{pending ? "Suche …" : "Notierung & Kurs laden"}</button>
          {lookup.status === "success" && lookup.candidates.length > 1 && <label className="sm:col-span-2">Notierung<select name="market_listing_selection" defaultValue={`${lookup.symbol}@${lookup.micCode}:${lookup.currency}`}>
            {lookup.candidates.map(c => <option key={`${c.symbol}@${c.micCode}:${c.currency}`} value={`${c.symbol}@${c.micCode}:${c.currency}`}>{c.symbol} · {c.exchange ?? c.micCode} · {c.currency}</option>)}
          </select><span className="text-xs text-muted">Alternative auswählen und erneut laden.</span></label>}
        </form>
        {lookup.status !== "idle" && lookup.status !== "success" && <p role="status" className="mb-4 text-sm text-amber-300">{lookup.message}</p>}
        {lookup.status === "success" && <p className="mb-4 text-sm text-muted">{lookup.name ?? lookup.symbol} · {lookup.exchange} ({lookup.micCode}) · {currency} · Twelve Data · {lookup.dataStatus === "stale" ? "veraltet" : "verzögert / Schlusskurs"}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label>Handelswährung<input value={currency} readOnly={lookup.status === "success"} maxLength={3} onChange={e => { setCurrency(e.target.value.toUpperCase()); setFxOverride(null); }} /></label>
          <label>Richtung<select value={direction} onChange={e => setDirection(e.target.value as "long" | "short")}><option value="long">Long</option><option value="short">Short</option></select></label>
          <Numeric label="Risiko je Trade (%)" value={riskPct} set={setRiskPct} />
          <Numeric label={`FX · 1 ${currency} in ${baseCurrency}`} value={fx} set={setFx} />
          <Numeric label={`Geplanter Kauf-/Einstiegskurs · ${currency}`} value={entry} set={setEntry} />
          <Numeric label={`Trading-Stopp · ${currency}`} value={stop} set={setStop} />
          <button type="button" disabled={quote === null} onClick={() => { if (quote !== null) setEntry(quote); }} className="rounded-xl border border-border p-2 text-sm disabled:opacity-40">Aktuellen Kurs übernehmen {quote === null ? "" : `(${quote} ${currency})`}</button>
          <button type="button" onClick={() => setStop(Number((entry * (direction === "long" ? 0.9 : 1.1)).toFixed(8)))} className="rounded-xl border border-border p-2 text-sm">Stopp 10 % {direction === "long" ? "unter" : "über"} Einstieg</button>
          <Numeric label="Zulässige Stückelung" value={step} set={setStep} />
          <Numeric label="Multiplikator" value={multiplier} set={setMultiplier} />
        </div>
        <p className="mt-4 text-xs leading-5 text-muted">Stückelung gemäß deinem Handelszugang prüfen. Die Stückzahl wird abgerundet. Die Planung führt keine Order aus. Ein fehlender aktueller FX muss ergänzt werden.</p>
        {lookup.status === "success" && lookup.fxStale && <p className="mt-2 text-xs text-amber-300">Der automatische FX fehlt oder ist älter als eine Stunde. Den Referenzkurs bitte prüfen.</p>}
      </Card>
      <Card><h2 className="mb-4 font-medium">Geplante Position</h2>
        {result.error && <p role="status" className="mb-4 rounded-xl border border-amber-500/40 p-3 text-sm text-amber-200">{result.error}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Fact label="Vorgesehener Risikobetrag" value={formatMoney(computed?.plannedRisk, baseCurrency)} />
          <Fact label="Stückzahl" value={computed ? computed.quantity.toLocaleString("de-DE", { maximumFractionDigits: 6 }) : "—"} />
          <Fact label={`Positionswert ${currency}`} value={formatMoney(computed?.nativeValue, /^[A-Z]{3}$/.test(currency) ? currency : "USD")} />
          <Fact label={`Positionswert ${baseCurrency}`} value={formatMoney(computed?.baseValue, baseCurrency)} />
          <Fact label="Anteil an NetLiq" value={formatRatio(computed?.netLiqShare)} />
          <Fact label="Tatsächliches Risiko nach Abrundung" value={formatMoney(computed?.actualRisk, baseCurrency)} />
        </div>
        <div className="mt-4"><RiskIndicator tone={budgetTone(computed?.utilizationAfter ?? null)}>Budgetauslastung nach Trade: {formatRatio(computed?.utilizationAfter)}</RiskIndicator></div>
        {computed && computed.quantity === 0 && <p className="mt-3 text-sm text-amber-300">Innerhalb dieses Risikobetrags ist mit der gewählten Stückelung keine positive Menge möglich.</p>}
        {computed?.utilizationAfter != null && computed.utilizationAfter >= 1 && <p className="mt-3 text-sm text-amber-300">Das persönliche Depotrisikobudget wäre ausgeschöpft oder überschritten. Die Stückzahl wurde deshalb nicht automatisch gekappt.</p>}
        <details className="mt-5 border-t border-border pt-3"><summary className="cursor-pointer text-sm text-muted">Ergänzende Zielkurse</summary><div className="mt-3 space-y-2">{computed?.targets.map((target, i) => <div key={i} className="flex justify-between text-sm"><span>CRV {i + 1}:1</span><span>{target >= 0 ? formatMoney(target, /^[A-Z]{3}$/.test(currency) ? currency : "USD") : "Kein positiver Zielkurs"}</span></div>)}</div></details>
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
