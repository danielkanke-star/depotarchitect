import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  normalizeMarginInput,
  normalizePositionSale,
  remainingQuantity,
  validateCapitalMovement,
} from "../src/lib/portfolio-entry";

describe("simplified position lifecycle", () => {
  it("keeps a new open position fully open", () => {
    expect(normalizePositionSale({ quantity: 10, soldQuantity: null, salePrice: null, saleDate: null, requestedStatus: "open" }))
      .toEqual({ soldQuantity: 0, salePrice: null, saleDate: null, status: "active", remainingQuantity: 10 });
  });

  it("requires a closed position to be fully sold", () => {
    expect(normalizePositionSale({ quantity: 10, soldQuantity: 10, salePrice: 120, saleDate: "2026-07-26", requestedStatus: "closed" }))
      .toMatchObject({ status: "closed", remainingQuantity: 0 });
    expect(() => normalizePositionSale({ quantity: 10, soldQuantity: 9, salePrice: 120, saleDate: "2026-07-26", requestedStatus: "closed" })).toThrow();
  });

  it("uses only the remaining quantity after a partial sale", () => {
    const sale = normalizePositionSale({ quantity: 10, soldQuantity: 4, salePrice: 120, saleDate: "2026-07-26", requestedStatus: "open" });
    expect(sale).toMatchObject({ status: "active", remainingQuantity: 6 });
    expect(remainingQuantity(10, sale.soldQuantity)).toBe(6);
  });
});

describe("account-specific margin input", () => {
  it("normalizes a margin percentage for a margin account", () => {
    expect(normalizeMarginInput({ accountType: "margin_account", inputType: "rate", value: 25 }))
      .toEqual({ marginRequirement: null, marginRate: 0.25, marginSource: "estimated" });
  });

  it("keeps a direct amount as a manual direct value", () => {
    expect(normalizeMarginInput({ accountType: "portfolio_margin_account", inputType: "amount", value: 500 }))
      .toEqual({ marginRequirement: 500, marginRate: null, marginSource: "manual_direct" });
  });

  it("ignores manipulated margin input for a cash account", () => {
    expect(normalizeMarginInput({ accountType: "cash_account", inputType: "amount", value: 500 }))
      .toEqual({ marginRequirement: null, marginRate: null, marginSource: "missing" });
  });
});

describe("capital movements", () => {
  it.each(["deposit", "withdrawal"])("accepts a valid %s", (type) => {
    expect(validateCapitalMovement({ type, amount: 100, currency: "EUR", date: "2026-07-26", comment: "" }))
      .toMatchObject({ type, amount: 100, currency: "EUR", date: "2026-07-26", comment: null });
  });

  it("rejects invalid amounts and impossible dates", () => {
    expect(() => validateCapitalMovement({ type: "deposit", amount: 0, currency: "EUR", date: "2026-07-26", comment: "" })).toThrow();
    expect(() => validateCapitalMovement({ type: "withdrawal", amount: 100, currency: "EUR", date: "2026-02-30", comment: "" })).toThrow();
  });
});

describe("regular position form boundary", () => {
  const source = readFileSync(new URL("../src/components/position-form.tsx", import.meta.url), "utf8");

  it("contains the simple required product fields", () => {
    for (const field of ["ticker", "category_id", "instrument_type", "direction", "quantity", "instrument_currency", "entry_price", "entry_date", "stop_price"]) {
      expect(source).toContain(`name="${field}"`);
    }
  });

  it("does not expose technical market-data or provider fields", () => {
    for (const field of ["current_fx_to_base", "entry_fx_to_base", "current_price_source", "current_price_status", "current_price_as_of", "current_fx_source", "current_fx_status", "external_position_id", "source_import_id"]) {
      expect(source).not.toContain(`name="${field}"`);
    }
  });

  it("requires a current price as the reliable manual fallback", () => {
    expect(source).toContain('name="current_price" required');
    expect(source).toContain("Ein späterer gültiger IBKR-Kurs hat automatisch Vorrang.");
  });

  it("offers a ticker-based company and main-listing quote lookup", () => {
    expect(source).toContain("Unternehmen & Kurs suchen");
    expect(source).toContain("lookupPositionMarketData");
    expect(source).toContain("formNoValidate");
    expect(source).toContain("automatisch gewählte Hauptnotierung");
  });
});
