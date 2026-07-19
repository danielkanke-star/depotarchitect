import { PageHeader } from "@/components/ui";
import { RiskCalculator } from "@/components/risk-calculator";
import { getPortfolioData } from "@/lib/portfolio";

export default async function RisikoPage() {
  const { portfolio, settings } = await getPortfolioData();
  return <><PageHeader eyebrow="Risikosteuerung" title="Risiko" description="Positionsgröße und Risikobudget auf Basis der Nettoliquidität berechnen." /><RiskCalculator initialNetLiquidity={Number(portfolio.net_liquidity)} initialRiskPct={Number(settings.risk_per_trade_pct)} initialMargin={Number(portfolio.margin_used_pct)} maxMargin={Number(settings.max_margin_pct)} /></>;
}
