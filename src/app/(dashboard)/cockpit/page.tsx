import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { calculationExplanation } from "@/lib/calculations/calculation-provenance";
import { calculateCashPortfolio } from "@/lib/calculations/cash-calculations";
import { calculatePortfolio } from "@/lib/calculations/portfolio-calculations";
import { positionToCalculationInput } from "@/lib/calculations/position-adapter";
import type { CalculationMetric } from "@/lib/calculations/calculation-types";
import { pct } from "@/lib/format";
import { canonicalMarketDataStatus, latestUsableFxRate } from "@/lib/market-data";
import { getPortfolioData } from "@/lib/portfolio";
import { isMarginAccount } from "@/lib/portfolio-entry";
import { resolvePositionPrice } from "@/lib/price-resolution";

export default async function CockpitPage() {
  const { portfolio, settings, categories, positions, cashBalances, fxRates, priceObservations } = await getPortfolioData();
  const activePositions = positions.filter((position) => position.status !== "closed");
  const riskBudget = portfolio.net_liquidity === null || Number(settings.risk_per_trade_pct) <= 0
    ? null
    : Number(portfolio.net_liquidity) * Number(settings.risk_per_trade_pct) / 100;
  const calculation = calculatePortfolio({
    netLiquidity: portfolio.net_liquidity,
    riskBudget,
    positions: activePositions.map((position) => positionToCalculationInput(position, portfolio, categories, fxRates, riskBudget, priceObservations)),
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
  const securityPositions = activePositions.filter((position) => position.instrument_type !== "cash");
  const missingPriceCount = securityPositions.filter((position) =>
    resolvePositionPrice(position, priceObservations) === null
  ).length;
  const incompleteValuationCount = calculation.securityPositions.filter((position) => position.positionValueBase.value === null).length;
  const top = [...calculation.securityPositions].sort((a, b) => (b.positionValueBase.value ?? -1) - (a.positionValueBase.value ?? -1)).slice(0, 6);
  const money = new Intl.NumberFormat("de-DE", { style: "currency", currency: portfolio.currency, maximumFractionDigits: 2 });

  return <>
    <PageHeader eyebrow="Portfolio-Cockpit" title="DepotArchitect" description="Die wichtigsten Depot-, Margin- und Risikokennzahlen auf einen Blick." />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <SourceKpi label="Nettoliquidität" value={portfolio.net_liquidity === null ? "Daten fehlen" : money.format(Number(portfolio.net_liquidity))} note="Separates Quelldatum des Depots" />
      <MetricKpi label="Wertpapiermarktwert" metric={calculation.grossExposure} format={(value) => money.format(value)} />
      {isMarginAccount(portfolio.account_type)
        ? <MetricKpi label="Margin-Auslastung" metric={calculation.marginUtilization} format={(value) => pct(value * 100)} />
        : <TextKpi label="Margin-Auslastung" value="Nicht zutreffend" note="Cash-Konto" />}
      <MetricKpi label="NetLiq-Hebel" metric={calculation.netLiquidityLeverage} format={(value) => `${value.toFixed(2).replace(".", ",")}×`} note="Wertpapier-Bruttomarktwert ÷ Nettoliquidität; Cash ist ausgeschlossen." />
      <MetricKpi label="Risiko bis Trading-Stopp" metric={calculation.totalCalculableStopRisk} format={(value) => money.format(value)} />
      <MetricKpi label="Risiko-Budget-Auslastung" metric={calculation.riskBudgetUtilization} format={(value) => pct(value * 100)} />
    </div>

    <Card className="mt-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <CompactFact label="Long" metric={calculation.longExposure} format={(value) => money.format(value)} />
        <CompactFact label="Short" metric={calculation.shortExposure} format={(value) => money.format(value)} />
        <CompactFact label="Cash" metric={cash.totalCashBase} format={(value) => money.format(value)} />
      </div>
    </Card>

    {(missingPriceCount > 0 || calculation.missingStopPositionCount > 0 || incompleteValuationCount > 0) && <Card className="mt-4">
      <h2 className="font-medium">Fehlende Angaben</h2>
      <div className="mt-3 space-y-2 text-sm text-muted">
        {missingPriceCount > 0 && <p>Für {missingPriceCount} {missingPriceCount === 1 ? "Position fehlt" : "Positionen fehlt"} ein aktueller Kurs.</p>}
        {calculation.missingStopPositionCount > 0 && <p>Für {calculation.missingStopPositionCount} {calculation.missingStopPositionCount === 1 ? "Position fehlt" : "Positionen fehlt"} ein Trading-Stopp.</p>}
        {incompleteValuationCount > 0 && <p>{incompleteValuationCount} {incompleteValuationCount === 1 ? "Position kann" : "Positionen können"} derzeit nicht vollständig bewertet werden.</p>}
      </div>
    </Card>}

    <Card className="mt-4">
      <div className="mb-4 flex items-center justify-between"><div><h2 className="font-medium">Größte offene Positionen</h2><p className="mt-1 text-xs text-muted">Keine fehlenden Werte werden durch Null oder Demoangaben ersetzt.</p></div><Link href="/depot" className="flex items-center gap-1 text-xs text-accent">Depot öffnen <ArrowRight size={14} /></Link></div>
      {top.length === 0 ? <p className="text-sm text-muted">Noch keine berechenbaren offenen Positionen vorhanden.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="text-left text-xs text-muted"><tr><th className="pb-3">Ticker</th><th>Kategorie</th><th>Marktwert</th><th>Risiko bis Stopp</th></tr></thead><tbody>{top.map((position) => <tr key={position.id} className="border-t border-border/60"><td className="py-3 font-medium">{position.ticker}</td><td className="text-muted">{position.categoryName ?? "Nicht zugeordnet"}</td><td><CompactMetric metric={position.positionValueBase} format={(value) => money.format(value)} /></td><td><CompactMetric metric={position.stopRisk} format={(value) => money.format(value)} /></td></tr>)}</tbody></table></div>}
    </Card>
  </>;
}

function SourceKpi({ label, value, note }: { label: string; value: string; note: string }) {
  return <Card><div className="text-xs text-muted">{label}</div><div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div><div className="mt-2 text-[11px] text-muted/80">{note}</div></Card>;
}

function TextKpi({ label, value, note }: { label: string; value: string; note: string }) {
  return <SourceKpi label={label} value={value} note={note} />;
}

function MetricKpi({ label, metric, format, note }: { label: string; metric: CalculationMetric; format: (value: number) => string; note?: string }) {
  return <Card><div className="text-xs text-muted">{label}</div><div className="mt-2 text-2xl font-semibold tracking-tight">{metric.value === null ? "Nicht berechenbar" : format(metric.value)}</div><div className="mt-2 text-[11px] text-muted/80">{note ?? simpleExplanation(metric)}</div></Card>;
}

function CompactFact({ label, metric, format }: { label: string; metric: CalculationMetric; format: (value: number) => string }) {
  return <div className="rounded-xl border border-border/70 bg-background/30 p-3"><div className="text-xs text-muted">{label}</div><div className="mt-1 text-lg font-semibold">{metric.value === null ? "Nicht berechenbar" : format(metric.value)}</div></div>;
}

function CompactMetric({ metric, format }: { metric: CalculationMetric; format: (value: number) => string }) {
  return metric.value === null ? <span className="text-xs text-muted">Nicht berechenbar</span> : <span>{format(metric.value)}</span>;
}

function simpleExplanation(metric: CalculationMetric) {
  if (metric.value !== null) return "Zentral berechnet";
  if (metric.reasons.includes("risk_budget_missing")) return "Risikobudget fehlt";
  if (metric.reasons.includes("net_liquidity_missing")) return "Nettoliquidität fehlt";
  return calculationExplanation(metric.status, metric.reasons);
}
