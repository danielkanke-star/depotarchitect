import Decimal from "decimal.js";
import type { CalculationMetric, CalculationReason, Direction, MarketDataStatus, PositionCalculation, PositionCalculationInput } from "./calculation-types";
import { calculated, decimal, incomplete, invalid, metricWithValue, sourceFallback, unique } from "./calculation-validation";

export function directionFactor(direction: Direction): 1 | -1 {
  return direction.startsWith("short") ? -1 : 1;
}

function marketDataNumber(
  value: PositionCalculationInput["currentPrice"],
  status: MarketDataStatus | undefined,
  missingReason: CalculationReason,
  invalidReason: CalculationReason,
  demoReason: CalculationReason,
  staleReason: CalculationReason,
) {
  const parsed = decimal(value);
  if (parsed === null || status === "missing") return { parsed: null, metric: incomplete(missingReason) };
  if (parsed.isNegative()) return { parsed: null, metric: invalid(invalidReason) };
  if (status === "demo") return { parsed: null, metric: incomplete(demoReason) };
  if (status === "stale") return { parsed, metric: sourceFallback(parsed, staleReason) };
  return { parsed, metric: calculated(parsed) };
}

function withSourceStatus(value: Decimal, metrics: CalculationMetric[]) {
  const fallbackReasons = unique(metrics
    .filter((metric) => metric.status === "source_fallback")
    .flatMap((metric) => metric.reasons));
  return fallbackReasons.length > 0
    ? metricWithValue(value, "source_fallback", fallbackReasons)
    : calculated(value);
}

function positionValueInstrument(input: PositionCalculationInput): CalculationMetric {
  const quantity = decimal(input.quantity);
  const multiplier = decimal(input.multiplier);
  const currentPrice = marketDataNumber(
    input.currentPrice,
    input.currentPriceStatus,
    "current_price_missing",
    "current_price_invalid",
    "current_price_demo",
    "current_price_stale",
  );
  if (quantity === null) return incomplete("quantity_missing");
  if (quantity.isNegative()) return invalid("quantity_invalid");
  if (multiplier === null) return incomplete("multiplier_missing");
  if (!multiplier.isPositive()) return invalid("multiplier_invalid");
  if (currentPrice.parsed === null) return currentPrice.metric;
  return withSourceStatus(quantity.abs().mul(multiplier).mul(currentPrice.parsed), [currentPrice.metric]);
}

function positionValueBase(input: PositionCalculationInput, instrumentValue: CalculationMetric): CalculationMetric {
  const fx = marketDataNumber(
    input.currentFxToBase,
    input.currentFxStatus,
    "fx_to_base_missing",
    "fx_to_base_invalid",
    "fx_to_base_demo",
    "fx_to_base_stale",
  );
  if (instrumentValue.value !== null && fx.parsed !== null && fx.parsed.isPositive()) {
    return withSourceStatus(new Decimal(instrumentValue.value).mul(fx.parsed), [instrumentValue, fx.metric]);
  }
  if (fx.parsed !== null && !fx.parsed.isPositive()) return invalid("fx_to_base_invalid");
  if (instrumentValue.status === "invalid") return invalid(...instrumentValue.reasons);
  if (instrumentValue.value === null) return incomplete(...instrumentValue.reasons);
  return fx.metric;
}

function unrealizedPnl(input: PositionCalculationInput, factor: 1 | -1): CalculationMetric {
  const quantity = decimal(input.quantity);
  const multiplier = decimal(input.multiplier);
  const currentPrice = marketDataNumber(
    input.currentPrice,
    input.currentPriceStatus,
    "current_price_missing",
    "current_price_invalid",
    "current_price_demo",
    "current_price_stale",
  );
  const entryPrice = decimal(input.entryPrice);
  const fx = marketDataNumber(
    input.currentFxToBase,
    input.currentFxStatus,
    "fx_to_base_missing",
    "fx_to_base_invalid",
    "fx_to_base_demo",
    "fx_to_base_stale",
  );
  if (quantity === null) return incomplete("quantity_missing");
  if (quantity.isNegative()) return invalid("quantity_invalid");
  if (multiplier === null) return incomplete("multiplier_missing");
  if (!multiplier.isPositive()) return invalid("multiplier_invalid");
  if (currentPrice.parsed === null) return currentPrice.metric;
  if (entryPrice === null) return incomplete("entry_price_missing");
  if (entryPrice.isNegative()) return invalid("entry_price_invalid");
  if (fx.parsed === null) return fx.metric;
  if (!fx.parsed.isPositive()) return invalid("fx_to_base_invalid");
  return withSourceStatus(
    currentPrice.parsed.minus(entryPrice).mul(quantity.abs()).mul(multiplier).mul(fx.parsed).mul(factor),
    [currentPrice.metric, fx.metric],
  );
}

