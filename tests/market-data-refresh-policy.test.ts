import { describe, expect, it } from "vitest";
import {
  canSpendProviderCredit,
  needsRefresh,
  selectAutomaticRefresh,
  uniqueFxPairs,
  uniqueListings,
} from "../src/lib/market-data-refresh-policy";

describe("central market-data refresh policy", () => {
  it("deduplicates 50 positions to 35 exact listing tuples", () => {
    const listings = Array.from({ length: 50 }, (_, index) => ({
      symbol: `S${index % 35}`,
      micCode: "XNAS",
      currency: "USD",
    }));
    expect(uniqueListings(listings)).toHaveLength(35);
  });

  it("reserves provider capacity for interactive requests", () => {
    expect(canSpendProviderCredit({ minuteRequests: 6, dayRequests: 650 }, "automatic")).toBe(false);
    expect(canSpendProviderCredit({ minuteRequests: 6, dayRequests: 650 }, "interactive")).toBe(true);
    expect(canSpendProviderCredit({ minuteRequests: 8, dayRequests: 650 }, "interactive")).toBe(false);
    expect(canSpendProviderCredit({ minuteRequests: 0, dayRequests: 800 }, "interactive")).toBe(false);
  });

  it("uses 60 minutes for active markets and refreshes closed markets conservatively", () => {
    const now = new Date("2026-08-08T12:00:00Z");
    const base = { listingId: "a", symbol: "AAPL", micCode: "XNAS", currency: "USD", positionCount: 1, watchlisted: false };
    expect(needsRefresh({ ...base, lastFetchedAt: "2026-08-08T10:59:59Z", isMarketOpen: true }, now)).toBe(true);
    expect(needsRefresh({ ...base, lastFetchedAt: "2026-08-08T04:00:00Z", isMarketOpen: false }, now)).toBe(false);
    expect(needsRefresh({ ...base, lastFetchedAt: "2026-08-07T23:59:59Z", isMarketOpen: false }, now)).toBe(true);
  });

  it("prioritizes stale active holdings without refreshing duplicates", () => {
    const now = new Date("2026-08-08T12:00:00Z");
    const candidate = selectAutomaticRefresh([
      { listingId: "watch", symbol: "MSFT", micCode: "XNAS", currency: "USD", lastFetchedAt: null, isMarketOpen: true, positionCount: 0, watchlisted: true },
      { listingId: "position", symbol: "AAPL", micCode: "XNAS", currency: "USD", lastFetchedAt: null, isMarketOpen: true, positionCount: 2, watchlisted: false },
      { listingId: "duplicate", symbol: "AAPL", micCode: "XNAS", currency: "USD", lastFetchedAt: null, isMarketOpen: true, positionCount: 1, watchlisted: false },
    ], { minuteRequests: 0, dayRequests: 0 }, now);
    expect(candidate?.listingId).toBe("position");
  });

  it("deduplicates FX by canonical source/target pair and skips identity", () => {
    expect(uniqueFxPairs([
      { sourceCurrency: "usd", targetCurrency: "eur" },
      { sourceCurrency: "USD", targetCurrency: "EUR" },
      { sourceCurrency: "EUR", targetCurrency: "EUR" },
    ])).toEqual([{ sourceCurrency: "USD", targetCurrency: "EUR" }]);
  });
});
