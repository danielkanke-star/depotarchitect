import { describe, expect, it } from "vitest";
import type { Position, PositionPriceObservation, PositionPriceSourceType } from "../src/lib/database.types";
import { resolvePositionPrice } from "../src/lib/price-resolution";

const basePosition = {
  id: "position-1",
  ticker: "SAP",
  instrument_currency: "EUR",
  current_price: 90,
  current_price_native: 90,
  current_price_status: "manually_updated",
  current_price_source: "manual",
  current_price_as_of: "2026-07-29T10:00:00.000Z",
  source_type: "manual",
} as Position;

function observation(
  sourceType: PositionPriceSourceType,
  price: number,
  overrides: Partial<PositionPriceObservation> = {},
): PositionPriceObservation {
  return {
    id: `${sourceType}-${price}`,
    user_id: "user-1",
    portfolio_id: "portfolio-1",
    position_id: "position-1",
    ticker: "SAP",
    currency: "EUR",
    price_native: price,
    source_type: sourceType,
    source_name: sourceType,
    observed_at: "2026-07-30T10:00:00.000Z",
    status: sourceType === "ibkr" ? "live" : "manually_updated",
    source_reference: null,
    created_at: "2026-07-30T10:00:00.000Z",
    ...overrides,
  };
}

describe("current price source resolution", () => {
  it("gives a usable IBKR quote precedence over every fallback", () => {
    const resolved = resolvePositionPrice(basePosition, [
      observation("manual", 100),
      observation("market_data_provider", 101),
      observation("custom_csv", 102),
      observation("google_sheets", 103),
      observation("broker", 104),
      observation("ibkr", 105),
    ]);

    expect(resolved).toMatchObject({ price: 105, sourceType: "ibkr", status: "live" });
  });

  it("uses a valid import instead of stale IBKR data", () => {
    const resolved = resolvePositionPrice(basePosition, [
      observation("ibkr", 105, { status: "stale" }),
      observation("google_sheets", 103),
    ]);

    expect(resolved).toMatchObject({ price: 103, sourceType: "google_sheets" });
  });

  it("uses Google Sheets, provider and manual in descending fallback order", () => {
    expect(resolvePositionPrice(basePosition, [
      observation("manual", 100),
      observation("market_data_provider", 101),
      observation("google_sheets", 102),
    ])).toMatchObject({ price: 102, sourceType: "google_sheets" });

    expect(resolvePositionPrice(basePosition, [
      observation("manual", 100),
      observation("market_data_provider", 101),
    ])).toMatchObject({ price: 101, sourceType: "market_data_provider" });
  });

  it("uses the newest observation within the same source quality", () => {
    const resolved = resolvePositionPrice(basePosition, [
      observation("custom_csv", 100, { id: "old", observed_at: "2026-07-29T10:00:00.000Z" }),
      observation("custom_csv", 110, { id: "new", observed_at: "2026-07-30T10:00:00.000Z" }),
    ]);

    expect(resolved?.price).toBe(110);
  });

  it("ignores quotes for an old ticker or another currency", () => {
    const resolved = resolvePositionPrice(basePosition, [
      observation("ibkr", 120, { ticker: "OLD" }),
      observation("ibkr", 130, { currency: "USD" }),
      observation("manual", 100),
    ]);

    expect(resolved).toMatchObject({ price: 100, sourceType: "manual" });
  });

  it("falls back to a usable legacy price and never accepts demo data", () => {
    expect(resolvePositionPrice(basePosition, [])).toMatchObject({ price: 90, sourceType: "manual" });
    expect(resolvePositionPrice({ ...basePosition, source_type: "demo" }, [
      observation("manual", 100),
    ])).toBeNull();
  });
});
