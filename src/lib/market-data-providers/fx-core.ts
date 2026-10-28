export async function fetchFxRate(from: string, to: string, apiKey: string, fetcher: typeof fetch = fetch) {
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return null;
  if (from === to) return { rate: 1, asOf: new Date().toISOString() };
  try {
    const url = new URL("https://api.twelvedata.com/exchange_rate");
    url.searchParams.set("symbol", `${from}/${to}`); url.searchParams.set("apikey", apiKey); url.searchParams.set("dp", "10");
    const response = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (response.status === 429) return { error: "rate_limited" } as const;
    if (!response.ok) return null;
    const data = await response.json() as { symbol?: string; rate?: number; timestamp?: number };
    if (data.symbol !== `${from}/${to}` || !Number.isFinite(data.rate) || data.rate! <= 0 || !Number.isFinite(data.timestamp)) return null;
    const asOf = new Date(data.timestamp! * 1000);
    if (!Number.isFinite(asOf.getTime()) || asOf.getTime() > Date.now() + 300000) return null;
    return { rate: data.rate!, asOf: asOf.toISOString() };
  } catch { return null; }
}
