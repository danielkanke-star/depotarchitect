export type NumericInput = number | string | null | undefined;

export type CalculationStatus = "calculated" | "source_fallback" | "incomplete" | "invalid";

export type CalculationReason =
  | "current_price_missing"
  | "current_price_invalid"
  | "entry_price_missing"
  | "entry_price_invalid"
  | "quantity_missing"
  | "quantity_invalid"
  | "multiplier_missing"
  | "multiplier_invalid"
  | "fx_to_base_missing"
  | "fx_to_base_invalid"
  | "net_liquidity_missing"
  | "net_liquidity_invalid"
  | "stop_missing"
  | "stop_invalid"
  | "margin_information_missing"
  | "margin_requirement_invalid"
  | "margin_percent_invalid"
  | "legacy_market_value_used"
  | "direct_margin_requirement_used"
  | "portfolio_contains_incomplete_positions"
  | "portfolio_contains_invalid_positions"
  | "gross_exposure_zero"
  | "market_value_total_zero"
  | "calculable_risk_total_zero";

export type CalculationMetric = {
  value: number | null;
  status: CalculationStatus;
  reasons: CalculationReason[];
};

export type MarginProvenance = "broker_or_imported" | "estimated" | "missing";

export type Direction = "long" | "short" | "long_put" | "long_call" | "short_put" | "short_call";

export type PositionCalculationInput = {
  id: string;
  ticker: string;
  categoryId?: string | null;
  categoryName?: string | null;
  direction: Direction;
  quantity: NumericInput;
  multiplier: NumericInput;
  entryPrice: NumericInput;
  currentPrice: NumericInput;
  fxToBase: NumericInput;
  netLiquidity: NumericInput;
  effectiveStopPrice?: NumericInput;
  directMarginRequirement?: NumericInput;
  marginPercent?: NumericInput;
  legacyMarketValueBase?: NumericInput;
};

export type PositionCalculation = {
  id: string;
  ticker: string;
  categoryId: string | null;
  categoryName: string | null;
  directionFactor: 1 | -1;
  positionValueInstrument: CalculationMetric;
  positionValueBase: CalculationMetric;
  signedExposure: CalculationMetric;
  unrealizedPnl: CalculationMetric;
  netLiquidityShare: CalculationMetric;
  marginRequirement: CalculationMetric & { provenance: MarginProvenance };
  stopRisk: CalculationMetric;
  riskToNetLiquidity: CalculationMetric;
  riskShareOfCalculableTotal: CalculationMetric;
};

export type CategoryCalculation = {
  categoryId: string | null;
  categoryName: string;
  positionRowCount: number;
  marketValue: CalculationMetric;
  netLiquidityShare: CalculationMetric;
  grossExposureShare: CalculationMetric;
};

export type PortfolioCalculationInput = {
  netLiquidity: NumericInput;
  positions: PositionCalculationInput[];
};

export type PortfolioCalculation = {
  positions: PositionCalculation[];
  longExposure: CalculationMetric;
  shortExposure: CalculationMetric;
  grossExposure: CalculationMetric;
  netExposure: CalculationMetric;
  leverage: CalculationMetric;
  totalMarginRequirement: CalculationMetric;
  marginUtilization: CalculationMetric;
  totalCalculableStopRisk: CalculationMetric;
  riskValueCoverage: CalculationMetric;
  calculableRiskPositionCount: number;
  missingStopPositionCount: number;
  invalidStopPositionCount: number;
  missingMarginPositionCount: number;
  riskIsComplete: boolean;
  activePositionRowCount: number;
  distinctInstrumentCount: number;
  categories: CategoryCalculation[];
};
