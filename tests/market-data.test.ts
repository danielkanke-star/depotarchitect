import { describe, expect, it } from "vitest";
import type { Portfolio, PortfolioCashBalance, PortfolioFxRate, Position } from "../src/lib/database.types";
import {
  calculatePortfolioDataQuality,
  canonicalMarketDataStatus,
  latestUsableFxRate,
} from "../src/lib/market-data";

const portfolio = { currency: "EUR" } as Portfolio;

function position(overrides: Partial<Position>): Position {
  return {
    id: "position",
    instrument_type: "stock",
    instrument_currency: "USD",
    current_price: 100,
    current_price_native: 100,
    current_price_status: "manually_updated",
    current_price_as_of: "2026-07-23T19:14:00.000Z",
    current_fx_to_base: null,
    current_fx_status: "missing",
    stop_price: 90,
    stop_price_native: 90,
    margin_source: "manual_direct",
    margin_confidence: "trusted",
    source_type: "manual",
    ...overrides,
  } as Position;
}

function fxRate(overrides: Partial<PortfolioFxRate> = {}): PortfolioFxRate {
  return {
    id: "fx",
    source_currency: "USD",
    target_currency: "EUR",
    rate: 0.8564,
    source_type: "manual",
    source_name: "Manuell",
    rate_as_of: "2026-07-23T19:14:00.000Z",
    status: "manually_updated",
    ...overrides,
  } as PortfolioFxRate;
}

describe("market-data provenance", () => {
  it("normalizes legacy statuses and preserves explicit demo", () => {
    expect(canonicalMarketDataStatus("closing", "manual")).toBe("end_of_day");
    expect(canonicalMarketDataStatus("manual", "manual")).toBe("manually_updated");
    expect(canonicalMarketDataStatus("live", "demo")).toBe("demo");
    expect(canonicalMarketDataStatus(null, "manual", false)).toBe("missing");
  });

  it("chooses the newest usable real FX and rejects demo-only quotes", () => {
    expect(latestUsableFxRate([fxRate()], "USD", "EUR")).toMatchObject({ rate: 0.8564 });
    expect(latestUsableFxRate([fxRate({ source_type: "demo", status: "demo" })], "USD", "EUR")).toBeNull();
    expect(latestUsableFxRate([], "EUR", "EUR")).toMatchObject({ rate: 1, source: "identity" });
  });

  it("reports prices, stops, FX completeness, margin and oldest timestamp", () => {
    const quality = calculatePortfolioDataQuality({
      portfolio,
      positions: [
        position({ id: "real" }),
        position({
          id: "demo",
          instrument_currency: "EUR",
          current_price_status: "demo",
          source_type: "demo",
          stop_price: null,
          stop_price_native: null,
          margin_source: "legacy_untrusted",
          margin_confidence: "untrusted",
        }),
      ],
      cashBalances: [{
        id: "cash",
        currency: "USD",
        current_fx_to_base: null,
        fx_status: "missing",
        source_type: "manual",
      } as PortfolioCashBalance],
      fxRates: [fxRate()],
    });

    expect(quality).toMatchObject({
      securityPositionCount: 2,
      positionsWithRealPrice: 1,
      positionsWithStop: 1,
      positionsWithReliableMargin: 1,
      requiredFxPairCount: 1,
      completeFxPairCount: 1,
      demoPriceCount: 1,
      oldestPriceAsOf: "2026-07-23T19:14:00.000Z",
    });
  });
});