function ratio(
  numerator: CalculationMetric,
  denominatorInput: PositionCalculationInput["netLiquidity"],
  missingReason: CalculationReason = "net_liquidity_missing",
  invalidReason: CalculationReason = "net_liquidity_invalid",
): CalculationMetric {
  if (numerator.value === null) return { ...numerator };
  const denominator = decimal(denominatorInput);
  if (denominator === null) return incomplete(missingReason);
  if (!denominator.isPositive()) return invalid(invalidReason);
  return metricWithValue(new Decimal(numerator.value).div(denominator), numerator.status, numerator.reasons);
}

function stopRiskInstrument(input: PositionCalculationInput, factor: 1 | -1): CalculationMetric {
  const stop = decimal(input.effectiveStopPrice);
  if (stop === null) return incomplete("stop_missing");
  const currentPrice = marketDataNumber(
    input.currentPrice,
    input.currentPriceStatus,
    "current_price_missing",
    "current_price_invalid",
    "current_price_demo",
    "current_price_stale",
  );
  const quantity = decimal(input.quantity);
  const multiplier = decimal(input.multiplier);
  if (currentPrice.parsed === null) return currentPrice.metric;
  if (quantity === null) return incomplete("quantity_missing");
  if (quantity.isNegative()) return invalid("quantity_invalid");
  if (multiplier === null) return incomplete("multiplier_missing");
  if (!multiplier.isPositive()) return invalid("multiplier_invalid");
  if (stop.isNegative()) return invalid("stop_invalid");
  if ((factor === 1 && stop.greaterThan(currentPrice.parsed)) || (factor === -1 && stop.lessThan(currentPrice.parsed))) {
    return invalid("stop_invalid");
  }
  const distance = factor === 1 ? currentPrice.parsed.minus(stop) : stop.minus(currentPrice.parsed);
  return withSourceStatus(distance.mul(quantity.abs()).mul(multiplier), [currentPrice.metric]);
}

function stopRiskBase(input: PositionCalculationInput, instrumentRisk: CalculationMetric): CalculationMetric {
  if (instrumentRisk.value === null) return { ...instrumentRisk };
  const fx = marketDataNumber(
    input.currentFxToBase,
    input.currentFxStatus,
    "fx_to_base_missing",
    "fx_to_base_invalid",
    "fx_to_base_demo",
    "fx_to_base_stale",
  );
  if (fx.parsed === null) return fx.metric;
  if (!fx.parsed.isPositive()) return invalid("fx_to_base_invalid");
  return withSourceStatus(new Decimal(instrumentRisk.value).mul(fx.parsed), [instrumentRisk, fx.metric]);
}

function marginRequirement(input: PositionCalculationInput, baseValue: CalculationMetric): PositionCalculation["marginRequirement"] {
  const direct = decimal(input.directMarginRequirement);
  if (direct !== null) {
    if (direct.isNegative()) return { ...invalid("margin_requirement_invalid"), provenance: "missing" };
    const provenance = input.directMarginProvenance ?? "legacy_untrusted";
    if (provenance === "legacy_untrusted") return { ...incomplete("margin_information_missing"), provenance };
    return { ...sourceFallback(direct, "direct_margin_requirement_used"), provenance };
  }
  const rate = decimal(input.marginRate);
  if (rate === null) return { ...incomplete("margin_information_missing"), provenance: input.directMarginProvenance === "legacy_untrusted" ? "legacy_untrusted" : "missing" };
  if (rate.isNegative() || rate.greaterThan(1)) return { ...invalid("margin_rate_invalid"), provenance: "missing" };
  if (baseValue.value === null) return { ...baseValue, provenance: "missing" };
  return { ...calculated(new Decimal(baseValue.value).mul(rate)), provenance: "estimated" };
}

export function calculatePosition(input: PositionCalculationInput): PositionCalculation {
  const factor = directionFactor(input.direction);
  const instrumentValue = positionValueInstrument(input);
  const baseValue = positionValueBase(input, instrumentValue);
  const signedExposure = baseValue.value === null
    ? { ...baseValue }
    : calculated(new Decimal(baseValue.value).mul(factor));
  const pnl = unrealizedPnl(input, factor);
  const netLiquidityShare = ratio(baseValue, input.netLiquidity);
  const instrumentRisk = stopRiskInstrument(input, factor);
  const risk = stopRiskBase(input, instrumentRisk);

  return {
    id: input.id,
    ticker: input.ticker,
    instrumentType: input.instrumentType,
    categoryId: input.categoryId ?? null,
    categoryName: input.categoryName ?? null,
    directionFactor: factor,
    positionValueInstrument: instrumentValue,
    positionValueBase: baseValue,
    signedExposure,
    unrealizedPnl: pnl,
    netLiquidityShare,
    marginRequirement: marginRequirement(input, baseValue),
    stopRiskInstrument: instrumentRisk,
    stopRisk: risk,
    riskToNetLiquidity: ratio(risk, input.netLiquidity),
    riskToBudget: ratio(risk, input.riskBudget, "risk_budget_missing", "risk_budget_invalid"),
    riskShareOfCalculableTotal: incomplete("portfolio_contains_incomplete_positions"),
  };
}
