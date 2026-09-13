import { describe, expect, it } from "vitest";
import {
  assertBaseCurrencyChangeAllowed,
  isBaseCurrencyLocked,
  resolveWritableInstrumentType,
} from "../src/lib/portfolio-write-policy";

describe("savePosition instrument policy", () => {
  it("rejects a new cash position", () => {
    expect(() => resolveWritableInstrumentType("cash", null)).toThrow(
      "Cashbestände dürfen nur als Währungs-Cashbestand gespeichert werden.",
    );
  });

  it("keeps an existing legacy cash position readable and unchanged", () => {
    expect(resolveWritableInstrumentType("cash", "cash")).toBe("cash");
  });

  it("prevents converting legacy cash into a security", () => {
    expect(() => resolveWritableInstrumentType("stock", "cash")).toThrow(
      "Eine Legacy-Cashposition darf nicht in eine Wertpapierposition umgewandelt werden.",
    );
  });

  it("prevents converting a security into cash", () => {
    expect(() => resolveWritableInstrumentType("cash", "stock")).toThrow(
      "Cashbestände dürfen nur als Währungs-Cashbestand gespeichert werden.",
    );
  });
});

describe("base-currency write policy", () => {
  it("allows a change when neither positions nor cash balances exist", () => {
    expect(() => assertBaseCurrencyChangeAllowed({
      currentCurrency: "EUR",
      requestedCurrency: "USD",
      positionCount: 0,
      cashBalanceCount: 0,
    })).not.toThrow();
    expect(isBaseCurrencyLocked(0, 0)).toBe(false);
  });

  it("rejects a change when a position exists", () => {
    expect(() => assertBaseCurrencyChangeAllowed({
      currentCurrency: "EUR",
      requestedCurrency: "USD",
      positionCount: 1,
      cashBalanceCount: 0,
    })).toThrow("Die Basiswährung kann bei vorhandenen Positionen oder Cashbeständen nicht geändert werden.");
  });

  it("rejects a change when a cash balance exists", () => {
    expect(() => assertBaseCurrencyChangeAllowed({
      currentCurrency: "EUR",
      requestedCurrency: "USD",
      positionCount: 0,
      cashBalanceCount: 1,
    })).toThrow("Die Basiswährung kann bei vorhandenen Positionen oder Cashbeständen nicht geändert werden.");
  });

  it("allows saving the unchanged currency when data exists", () => {
    expect(() => assertBaseCurrencyChangeAllowed({
      currentCurrency: "EUR",
      requestedCurrency: "eur",
      positionCount: 1,
      cashBalanceCount: 1,
    })).not.toThrow();
  });
});
