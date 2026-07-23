import Decimal from "decimal.js";
import type { CalculationMetric, Direction, PositionCalculation, PositionCalculationInput } from "./calculation-types";
import { calculated, decimal, incomplete, invalid, sourceFallback } from "./calculation-validation";

export function directionFactor(direction: Direction): 1 | -1 {
  return direction.startsWith("short") ? -1 : 1;
}

function positionValueInstrument(input: PositionCalculationInput): CalculationMetric {
  const quantity = decimal(input.quantity);
  const multiplier = decimal(input.multiplier);
  const currentPrice = decimal(input.currentPrice);
  if (quantity === null) return incomplete("quantity_missing");
  if (quantity.isNegative()) return invalid("quantity_invalid");
  if (multiplier === null) return incomplete("multiplier_missing");
  if (!multiplier.isPositive()) return invalid("multiplier_invalid");
  if (currentPrice === null) return incomplete("current_price_missing");
  if (currentPrice.isNegative()) return invalid("current_price_invalid");
  return calculated(quantity.abs().mul(multiplier).mul(currentPrice));
}

function positionValueBase(input: PositionCalculationInput, instrumentValue: CalculationMetric): CalculationMetric {
  const fx = decimal(input.currentFxToBase);
  if (instrumentValue.value !== null && fx !== null && fx.isPositive()) {
    return calculated(new Decimal(instrumentValue.value).mul(fx));
  }
  if (fx !== null && !fx.isPositive()) return invalid("fx_to_base_invalid");

  const legacy = decimal(input.legacyMarketValueBase);
  if (legacy !== null && !legacy.isNegative()) return sourceFallback(legacy, "legacy_market_value_used");
  if (instrumentValue.status === "invalid") return invalid(...instrumentValue.reasons);
  if (instrumentValue.value === null) return incomplete(...instrumentValue.reasons);
  return incomplete("fx_to_base_missing");
}

function unrealizedPnl(input: PositionCalculationInput, factor: 1 | -1): CalculationMetric {
  const quantity = decimal(input.quantity);
  const multiplier = decimal(input.multiplier);
  const currentPrice = decimal(input.currentPrice);
  const entryPrice = decimal(input.entryPrice);
  const fx = decimal(input.currentFxToBase);
  if (quantity === null) return incomplete("quantity_missing");
  if (quantity.isNegative()) return invalid("quantity_invalid");
  if (multiplier === null) return incomplete("multiplier_missing");
  if (!multiplier.isPositive()) return invalid("multiplier_invalid");
  if (currentPrice === null) return incomplete("current_price_missing");
  if (currentPrice.isNegative()) return invalid("current_price_invalid");
  if (entryPrice === null) return incomplete("entry_price_missing");
  if (entryPrice.isNegative()) return invalid("entry_price_invalid");
  if (fx === null) return incomplete("fx_to_base_missing");
  if (!fx.isPositive()) return invalid("fx_to_base_invalid");
  return calculated(currentPrice.minus(entryPrice).mul(quantity.abs()).mul(multiplier).mul(fx).mul(factor));
}

function ratio(numerator: CalculationMetric, denominatorInput: PositionCalculationInput["netLiquidity"]): CalculationMetric {
  if (numerator.value === null) return { ...numerator };
  const denominator = decimal(denominatorInput);
  if (denominator === null) return incomplete("net_liquidity_missing");
  if (!denominator.isPositive()) return invalid("net_liquidity_invalid");
  return calculated(new Decimal(numerator.value).div(denominator));
}

function stopRiskInstrument(input: PositionCalculationInput, factor: 1 | -1): CalculationMetric {
  const stop = decimal(input.effectiveStopPrice);
  if (stop === null) return incomplete("stop_missing");
  const currentPrice = decimal(input.currentPrice);
  const quantity = decimal(input.quantity);
  const multiplier = decimal(input.multiplier);
  if (currentPrice === null) return incomplete("current_price_missing");
  if (currentPrice.isNegative()) return invalid("current_price_invalid");
  if (quantity === null) return incomplete("quantity_missing");
  if (quantity.isNegative()) return invalid("quantity_invalid");
  if (multiplier === null) return incomplete("multiplier_missing");
  if (!multiplier.isPositive()) return invalid("multiplier_invalid");
  if (stop.isNegative()) return invalid("stop_invalid");
  if ((factor === 1 && stop.greaterThan(currentPrice)) || (factor === -1 && stop.lessThan(currentPrice))) {
    return invalid("stop_invalid");
  }
  const distance = factor === 1 ? currentPrice.minus(stop) : stop.minus(currentPrice);
  return calculated(distance.mul(quantity.abs()).mul(multiplier));
}

function stopRiskBase(input: PositionCalculationInput, instrumentRisk: CalculationMetric): CalculationMetric {
  if (instrumentRisk.value === null) return { ...instrumentRisk };
  const fx = decimal(input.currentFxToBase);
  if (fx === null) return incomplete("fx_to_base_missing");
  if (!fx.isPositive()) return invalid("fx_to_base_invalid");
  return calculated(new Decimal(instrumentRisk.value).mul(fx));
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
    riskShareOfCalculableTotal: incomplete("portfolio_contains_incomplete_positions"),
  };
}
