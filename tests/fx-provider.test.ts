import { describe, expect, it } from "vitest";
import { fetchFxRate, fetchReferenceFxRate } from "../src/lib/market-data-providers/fx-core";
const fetcher = (body: object, status=200) => (async () => new Response(JSON.stringify(body),{status})) as typeof fetch;
describe("FX direction and provider failures", () => {
  it("requests the direct native-to-base pair without guessing company nationality", async () => {
    let requested = "";
    const result = await fetchFxRate("CHF","EUR","synthetic-key",(async url => { requested=String(url); return new Response(JSON.stringify({symbol:"CHF/EUR",rate:1.05,timestamp:Math.floor(Date.now()/1000)})); }) as typeof fetch);
    expect(new URL(requested).searchParams.get("symbol")).toBe("CHF/EUR"); expect(result && "rate" in result ? result.rate : null).toBe(1.05);
  });
  it("refuses a wrong pair, invalid number and future timestamp", async () => {
    expect(await fetchFxRate("USD","EUR","test",fetcher({symbol:"EUR/USD",rate:1.1,timestamp:1}))).toBeNull();
    expect(await fetchFxRate("USD","EUR","test",fetcher({symbol:"USD/EUR",rate:0,timestamp:1}))).toBeNull();
    expect(await fetchFxRate("USD","EUR","test",fetcher({symbol:"USD/EUR",rate:0.9,timestamp:Date.now()/1000+10000}))).toBeNull();
  });
  it("distinguishes rate limits for the one-hour backoff", async () => {
    expect(await fetchFxRate("USD","EUR","test",fetcher({},429))).toEqual({error:"rate_limited"});
    expect(await fetchFxRate("USD","EUR","test",fetcher({},500))).toBeNull();
  });
});

describe("automatic daily exchange-rate fallback", () => {
  const date = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  it("loads the exact CHF-to-EUR pair and keeps the reference date", async () => {
    let requested = "";
    const result = await fetchReferenceFxRate("CHF", "EUR", (async url => {
      requested = String(url);
      return new Response(JSON.stringify({ base: "CHF", quote: "EUR", rate: 1.08, date }));
    }) as typeof fetch);
    expect(new URL(requested).pathname).toBe("/v2/rate/chf/eur");
    expect(new URL(requested).searchParams.get("providers")).toBe("ecb");
    expect(result).toEqual({ rate: 1.08, asOf: `${date}T00:00:00.000Z` });
  });
  it("rejects inverted pairs, non-positive rates and obsolete references", async () => {
    expect(await fetchReferenceFxRate("USD", "EUR", fetcher({ base:"EUR", quote:"USD", rate:1.1, date }))).toBeNull();
    expect(await fetchReferenceFxRate("USD", "EUR", fetcher({ base:"USD", quote:"EUR", rate:0, date }))).toBeNull();
    expect(await fetchReferenceFxRate("USD", "EUR", fetcher({ base:"USD", quote:"EUR", rate:0.9, date:"2000-01-01" }))).toBeNull();
    const future = new Date(Date.now()+86400000).toISOString().slice(0,10);
    expect(await fetchReferenceFxRate("USD", "EUR", fetcher({ base:"USD", quote:"EUR", rate:0.9, date:future }))).toBeNull();
  });
  it("does not invent a rate on network or provider failure", async () => {
    expect(await fetchReferenceFxRate("USD", "EUR", fetcher({}, 500))).toBeNull();
    expect(await fetchReferenceFxRate("USD", "EUR", (async()=>{throw new Error("offline");}) as typeof fetch)).toBeNull();
  });
  it("needs no provider for an identical currency", async () => {
    expect((await fetchReferenceFxRate("EUR", "EUR", fetcher({}, 500)))?.rate).toBe(1);
  });
});
