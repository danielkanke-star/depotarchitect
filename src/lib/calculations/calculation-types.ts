export type NumericInput = number | string | null | undefined;

export type CalculationStatus = "calculated" | "source_fallback" | "incomplete" | "invalid";
export type MarketDataStatus =
  | "live"
  | "delayed"
  | "end_of_day"
  | "manually_updated"
  | "stale"
  | "missing"
  | "demo";
export type InstrumentType = "stock" | "etf" | "option" | "warrant" | "knock_out" | "cash" | "other";

export type CalculationReason =
  | "current_price_missing"
  | "current_price_demo"
  | "current_price_stale"
  | "current_price_invalid"
  | "entry_price_missing"
  | "entry_price_invalid"
  | "quantity_missing"
  | "quantity_invalid"
  | "multiplier_missing"
  | "multiplier_invalid"
  | "fx_to_base_missing"
  | "fx_to_base_demo"
  | "fx_to_base_stale"
  | "fx_to_base_invalid"
  | "net_liquidity_missing"
  | "net_liquidity_invalid"
  | "risk_budget_missing"
  | "risk_budget_invalid"
  | "stop_missing"
  | "stop_invalid"
  | "margin_information_missing"
  | "margin_requirement_invalid"
  | "margin_rate_invalid"
  | "legacy_market_value_used"
  | "direct_margin_requirement_used"
  | "legacy_cash_position_excluded"
  | "cash_fx_missing"
  | "cash_fx_invalid"
  | "cash_fx_demo"
  | "cash_fx_stale"
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

export type MarginProvenance =
  | "broker"
  | "imported_direct"
  | "manual_direct"
  | "estimated"
  | "missing"
  | "legacy_untrusted";

export type Direction = "long" | "short" | "long_put" | "long_call" | "short_put" | "short_call";

export type PositionCalculationInput = {
  id: string;
  ticker: string;
  categoryId?: string | null;
  categoryName?: string | null;
  instrumentType: InstrumentType;
  direction: Direction;
  quantity: NumericInput;
  multiplier: NumericInput;
  entryPrice: NumericInput;
  currentPrice: NumericInput;
  currentPriceStatus?: MarketDataStatus;
  entryFxToBase?: NumericInput;
  currentFxToBase: NumericInput;
  currentFxStatus?: MarketDataStatus;
  netLiquidity: NumericInput;
  riskBudget?: NumericInput;
  effectiveStopPrice?: NumericInput;
  directMarginRequirement?: NumericInput;
  directMarginProvenance?: Exclude<MarginProvenance, "estimated" | "missing">;
  marginRate?: NumericInput;
  legacyMarketValueBase?: NumericInput;
};

export type PositionCalculation = {
  id: string;
  ticker: string;
  instrumentType: InstrumentType;
  categoryId: string | null;
  categoryName: string | null;
  directionFactor: 1 | -1;
  positionValueInstrument: CalculationMetric;
  positionValueBase: CalculationMetric;
  signedExposure: CalculationMetric;
  unrealizedPnl: CalculationMetric;
  netLiquidityShare: CalculationMetric;
  marginRequirement: CalculationMetric & { provenance: MarginProvenance };
  stopRiskInstrument: CalculationMetric;
  stopRisk: CalculationMetric;
  riskToNetLiquidity: CalculationMetric;
  riskToBudget: CalculationMetric;
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
  securityPositions: PositionCalculation[];
  longExposure: CalculationMetric;
  shortExposure: CalculationMetric;
  grossExposure: CalculationMetric;
  netExposure: CalculationMetric;
  netLiquidityLeverage: CalculationMetric;
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
  legacyCashPositionCount: number;
  categories: CategoryCalculation[];
};

export type CashBalanceCalculationInput = {
  id: string;
  currency: string;
  baseCurrency: string;
  balanceNative: NumericInput;
  currentFxToBase: NumericInput;
  currentFxStatus?: MarketDataStatus;
};

export type CashBalanceCalculation = {
  id: string;
  currency: string;
  balanceNative: number | null;
  currentFxToBase: number | null;
  valueBase: CalculationMetric;
};

export type CashPortfolioCalculation = {
  balances: CashBalanceCalculation[];
  totalCashBase: CalculationMetric;
  positiveBalanceCount: number;
  negativeBalanceCount: number;
  zeroBalanceCount: number;
  fxIsComplete: boolean;
  missingFxCount: number;
};
