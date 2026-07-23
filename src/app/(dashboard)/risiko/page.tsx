import { PageHeader } from "@/components/ui";
import { RiskCalculator } from "@/components/risk-calculator";
import { getPortfolioData } from "@/lib/portfolio";
import { calculatePortfolio } from "@/lib/calculations/portfolio-calculations";
import { positionToCalculationInput } from "@/lib/calculations/position-adapter";

export default async function RisikoPage() {
  const { portfolio, settings, positions, categories, fxRates } = await getPortfolioData();
  const riskBudget = portfolio.net_liquidity === null || Number(settings.risk_per_trade_pct) <= 0
    ? null
    : Number(portfolio.net_liquidity) * Number(settings.risk_per_trade_pct) / 100;
  const calculation = calculatePortfolio({ netLiquidity: portfolio.net_liquidity, positions: positions.map((position) => positionToCalculationInput(position, portfolio, categories, fxRates, riskBudget)) });
  return <><PageHeader eyebrow="Risikosteuerung" title="Risiko" description="Bestehender Positionsgrößenrechner mit zentral berechneter aktueller Margin-Auslastung." /><RiskCalculator initialNetLiquidity={portfolio.net_liquidity === null ? null : Number(portfolio.net_liquidity)} initialRiskPct={Number(settings.risk_per_trade_pct)} initialMargin={calculation.marginUtilization.value === null ? null : calculation.marginUtilization.value * 100} maxMargin={Number(settings.max_margin_pct)} /></>;
}
