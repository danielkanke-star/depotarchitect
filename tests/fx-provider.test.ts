import { describe, expect, it } from "vitest";
import { fetchFxRate } from "../src/lib/market-data-providers/fx-core";
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
