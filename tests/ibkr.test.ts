import { describe, it, expect } from "vitest";
import { IbkrGateway, isAllowedGatewayRequest } from "../src/lib/ibkr/gateway";
import { ibkrNumber, ibkrQuoteMatchesPosition, ibkrQuoteStatus, parseIbkrOccSymbol, validateIbkrQuote, type IbkrQuote } from "../src/lib/ibkr/core";
import type { Position, PositionPriceObservation } from "../src/lib/database.types";
import { resolvePositionPrice } from "../src/lib/price-resolution";

const now = Date.now();
const quote: IbkrQuote = { conid: 12345, symbol: "TEST", name: "Synthetic Company", currency: "EUR", mic: "XETR",
  assetClass: "STK", isin: null, multiplier: 1, expiry: null, strike: null, right: null,
  price: 12.5, bid: 12.4, ask: 12.6, quality: "live", observedAt: new Date(now).toISOString(), fetchedAt: new Date(now).toISOString() };
const position = { id: "p", ticker: "ETR:TEST", instrument_currency: "EUR", instrument_type: "stock", multiplier: 1,
  expiration_date: null, strike_price: null, option_type: null, direction: "long", source_type: "manual", current_price: 10, current_price_native: 10 } as Position;
const observation = (overrides: Partial<PositionPriceObservation>) => ({ position_id: "p", ticker: "ETR:TEST", currency: "EUR",
  price_native: 12.5, source_type: "ibkr", source_name: "IBKR", status: "live", source_reference: "ibkr:12345:last",
  observed_at: new Date(now).toISOString(), ...overrides } as PositionPriceObservation);

describe("IBKR read-only boundary and normalization", () => {
  it("refuses order writes, account changes, remote destinations and paid snapshot flags", () => {
    for (const path of ["/iserver/account/U123/orders", "/iserver/account/U123/order/1", "/logout", "/iserver/auth/ssodh/init"]) {
      for (const method of ["GET", "POST", "DELETE", "PUT"]) expect(isAllowedGatewayRequest(method, path)).toBe(false);
    }
    expect(isAllowedGatewayRequest("GET", "https://example.com/portfolio/accounts")).toBe(false);
    expect(isAllowedGatewayRequest("GET", "/iserver/marketdata/snapshot?conids=1&regulatorySnapshot=true")).toBe(false);
    expect(isAllowedGatewayRequest("GET", "/iserver/marketdata/snapshot?conids=1&fields=31,6509")).toBe(true);
    expect(isAllowedGatewayRequest("POST", "/iserver/auth/status")).toBe(true);
    expect(() => new IbkrGateway("https://example.com/v1/api")).toThrow();
    expect(() => new IbkrGateway("http://127.0.0.1:5055/v1/api")).toThrow();
  });
  it("does not turn missing, decorated or sentinel prices into zero", () => {
    for (const value of [null, undefined, "", "N/A", -1, "-1", Infinity, "12 USD", "12,34"]) expect(ibkrNumber(value)).toBeNull();
    expect(ibkrNumber("C1,234.50")).toBe(1234.5);
    expect(ibkrNumber(0)).toBe(0);
  });
  it("rejects inconsistent quote payloads and matches exchange and currency", () => {
    expect(validateIbkrQuote(quote, now)).toEqual(quote);
    expect(validateIbkrQuote({ ...quote, currency: "USDollars" }, now)).toBeNull();
    expect(validateIbkrQuote({ ...quote, price: NaN }, now)).toBeNull();
    expect(ibkrQuoteMatchesPosition(quote, position)).toBe(true);
    expect(ibkrQuoteMatchesPosition({ ...quote, currency: "USD" }, position)).toBe(false);
    expect(ibkrQuoteMatchesPosition({ ...quote, mic: "XPAR" }, position)).toBe(false);
    expect(ibkrQuoteMatchesPosition(quote, { ...position, ticker: "XXX:TEST" })).toBe(false);
    expect(ibkrQuoteMatchesPosition(quote, { ...position, ticker: "XETR:TEST" })).toBe(true);
  });
  it("matches the entire options contract and multiplier, never just the underlying", () => {
    expect(parseIbkrOccSymbol("SYNTH 270617C00132000")).toEqual({ root: "SYNTH", expiry: "2027-06-17", right: "C", strike: 132 });
    expect(parseIbkrOccSymbol("SYNTH 270231C00132000")).toBeNull();
    const option = { ...quote, assetClass: "OPT" as const, mic: null, symbol: "SYNTH", expiry: "2027-06-17", strike: 132, right: "C" as const, multiplier: 100 };
    const lot = { ...position, ticker: "SYNTH Jun17'27 132 CALL", instrument_type: "option", direction: "long_call", expiration_date: "2027-06-17", strike_price: 132, option_type: "call", multiplier: 100 };
    expect(ibkrQuoteMatchesPosition(option, lot)).toBe(true);
    expect(ibkrQuoteMatchesPosition({ ...option, multiplier: 1 }, lot)).toBe(false);
    expect(ibkrQuoteMatchesPosition({ ...option, expiry: "2027-07-17" }, lot)).toBe(false);
    expect(ibkrQuoteMatchesPosition({ ...option, right: "P" }, lot)).toBe(false);
    expect(validateIbkrQuote({ ...option, strike: null }, now)).toBeNull();
  });
  it("keeps account valuations distinct from real-time and expires disconnected data", () => {
    expect(ibkrQuoteStatus({ ...quote, quality: "broker_valuation" }, now)).toBe("manually_updated");
    expect(ibkrQuoteStatus(quote, now + 6 * 60_000)).toBe("stale");
    const old = observation({ observed_at: new Date(now - 16 * 60_000).toISOString() });
    const provider = observation({ source_type: "market_data_provider", source_name: "Provider", price_native: 13, source_reference: null });
    expect(resolvePositionPrice(position, [old, provider])?.price).toBe(13);
    expect(resolvePositionPrice(position, [observation({ source_name: "IBKR-Depotbewertung · Kurszeit unbestätigt", status: "manually_updated" }), provider])?.price).toBe(13);
    expect(resolvePositionPrice(position, [observation({}), provider])?.price).toBe(12.5);
  });
});
