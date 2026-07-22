import { describe, expect, it } from "vitest";
import { calculatePosition } from "../src/lib/calculations/position-calculations";
import { calculatePortfolio } from "../src/lib/calculations/portfolio-calculations";
import type { PositionCalculationInput } from "../src/lib/calculations/calculation-types";

const base: PositionCalculationInput = {
  id: "position-1",
  ticker: "TEST",
  direction: "long",
  quantity: 10,
  multiplier: 1,
  entryPrice: 100,
  currentPrice: 120,
  effectiveStopPrice: 108,
  fxToBase: 1,
  netLiquidity: 10_000,
  marginPercent: 25,
};

describe("central position calculation engine", () => {
  it("calculates a long EUR stock", () => {
    const result = calculatePosition(base);
    expect(result.positionValueBase.value).toBe(1_200);
    expect(result.netLiquidityShare.value).toBe(0.12);
    expect(result.unrealizedPnl.value).toBe(200);
    expect(result.stopRisk.value).toBe(120);
    expect(result.riskToNetLiquidity.value).toBe(0.012);
    expect(result.marginRequirement.value).toBe(300);
    expect(result.marginRequirement.provenance).toBe("estimated");
  });

  it("calculates a long USD stock with canonical fx_to_base multiplication", () => {
    const result = calculatePosition({ ...base, quantity: 20, entryPrice: 45, currentPrice: 50, effectiveStopPrice: 47, fxToBase: 0.9, marginPercent: null });
    expect(result.positionValueBase.value).toBe(900);
    expect(result.unrealizedPnl.value).toBe(90);
    expect(result.stopRisk.value).toBe(54);
  });

  it("calculates a profitable short stock and negative signed exposure", () => {
    const result = calculatePosition({ ...base, direction: "short", entryPrice: 100, currentPrice: 80, effectiveStopPrice: 88, marginPercent: null });
    expect(result.positionValueBase.value).toBe(800);
    expect(result.signedExposure.value).toBe(-800);
    expect(result.unrealizedPnl.value).toBe(200);
    expect(result.stopRisk.value).toBe(80);
  });

  it("calculates a long option with contract multiplier", () => {
    const result = calculatePosition({ ...base, direction: "long_call", quantity: 2, multiplier: 100, entryPrice: 3, currentPrice: 5, effectiveStopPrice: 4, fxToBase: 0.9, marginPercent: null });
    expect(result.positionValueBase.value).toBe(900);
    expect(result.unrealizedPnl.value).toBe(360);
    expect(result.stopRisk.value).toBe(180);
  });

  it("keeps missing stop risk unknown instead of inventing zero", () => {
    const result = calculatePosition({ ...base, effectiveStopPrice: null });
    expect(result.stopRisk).toMatchObject({ value: null, status: "incomplete", reasons: ["stop_missing"] });
  });

  it("rejects a long stop above the current market", () => {
    const result = calculatePosition({ ...base, effectiveStopPrice: 121 });
    expect(result.stopRisk).toMatchObject({ value: null, status: "invalid", reasons: ["stop_invalid"] });
  });

  it("prefers direct margin over an estimate and labels its source", () => {
    const result = calculatePosition({ ...base, directMarginRequirement: 275, marginPercent: 25 });
    expect(result.marginRequirement).toMatchObject({ value: 275, status: "source_fallback", provenance: "broker_or_imported" });
  });
});

describe("central portfolio calculation engine", () => {
  it("returns a partial risk sum and marks an incomplete portfolio", () => {
    const result = calculatePortfolio({
      netLiquidity: 10_000,
      positions: [base, { ...base, id: "position-2", ticker: "NO-STOP", effectiveStopPrice: null }],
    });
    expect(result.totalCalculableStopRisk.value).toBe(120);
    expect(result.totalCalculableStopRisk.status).toBe("incomplete");
    expect(result.riskIsComplete).toBe(false);
    expect(result.calculableRiskPositionCount).toBe(1);
    expect(result.missingStopPositionCount).toBe(1);
    expect(result.shortExposure).toMatchObject({ value: 0, status: "calculated" });
  });

  it("counts position rows separately from instruments", () => {
    const result = calculatePortfolio({
      netLiquidity: 10_000,
      positions: [base, { ...base, id: "position-2", ticker: "TEST", quantity: 5 }],
    });
    expect(result.activePositionRowCount).toBe(2);
    expect(result.distinctInstrumentCount).toBe(1);
  });

  it("aggregates long, short, gross and net exposure", () => {
    const result = calculatePortfolio({
      netLiquidity: 10_000,
      positions: [base, { ...base, id: "position-2", ticker: "SHORT", direction: "short", currentPrice: 80, effectiveStopPrice: 88 }],
    });
    expect(result.longExposure.value).toBe(1_200);
    expect(result.shortExposure.value).toBe(800);
    expect(result.grossExposure.value).toBe(2_000);
    expect(result.netExposure.value).toBe(400);
    expect(result.leverage.value).toBe(0.2);
  });

  it("preserves imported margin provenance in the portfolio aggregate", () => {
    const result = calculatePortfolio({
      netLiquidity: 10_000,
      positions: [{ ...base, directMarginRequirement: 275 }],
    });
    expect(result.totalMarginRequirement).toMatchObject({ value: 275, status: "source_fallback" });
    expect(result.marginUtilization).toMatchObject({ value: 0.0275, status: "source_fallback" });
  });
});
