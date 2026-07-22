import Decimal from "decimal.js";
import type { CalculationMetric, CalculationReason, CategoryCalculation, PortfolioCalculation, PortfolioCalculationInput, PositionCalculation } from "./calculation-types";
import { calculated, decimal, incomplete, invalid, metricWithValue, unique } from "./calculation-validation";
import { calculatePosition } from "./position-calculations";

function sum(values: number[]) {
  return values.reduce((total, value) => total.add(value), new Decimal(0));
}

function partialAggregate(metrics: CalculationMetric[]): CalculationMetric {
  const available = metrics.flatMap((metric) => metric.value === null ? [] : [metric.value]);
  const invalidReasons = metrics.filter((metric) => metric.status === "invalid").flatMap((metric) => metric.reasons);
  const incompleteReasons = metrics.filter((metric) => metric.status === "incomplete").flatMap((metric) => metric.reasons);
  if (available.length === 0) {
    if (invalidReasons.length > 0) return invalid(...invalidReasons);
    const reasons: CalculationReason[] = incompleteReasons.length > 0 ? incompleteReasons : ["portfolio_contains_incomplete_positions"];
    return incomplete(...reasons);
  }
  if (invalidReasons.length > 0) {
    return metricWithValue(sum(available), "invalid", unique(["portfolio_contains_invalid_positions", ...invalidReasons]));
  }
  if (incompleteReasons.length > 0 || available.length !== metrics.length) {
    return metricWithValue(sum(available), "incomplete", unique(["portfolio_contains_incomplete_positions", ...incompleteReasons]));
  }
  const fallbackReasons = metrics.filter((metric) => metric.status === "source_fallback").flatMap((metric) => metric.reasons);
  if (fallbackReasons.length > 0) return metricWithValue(sum(available), "source_fallback", unique(fallbackReasons));
  return calculated(sum(available));
}

function portfolioRatio(numerator: CalculationMetric, denominatorInput: PortfolioCalculationInput["netLiquidity"]): CalculationMetric {
  if (numerator.value === null) return { ...numerator };
  const denominator = decimal(denominatorInput);
  if (denominator === null) return incomplete("net_liquidity_missing");
  if (!denominator.isPositive()) return invalid("net_liquidity_invalid");
  return metricWithValue(new Decimal(numerator.value).div(denominator), numerator.status, numerator.reasons);
}

function exposureMetric(positions: PositionCalculation[], factor: 1 | -1) {
  const matching = positions.filter((position) => position.directionFactor === factor);
  return matching.length === 0 ? calculated(0) : partialAggregate(matching.map((position) => position.positionValueBase));
}

function categoryCalculations(
  positions: PositionCalculation[],
  netLiquidity: PortfolioCalculationInput["netLiquidity"],
  grossExposure: CalculationMetric,
): CategoryCalculation[] {
  const groups = new Map<string, PositionCalculation[]>();
  for (const position of positions) {
    const key = position.categoryId ?? `name:${position.categoryName ?? "Nicht zugeordnet"}`;
    groups.set(key, [...(groups.get(key) ?? []), position]);
  }
  return [...groups.entries()].map(([key, categoryPositions]) => {
    const marketValue = partialAggregate(categoryPositions.map((position) => position.positionValueBase));
    const grossShare = grossExposure.value === null || marketValue.value === null
      ? incomplete(...unique([...grossExposure.reasons, ...marketValue.reasons]))
      : grossExposure.value === 0
        ? invalid("gross_exposure_zero")
        : metricWithValue(new Decimal(marketValue.value).div(grossExposure.value), marketValue.status, marketValue.reasons);
    return {
      categoryId: key.startsWith("name:") ? null : key,
      categoryName: categoryPositions[0].categoryName ?? "Nicht zugeordnet",
      positionRowCount: categoryPositions.length,
      marketValue,
      netLiquidityShare: portfolioRatio(marketValue, netLiquidity),
      grossExposureShare: grossShare,
    };
  }).sort((a, b) => (b.marketValue.value ?? -1) - (a.marketValue.value ?? -1));
}

