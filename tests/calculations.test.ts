import { describe, expect, it } from "vitest";
import { calculateCashPortfolio } from "../src/lib/calculations/cash-calculations";
import { normalizeFxQuoteToBase } from "../src/lib/calculations/fx-normalization";
import { calculatePortfolio } from "../src/lib/calculations/portfolio-calculations";
import { calculatePosition } from "../src/lib/calculations/position-calculations";
import type { PositionCalculationInput } from "../src/lib/calculations/calculation-types";

const base: PositionCalculationInput = {
  id: "position-1",
  ticker: "TEST",
  instrumentType: "stock",
  direction: "long",
  quantity: 10,
  multiplier: 1,
  entryPrice: 100,
  currentPrice: 120,
  entryFxToBase: 1,
  currentFxToBase: 1,
  netLiquidity: 10_000,
  effectiveStopPrice: 108,
  marginRate: 0.25,
};

describe("central position calculation engine", () => {
  it("calculates a long EUR stock and a decimal margin rate", () => {
    const result = calculatePosition(base);
    expect(result.positionValueBase.value).toBe(1_200);
    expect(result.netLiquidityShare.value).toBe(0.12);
    expect(result.unrealizedPnl.value).toBe(200);
    expect(result.stopRiskInstrument.value).toBe(120);
    expect(result.stopRisk.value).toBe(120);
    expect(result.riskToNetLiquidity.value).toBe(0.012);
    expect(result.marginRequirement.value).toBe(300);
    expect(result.marginRequirement.provenance).toBe("estimated");
  });

  it("uses current FX for current value while entry and current FX may differ", () => {
    const result = calculatePosition({
      ...base,
      quantity: 20,
      entryPrice: 45,
      currentPrice: 50,
      effectiveStopPrice: 47,
      entryFxToBase: 0.82,
      currentFxToBase: 0.9,
      marginRate: null,
    });
    expect(result.positionValueBase.value).toBe(900);
    expect(result.unrealizedPnl.value).toBe(90);
    expect(result.stopRiskInstrument.value).toBe(60);
    expect(result.stopRisk.value).toBe(54);
  });

  it("marks a missing current FX as incomplete", () => {
    const result = calculatePosition({ ...base, currentFxToBase: null });
    expect(result.positionValueBase).toMatchObject({ value: null, status: "incomplete", reasons: ["fx_to_base_missing"] });
  });

  it("calculates a profitable short stock and negative signed exposure", () => {
    const result = calculatePosition({ ...base, direction: "short", entryPrice: 100, currentPrice: 80, effectiveStopPrice: 88, marginRate: null });
    expect(result.positionValueBase.value).toBe(800);
    expect(result.signedExposure.value).toBe(-800);
    expect(result.unrealizedPnl.value).toBe(200);
    expect(result.stopRisk.value).toBe(80);
  });

  it("calculates a long option with contract multiplier", () => {
    const result = calculatePosition({ ...base, instrumentType: "option", direction: "long_call", quantity: 2, multiplier: 100, entryPrice: 3, currentPrice: 5, effectiveStopPrice: 4, currentFxToBase: 0.9, marginRate: null });
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

  it("prefers a confirmed direct margin, including an intentional zero", () => {
    const result = calculatePosition({
      ...base,
      directMarginRequirement: 0,
      directMarginProvenance: "manual_direct",
      marginRate: 0.25,
    });
    expect(result.marginRequirement).toMatchObject({ value: 0, status: "source_fallback", provenance: "manual_direct" });
  });

  it("treats a legacy untrusted zero as missing", () => {
    const result = calculatePosition({
      ...base,
      directMarginRequirement: 0,
      directMarginProvenance: "legacy_untrusted",
      marginRate: null,
    });
    expect(result.marginRequirement).toMatchObject({ value: null, status: "incomplete", provenance: "legacy_untrusted" });
  });

  it("matches the synthetic spreadsheet-parity example", () => {
    const result = calculatePosition({
      ...base,
      ticker: "PARITY",
      quantity: 46,
      entryPrice: 79.1,
      currentPrice: 86.17,
      effectiveStopPrice: 77.05,
      entryFxToBase: null,
      currentFxToBase: 1 / 0.929275,
      marginRate: 0.25,
    });
    expect(result.positionValueInstrument.value).toBeCloseTo(3963.82, 2);
    expect(result.positionValueBase.value).toBeCloseTo(4265.50, 2);
    expect(result.unrealizedPnl.value).toBeCloseTo(349.97, 2);
    expect(result.stopRiskInstrument.value).toBeCloseTo(419.52, 2);
    expect(result.stopRisk.value).toBeCloseTo(451.45, 2);
    expect(result.marginRequirement.value).toBeCloseTo(1066.37, 2);
  });
});

describe("cash calculations", () => {
  it("calculates positive, negative and near-zero balances in base currency", () => {
    const result = calculateCashPortfolio([
      { id: "eur", currency: "EUR", baseCurrency: "EUR", balanceNative: 0.00001, currentFxToBase: null },
      { id: "usd", currency: "USD", baseCurrency: "EUR", balanceNative: -1_000, currentFxToBase: 0.9 },
      { id: "chf", currency: "CHF", baseCurrency: "EUR", balanceNative: -500, currentFxToBase: 1.05 },
    ]);
    expect(result.balances[0].currentFxToBase).toBe(1);
    expect(result.balances.map((balance) => balance.valueBase.value)).toEqual([0.00001, -900, -525]);
    expect(result.totalCashBase.value).toBeCloseTo(-1424.99999, 5);
    expect(result.positiveBalanceCount).toBe(1);
    expect(result.negativeBalanceCount).toBe(2);
    expect(result.fxIsComplete).toBe(true);
  });

  it("marks the aggregate incomplete when a foreign-currency FX quote is missing", () => {
    const result = calculateCashPortfolio([
      { id: "usd", currency: "USD", baseCurrency: "EUR", balanceNative: -1_000, currentFxToBase: null },
    ]);
    expect(result.totalCashBase.status).toBe("incomplete");
    expect(result.fxIsComplete).toBe(false);
    expect(result.missingFxCount).toBe(1);
  });
});

describe("FX source normalization", () => {
  it("inverts an EURCHF source quote into CHF per EUR-base conversion", () => {
    expect(normalizeFxQuoteToBase({
      instrumentCurrency: "CHF",
      baseCurrency: "EUR",
      quoteBaseCurrency: "EUR",
      quoteTermCurrency: "CHF",
      quote: 0.929275,
    })).toBeCloseTo(1 / 0.929275, 12);
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

  it("aggregates long, short, gross and net exposure for securities", () => {
    const result = calculatePortfolio({
      netLiquidity: 10_000,
      positions: [base, { ...base, id: "position-2", ticker: "SHORT", direction: "short", currentPrice: 80, effectiveStopPrice: 88 }],
    });
    expect(result.longExposure.value).toBe(1_200);
    expect(result.shortExposure.value).toBe(800);
    expect(result.grossExposure.value).toBe(2_000);
    expect(result.netExposure.value).toBe(400);
    expect(result.netLiquidityLeverage.value).toBe(0.2);
  });

  it("excludes legacy cash position rows from gross market value, leverage and categories", () => {
    const result = calculatePortfolio({
      netLiquidity: 10_000,
      positions: [
        base,
        { ...base, id: "legacy-cash", ticker: "EUR CASH", instrumentType: "cash", currentPrice: 5_000, marginRate: null },
      ],
    });
    expect(result.grossExposure.value).toBe(1_200);
    expect(result.netLiquidityLeverage.value).toBe(0.12);
    expect(result.activePositionRowCount).toBe(1);
    expect(result.legacyCashPositionCount).toBe(1);
    expect(result.categories).toHaveLength(1);
  });

  it("preserves imported direct margin provenance in the portfolio aggregate", () => {
    const result = calculatePortfolio({
      netLiquidity: 10_000,
      positions: [{ ...base, directMarginRequirement: 275, directMarginProvenance: "imported_direct" }],
    });
    expect(result.totalMarginRequirement).toMatchObject({ value: 275, status: "source_fallback" });
    expect(result.marginUtilization).toMatchObject({ value: 0.0275, status: "source_fallback" });
  });
});
