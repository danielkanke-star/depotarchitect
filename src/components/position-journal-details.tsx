import type { Position, PositionSale } from "@/lib/database.types";
import type { PositionCalculation } from "@/lib/calculations/calculation-types";
import { positionSales, realizedForPosition } from "@/lib/journal";
import { SaleForm } from "./sale-form";
import { SaleCorrectionForm } from "./sale-correction-form";
import Decimal from "decimal.js";
import { formatMoney, formatRatio, RiskIndicator } from "./risk-indicator";
import { berlinDate, calendarDays, positionRiskTone, stopAge } from "@/lib/risk-rules";

export function PositionJournalDetails({ position: p, result, sales, baseCurrency, profile, available }: {
  position: Position; result?: PositionCalculation; sales: PositionSale[]; baseCurrency: string; profile: string; available: boolean;
}) {
  const own = positionSales(p, sales), realized = realizedForPosition(p, sales), age = stopAge(p.stop_updated_at);
  const currency = p.instrument_currency ?? baseCurrency;
  const remaining = Math.max(0, Number(p.quantity) - Number(p.sold_quantity));
  const nativePnl = result?.positionValueInstrument.value != null ? new Decimal(result.positionValueInstrument.value).minus(new Decimal(p.entry_price).mul(remaining).mul(p.multiplier)).mul(p.direction.startsWith("short") ? -1 : 1).toNumber() : null;
  const days = calendarDays(p.entry_date, p.status === "closed" ? p.sale_date ?? berlinDate() : berlinDate());
  return <details className="py-2"><summary className="cursor-pointer text-xs text-muted hover:text-foreground">{p.ticker} · Details und Verkaufsjournal</summary>
    <div className="my-3 rounded-xl border border-border bg-background/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 text-sm">
        <Fact label="Einstieg" value={`${p.entry_date ?? "Unbekannt"} · ${p.direction}`} />
        <Fact label="NetLiq-Anteil" value={formatRatio(result?.netLiquidityShare.value)} />
        <Fact label="Unrealisierter Kurs-G&V" value={p.status === "closed" ? "Abgeschlossen" : formatMoney(result?.unrealizedPnl.value, baseCurrency)} />
        <Fact label={`Unrealisierter Kurs-G&V ${currency}`} value={p.status === "closed" ? "Abgeschlossen" : formatMoney(nativePnl, currency)} />
        <Fact label={`Realisierter Kurs-G&V ${currency}`} value={realized.hasSales ? formatMoney(realized.native, currency) : "Noch kein Verkauf"} />
        <Fact label="Realisierter Kurs-G&V" value={realized.hasSales ? formatMoney(realized.base, baseCurrency) : "Noch kein Verkauf"} />
        <Fact label={`Stopprisiko ${currency}`} value={formatMoney(result?.stopRiskInstrument.value, currency)} />
        <div><div className="text-xs text-muted">Risiko / NetLiq</div><div className="mt-1"><RiskIndicator tone={positionRiskTone(result?.riskToNetLiquidity.value ?? null, profile)}>{formatRatio(result?.riskToNetLiquidity.value)}</RiskIndicator></div></div>
        <Fact label="Anteil am berechenbaren Gesamtrisiko" value={formatRatio(result?.riskShareOfCalculableTotal.value)} />
        <div><div className="text-xs text-muted">Letzte Stoppänderung</div><div className="mt-1"><RiskIndicator tone={age.tone}>{age.label}</RiskIndicator></div></div>
        <Fact label="Einstiegsmargin · historische Referenz" value={formatMoney(p.entry_margin_base, baseCurrency)} />
        <Fact label="Marginquelle aktuell" value={p.margin_source === "estimated" ? "Geschätzt aus Marginquote" : p.margin_source} />
        <Fact label="Haltedauer" value={days === null ? "Unbekannt" : `${days} Kalendertage`} />
        <Fact label="Stückelung / Multiplikator" value={`${p.quantity_step ?? 1} / ${p.multiplier}`} />
      </div>
      {p.notes && <p className="mt-4 whitespace-pre-wrap rounded-lg border border-border p-3 text-sm">{p.notes}</p>}
      {p.tradingview_url && /^https:\/\/([a-z0-9-]+\.)?tradingview\.com\//.test(p.tradingview_url) && <a className="mt-3 inline-block text-sm text-accent" href={p.tradingview_url} target="_blank" rel="noopener noreferrer">TradingView öffnen ↗</a>}
      {own.length > 0 && <div className="mt-5 overflow-x-auto"><h3 className="mb-3 text-sm font-medium">Verkäufe · historische Ausführungsdaten</h3><table className="w-full min-w-[600px] text-xs"><thead className="text-left text-muted"><tr><th>Datum</th><th>Menge</th><th>Kurs</th><th>FX zur Basiswährung</th><th>Herkunft</th></tr></thead><tbody>{own.map(s => <tr key={s.id} className="border-t border-border"><td className="py-2">{s.sale_date}</td><td>{s.quantity}</td><td>{formatMoney(Number(s.price), currency)}</td><td>{s.fx_to_base ?? "Fehlt · keine Euro-Auswertung"}</td><td>{s.source === "legacy_aggregate" ? "Alte Sammelreferenz" : s.source === "manual" ? "Manuell" : s.source}</td></tr>)}</tbody></table></div>}
      {remaining > 0 && available && <div className="mt-5 border-t border-border pt-4"><h3 className="mb-3 font-medium">{p.status === "closed" ? "Fehlende Verkaufsangaben der alten Position ergänzen" : "Teil- oder Schlussverkauf erfassen"}</h3><SaleForm id={p.id} remaining={remaining} currency={currency} baseCurrency={baseCurrency} entryDate={p.entry_date} requestId={crypto.randomUUID()} /></div>}
      {available && own.filter(s => !s.id.startsWith("legacy:")).map(s => <SaleCorrectionForm key={`${s.id}:${s.quantity}:${s.price}:${s.sale_date}:${s.fx_to_base}`} sale={s} entryDate={p.entry_date} currency={currency} baseCurrency={baseCurrency} />)}
      {!available && <p className="mt-4 text-xs text-amber-300">Verkaufsjournal benötigt die neue Datenbankmigration.</p>}
    </div>
  </details>;
}
function Fact({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted">{label}</div><div className="mt-1 tabular-nums">{value}</div></div>; }
