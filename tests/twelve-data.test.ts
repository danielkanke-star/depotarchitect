import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchTwelveDataQuote,
  findTwelveDataInstrument,
  searchTwelveDataInstruments,
  quoteStatus,
} from "../src/lib/market-data-providers/twelve-data-core";

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Twelve Data adapter", () => {
  it("preserves provider relevance order and complete listing tuples", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [
      { symbol: "AAPL", instrument_name: "Apple Inc", exchange: "NASDAQ", mic_code: "XNAS", currency: "USD", country: "United States", exchange_timezone: "America/New_York", access: { global: "Basic" } },
      { symbol: "APC", instrument_name: "Apple Inc", exchange: "Frankfurt", mic_code: "XFRA", currency: "EUR" },
    ], status: "ok" }));
    const result = await searchTwelveDataInstruments("Apple", { apiKey: "test", fetchImpl });
    expect(result).toMatchObject({ status: "success", data: [
      { symbol: "AAPL", micCode: "XNAS", currency: "USD", exchangeTimezone: "America/New_York", access: "Basic" },
      { symbol: "APC", micCode: "XFRA", currency: "EUR" },
    ] });
  });
  it("authenticates in a header and never puts the API key in the URL", async () => {
    let requestedUrl = "";
    let requestedAuthorization = "";
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedAuthorization = (init?.headers as Record<string, string>)?.Authorization ?? "";
      return jsonResponse({
        data: [{
          symbol: "SAP",
          instrument_name: "SAP SE",
          exchange: "Xetra",
          mic_code: "XETR",
          instrument_type: "Common Stock",
          currency: "EUR",
        }],
        status: "ok",
      });
    });

    const result = await findTwelveDataInstrument(
      { symbol: "SAP", currency: "EUR" },
      { apiKey: "secret-test-key", fetchImpl },
    );

    expect(result).toMatchObject({ status: "success", data: { micCode: "XETR" } });
    expect(requestedUrl).not.toContain("secret-test-key");
    expect(requestedAuthorization).toBe("apikey secret-test-key");
  });

  it("requires an unambiguous exact ticker and currency match", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      data: [
        { symbol: "SAP", exchange: "Xetra", mic_code: "XETR", currency: "EUR" },
        { symbol: "SAP", exchange: "NYSE", mic_code: "XNYS", currency: "USD" },
        { symbol: "SAP", exchange: "Tradegate", mic_code: "XGAT", currency: "EUR" },
      ],
      status: "ok",
    }));

    const result = await findTwelveDataInstrument(
      { symbol: "SAP", currency: "EUR" },
      { apiKey: "test", fetchImpl },
    );

    expect(result).toMatchObject({ status: "ambiguous" });
    if (result.status === "ambiguous") expect(result.candidates).toHaveLength(2);
  });

  it("normalizes a verified quote without claiming unverified live quality", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      symbol: "SAP",
      name: "SAP SE",
      exchange: "Xetra",
      mic_code: "XETR",
      currency: "EUR",
      close: "201.45",
      timestamp: 1785492000,
      last_quote_at: 1785492000,
      is_market_open: true,
    }));

    const result = await fetchTwelveDataQuote(
      { symbol: "SAP", currency: "EUR", micCode: "XETR" },
      { apiKey: "test", fetchImpl, now: new Date("2026-07-31T12:05:00Z") },
    );

    expect(result).toMatchObject({
      status: "success",
      data: {
        symbol: "SAP",
        micCode: "XETR",
        currency: "EUR",
        price: 201.45,
        status: "delayed",
      },
    });
  });

  it("uses the provider-selected main listing when no MIC is supplied", async () => {
    let requestedUrl = "";
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return jsonResponse({
        symbol: "SAP",
        name: "SAP SE",
        exchange: "Xetra",
        mic_code: "XETR",
        currency: "EUR",
        close: "201.45",
        timestamp: 1785492000,
        is_market_open: false,
      });
    });

    const result = await fetchTwelveDataQuote(
      { symbol: "SAP", currency: "EUR", micCode: null },
      { apiKey: "test", fetchImpl, now: new Date("2026-07-31T12:05:00Z") },
    );

    expect(requestedUrl).not.toContain("mic_code");
    expect(result).toMatchObject({
      status: "success",
      data: {
        name: "SAP SE",
        exchange: "Xetra",
        micCode: "XETR",
        price: 201.45,
        status: "end_of_day",
      },
    });
  });

  it("rejects a quote from another listing or currency", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      symbol: "SAP",
      exchange: "NYSE",
      mic_code: "XNYS",
      currency: "USD",
      close: "250",
      timestamp: 1785492000,
      is_market_open: true,
    }));

    await expect(fetchTwelveDataQuote(
      { symbol: "SAP", currency: "EUR", micCode: "XETR" },
      { apiKey: "test", fetchImpl },
    )).resolves.toEqual({ status: "invalid_response" });
  });

  it("handles provider limits and stale observations explicitly", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      status: "error",
      code: 429,
      message: "run out of API credits",
    }, 429));

    await expect(findTwelveDataInstrument(
      { symbol: "SAP", currency: "EUR" },
      { apiKey: "test", fetchImpl },
    )).resolves.toEqual({ status: "rate_limited" });
    expect(quoteStatus(
      new Date("2026-07-01T10:00:00Z"),
      false,
      new Date("2026-07-31T10:00:00Z"),
    )).toBe("stale");
  });
});