function attachRiskShares(positions: PositionCalculation[], totalRisk: CalculationMetric) {
  return positions.map((position) => {
    let share: CalculationMetric;
    if (position.stopRisk.value === null) share = { ...position.stopRisk };
    else if (totalRisk.value === null) share = { ...totalRisk };
    else if (totalRisk.value === 0) share = invalid("calculable_risk_total_zero");
    else share = calculated(new Decimal(position.stopRisk.value).div(totalRisk.value));
    return { ...position, riskShareOfCalculableTotal: share };
  });
}

export function calculatePortfolio(input: PortfolioCalculationInput): PortfolioCalculation {
  const basePositions = input.positions.map(calculatePosition);
  const longExposure = exposureMetric(basePositions, 1);
  const shortExposure = exposureMetric(basePositions, -1);
  const exposureReasons = unique([...longExposure.reasons, ...shortExposure.reasons]);
  const exposureStatus = longExposure.status === "invalid" || shortExposure.status === "invalid"
    ? "invalid"
    : longExposure.status === "incomplete" || shortExposure.status === "incomplete"
      ? "incomplete"
      : longExposure.status === "source_fallback" || shortExposure.status === "source_fallback"
        ? "source_fallback"
        : "calculated";
  const grossExposure = longExposure.value === null || shortExposure.value === null
    ? incomplete(...exposureReasons)
    : metricWithValue(new Decimal(longExposure.value).add(shortExposure.value), exposureStatus, exposureReasons);
  const netExposure = longExposure.value === null || shortExposure.value === null
    ? incomplete(...exposureReasons)
    : metricWithValue(new Decimal(longExposure.value).sub(shortExposure.value), exposureStatus, exposureReasons);
  const totalMarginRequirement = partialAggregate(basePositions.map((position) => position.marginRequirement));
  const totalCalculableStopRisk = partialAggregate(basePositions.map((position) => position.stopRisk));
  const positions = attachRiskShares(basePositions, totalCalculableStopRisk);
  const totalMarketValue = partialAggregate(basePositions.map((position) => position.positionValueBase));
  const riskCoveredMarketValue = partialAggregate(basePositions
    .filter((position) => position.stopRisk.value !== null)
    .map((position) => position.positionValueBase));
  const riskValueCoverage = totalMarketValue.value === null || riskCoveredMarketValue.value === null
    ? incomplete(...unique([...totalMarketValue.reasons, ...riskCoveredMarketValue.reasons]))
    : totalMarketValue.value === 0
      ? invalid("market_value_total_zero")
      : calculated(new Decimal(riskCoveredMarketValue.value).div(totalMarketValue.value));
  const missingStopPositionCount = basePositions.filter((position) => position.stopRisk.reasons.includes("stop_missing")).length;
  const invalidStopPositionCount = basePositions.filter((position) => position.stopRisk.reasons.includes("stop_invalid")).length;

  return {
    positions,
    longExposure,
    shortExposure,
    grossExposure,
    netExposure,
    leverage: portfolioRatio(grossExposure, input.netLiquidity),
    totalMarginRequirement,
    marginUtilization: portfolioRatio(totalMarginRequirement, input.netLiquidity),
    totalCalculableStopRisk,
    riskValueCoverage,
    calculableRiskPositionCount: basePositions.filter((position) => position.stopRisk.value !== null).length,
    missingStopPositionCount,
    invalidStopPositionCount,
    missingMarginPositionCount: basePositions.filter((position) => position.marginRequirement.value === null).length,
    riskIsComplete: missingStopPositionCount === 0 && invalidStopPositionCount === 0 && basePositions.every((position) => position.stopRisk.value !== null),
    activePositionRowCount: basePositions.length,
    distinctInstrumentCount: new Set(input.positions.map((position) => position.ticker.trim().toUpperCase())).size,
    categories: categoryCalculations(positions, input.netLiquidity, grossExposure),
  };
}
