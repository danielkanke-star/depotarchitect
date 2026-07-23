import Link from "next/link";
import { ArrowRight, CircleAlert, Database, Sigma } from "lucide-react";
import { Badge, Card, PageHeader } from "@/components/ui";
import { calculationExplanation } from "@/lib/calculations/calculation-provenance";
import { calculateCashPortfolio } from "@/lib/calculations/cash-calculations";
import { calculatePortfolio } from "@/lib/calculations/portfolio-calculations";
import { positionToCalculationInput } from "@/lib/calculations/position-adapter";
import type { CalculationMetric } from "@/lib/calculations/calculation-types";
import { pct } from "@/lib/format";
import { calculatePortfolioDataQuality, canonicalMarketDataStatus, latestUsableFxRate } from "@/lib/market-data";
import { getPortfolioData } from "@/lib/portfolio";

export default async function CockpitPage() {
  const { portfolio, settings, categories, positions, cashBalances, fxRates, latestImport } = await getPortfolioData();
  const riskBudget = portfolio.net_liquidity === null || Number(settings.risk_per_trade_pct) <= 0
    ? null
    : Number(portfolio.net_liquidity) * Number(settings.risk_per_trade_pct) / 100;
  const calculation = calculatePortfolio({
    netLiquidity: portfolio.net_liquidity,
    positions: positions.map((position) => positionToCalculationInput(position, portfolio, categories, fxRates, riskBudget)),
  });
  const cash = calculateCashPortfolio(cashBalances.map((balance) => ({
    id: balance.id,
    currency: balance.currency,
    baseCurrency: portfolio.currency,
    balanceNative: balance.balance_native,
    currentFxToBase: latestUsableFxRate(fxRates, balance.currency, portfolio.currency)?.rate ?? balance.current_fx_to_base,
    currentFxStatus: latestUsableFxRate(fxRates, balance.currency, portfolio.currency)?.status
      ?? canonicalMarketDataStatus(balance.fx_status, balance.source_type, balance.current_fx_to_base !== null),
  })));
  const dataQuality = calculatePortfolioDataQuality({ portfolio, positions, cashBalances, fxRates });
  const money = new Intl.NumberFormat("de-DE", { style: "currency", currency: portfolio.currency, maximumFractionDigits: 2 });
  const top = [...calculation.securityPositions].sort((a, b) => (b.positionValueBase.value ?? -1) - (a.positionValueBase.value ?? -1)).slice(0, 6);

  return <>
    <PageHeader eyebrow="Portfolio-Cockpit" title="DepotArchitect" description="Quelldaten und zentral berechnete Depotkennzahlen – mit sichtbarer Datenvollständigkeit statt erfundener Nullwerte." action={latestImport ? <div className="text-right"><Badge tone="good">Benutzerdefinierte CSV</Badge><div className="mt-1 text-xs text-muted">{formatImportDate(latestImport.imported_at)} · {latestImport.inserted_position_count} Teilpositionen</div><Link href="/import" className="text-xs text-accent">Importhistorie</Link></div> : <Badge>Beispieldaten</Badge>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SourceKpi label="Nettoliquidität" value={portfolio.net_liquidity === null ? "Daten fehlen" : money.format(Number(portfolio.net_liquidity))} note={portfolio.data_as_of ? `Quelldatum · ${formatImportDate(portfolio.data_as_of)}` : "Quelldatum · Zeitpunkt fehlt"} />
      <MetricKpi label="Brutto-Marktwert Wertpapiere" metric={calculation.grossExposure} format={(value) => money.format(value)} />
      <MetricKpi label="Long-Marktwert" metric={calculation.longExposure} format={(value) => money.format(value)} />
      <MetricKpi label="Short-Marktwert" metric={calculation.shortExposure} format={(value) => money.format(value)} />
      <MetricKpi label="Netto-Marktwert" metric={calculation.netExposure} format={(value) => money.format(value)} />
      <MetricKpi label="NetLiq-Hebel" metric={calculation.netLiquidityLeverage} format={(value) => `${value.toFixed(2).replace(".", ",")}×`} note="Derzeit marktwertbasiert; Optionen noch nicht delta- oder nominalwertbereinigt. Cash ist ausgeschlossen." />
      <MetricKpi label="Margin Requirement" metric={calculation.totalMarginRequirement} format={(value) => money.format(value)} note={`${calculation.missingMarginPositionCount} Teilpositionen ohne Marginwert`} />
      <MetricKpi label="Margin-Auslastung" metric={calculation.marginUtilization} format={(value) => pct(value * 100)} />
      <MetricKpi label="Berechenbares Stopprisiko" metric={calculation.totalCalculableStopRisk} format={(value) => money.format(value)} note={`${calculation.calculableRiskPositionCount} von ${calculation.activePositionRowCount} Teilpositionen berechenbar`} />
      <MetricKpi label="Risikoabdeckung nach Marktwert" metric={calculation.riskValueCoverage} format={(value) => pct(value * 100)} note={calculation.riskIsComplete ? "vollständig" : "unvollständig"} />
      <SourceKpi label="Aktive Teilpositionen" value={String(calculation.activePositionRowCount)} note="Positionszeilen" />
      <SourceKpi label="Unterschiedliche Instrumente" value={String(calculation.distinctInstrumentCount)} note="Ticker / Instrumente" />
      <MetricKpi label="Gesamtcash" metric={cash.totalCashBase} format={(value) => money.format(value)} note={`${cash.positiveBalanceCount} positive, ${cash.negativeBalanceCount} negative Salden · separat vom Wertpapiermarktwert`} />
    </div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[.9fr_1.6fr]">
      <Card><h2 className="mb-4 font-medium">Datenvollständigkeit</h2><div className="space-y-3">
        <Info icon={<CircleAlert size={17} />} title="Aktuelle Kurse" text={`${dataQuality.positionsWithRealPrice} von ${dataQuality.securityPositionCount} Teilpositionen mit realem Kurs; ${dataQuality.stalePriceCount} als veraltet und ${dataQuality.demoPriceCount} als Demo markiert.`} />
        <Info icon={<CircleAlert size={17} />} title="Trading-Stopps" text={calculation.riskIsComplete ? "Alle aktiven Teilpositionen besitzen einen gültigen, berechenbaren Stopp." : `${calculation.missingStopPositionCount} ohne Stopp, ${calculation.invalidStopPositionCount} mit widersprüchlichem Stopp. Die ausgewiesene Risikosumme ist deshalb unvollständig.`} />
        <Info icon={<Database size={17} />} title="Marginquellen" text={`${dataQuality.positionsWithReliableMargin} von ${dataQuality.securityPositionCount} Teilpositionen mit belastbarer Marginangabe; Legacy-untrusted bleibt ausgeschlossen.`} />
        <Info icon={<Database size={17} />} title="FX-Paare" text={`${dataQuality.completeFxPairCount} von ${dataQuality.requiredFxPairCount} benötigten Paaren vollständig. ${cash.fxIsComplete ? "Cash-FX berechenbar." : `${cash.missingFxCount} Cashsalden ohne realen FX-Kurs.`}`} />
        <Info icon={<Database size={17} />} title="Ältester Kursstand" text={dataQuality.oldestPriceAsOf ? formatImportDate(dataQuality.oldestPriceAsOf) : "Kein realer Kurszeitpunkt vorhanden."} />
        {calculation.legacyCashPositionCount > 0 && <Info icon={<CircleAlert size={17} />} title="Legacy-Cashpositionen" text={`${calculation.legacyCashPositionCount} alte Cash-Positionszeilen werden aus sämtlichen Wertpapieraggregaten ausgeschlossen und nicht zusätzlich zum neuen Cashmodell gezählt.`} />}
        <Info icon={<Sigma size={17} />} title="Saubere Kennzahlenabgrenzung" text="Risiko in % der NetLiq und Anteil am berechenbaren Gesamtrisiko werden berechnet. Eine Risikobudget-Auslastung wird in diesem Meilenstein bewusst nicht erfunden." />
      </div></Card>
      <Card><div className="mb-4 flex items-center justify-between"><h2 className="font-medium">Kompakte Depotübersicht</h2><Link href="/depot" className="flex items-center gap-1 text-xs text-accent">Alle Teilpositionen <ArrowRight size={14} /></Link></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="text-left text-xs text-muted"><tr><th className="pb-3">Ticker</th><th>Kategorie</th><th>Positionswert</th><th>NetLiq-Anteil</th><th>Stopprisiko</th><th>Datenstatus</th></tr></thead><tbody>{top.map((position) => <tr key={position.id} className="border-t border-border/60 align-top"><td className="py-3 font-medium">{position.ticker}</td><td className="text-muted">{position.categoryName ?? "Nicht zugeordnet"}</td><td><CompactMetric metric={position.positionValueBase} format={(value) => money.format(value)} /></td><td><CompactMetric metric={position.netLiquidityShare} format={(value) => pct(value * 100)} /></td><td><CompactMetric metric={position.stopRisk} format={(value) => money.format(value)} /></td><td><Badge tone={position.stopRisk.status === "calculated" ? "good" : "warn"}>{position.stopRisk.status === "calculated" ? "vollständig" : "unvollständig"}</Badge></td></tr>)}</tbody></table></div>
      </Card>
    </div>
    <Card className="mt-4"><div className="mb-4"><h2 className="font-medium">Kategorienaufteilung</h2><p className="mt-1 text-xs text-muted">Keine Grenzwerte oder Ampelfarben – ausschließlich rechnerische Struktur.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="text-left text-xs text-muted"><tr><th className="pb-3">Kategorie</th><th>Teilpositionen</th><th>Marktwert</th><th>Anteil NetLiq</th><th>Anteil Brutto-Exposure</th></tr></thead><tbody>{calculation.categories.map((category) => <tr key={category.categoryId ?? category.categoryName} className="border-t border-border/60"><td className="py-3 font-medium">{category.categoryName}</td><td>{category.positionRowCount}</td><td><CompactMetric metric={category.marketValue} format={(value) => money.format(value)} /></td><td><CompactMetric metric={category.netLiquidityShare} format={(value) => pct(value * 100)} /></td><td><CompactMetric metric={category.grossExposureShare} format={(value) => pct(value * 100)} /></td></tr>)}</tbody></table></div></Card>
  </>;
}

function SourceKpi({ label, value, note }: { label: string; value: string; note: string }) {
  return <Card><div className="flex items-center justify-between text-xs text-muted"><span>{label}</span><span className="text-[10px] uppercase tracking-wide">Quelldatum</span></div><div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div><div className="mt-2 text-[11px] text-muted/80">{note}</div></Card>;
}

function MetricKpi({ label, metric, format, note }: { label: string; metric: CalculationMetric; format: (value: number) => string; note?: string }) {
  return <Card><div className="flex items-center justify-between text-xs text-muted"><span>{label}</span><span className="text-[10px] uppercase tracking-wide text-emerald-300">Berechnet</span></div><div className="mt-2 text-2xl font-semibold tracking-tight">{metric.value === null ? "Nicht berechenbar" : format(metric.value)}</div><div className="mt-2 text-[11px] text-muted/80">{note ?? calculationExplanation(metric.status, metric.reasons)}</div></Card>;
}

function CompactMetric({ metric, format }: { metric: CalculationMetric; format: (value: number) => string }) {
  return metric.value === null
    ? <span className="text-xs text-muted" title={calculationExplanation(metric.status, metric.reasons)}>Nicht berechenbar</span>
    : <span title={calculationExplanation(metric.status, metric.reasons)}>{format(metric.value)}</span>;
}

function Info({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="flex gap-3 rounded-xl border border-border/70 bg-background/40 p-3"><div className="text-amber-300">{icon}</div><div><div className="text-sm font-medium">{title}</div><div className="mt-1 text-xs text-muted">{text}</div></div></div>;
}

function formatImportDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
