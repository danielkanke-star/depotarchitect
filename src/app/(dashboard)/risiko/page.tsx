import { PageHeader } from "@/components/ui";
import { RiskCalculator } from "@/components/risk-calculator";
import { getPortfolioData } from "@/lib/portfolio";
import { calculatePortfolio } from "@/lib/calculations/portfolio-calculations";
import { positionToCalculationInput } from "@/lib/calculations/position-adapter";
import { depotRiskBudget } from "@/lib/risk-rules";
import { CALCULATION_REASON_LABELS } from "@/lib/calculations/calculation-provenance";

export default async function RisikoPage() {
  const { portfolio, settings, positions, categories, fxRates, priceObservations } = await getPortfolioData();
  const riskBudget = depotRiskBudget(portfolio.net_liquidity, portfolio.risk_profile);
  const activePositions = positions.filter((position) => position.status !== "closed");
  const calculation = calculatePortfolio({ netLiquidity: portfolio.net_liquidity, riskBudget, positions: activePositions.map((position) => positionToCalculationInput(position, portfolio, categories, fxRates, riskBudget, priceObservations)) });
  const riskIssues = calculation.positions.filter(position => position.instrumentType !== "cash" && position.stopRisk.value === null)
    .map(position => ({ id: position.id, ticker: position.ticker, message: position.stopRisk.reasons.map(reason => CALCULATION_REASON_LABELS[reason]).join(", ") }));
  return <><PageHeader eyebrow="Positionsplanung" title="Positionsgröße berechnen" description="Kurs und Stopp festlegen, Risiko prüfen und eine passende Stückzahl berechnen." /><RiskCalculator initialNetLiquidity={portfolio.net_liquidity === null ? null : Number(portfolio.net_liquidity)} initialRiskPct={Number(settings.risk_per_trade_pct)} existingRisk={activePositions.length === 0 ? 0 : calculation.totalCalculableStopRisk.value} riskComplete={calculation.riskIsComplete} riskIssues={riskIssues} profile={portfolio.risk_profile} baseCurrency={portfolio.currency} /></>;
}
