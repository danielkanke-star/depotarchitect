import "server-only";
import { fetchHistoricalReferenceRate } from "@/lib/market-data-providers/fx-core";
import type { Trade } from "@/lib/trade-import";

export async function completeTradeConversions(trades: Trade[], currency: string) {
  const pairs = new Map<string, { from: string; date: string }>();
  for (const trade of trades) {
    if (trade.currency !== currency && !trade.conversion) pairs.set(`${trade.currency}/${trade.date}`, { from: trade.currency, date: trade.date });
  }
  // Large files are common. One series request per currency, instead of one request per booking.
  const rates = new Map<string, Map<string, { rate: number; date: string; source: string }>>();
  const currencies = [...new Set([...pairs.values()].map(pair => pair.from))];
  for (let start = 0; start < currencies.length; start += 6) {
    await Promise.all(currencies.slice(start, start + 6).map(async from => {
      const dates = [...pairs.values()].filter(pair => pair.from === from).map(pair => pair.date).sort();
      const values = dates.length < 3
        ? new Map(await Promise.all(dates.map(async date => [date, await fetchHistoricalReferenceRate(from, currency, date)] as const)))
        : await fetchSeries(from, currency, dates);
      rates.set(from, new Map([...values].flatMap(([date, rate]) => rate ? [[date, rate]] : [])));
    }));
  }
  return trades.map(trade => {
    const rate = rates.get(trade.currency)?.get(trade.date);
    return !trade.conversion && rate ? { ...trade, conversion: rate.rate.toFixed(12).replace(/0+$/, "").replace(/\.$/, ""), conversionSource: rate.source } : trade;
  });
}

async function fetchSeries(from: string, to: string, dates: string[]) {
  const found = new Map<string, { rate: number; date: string; source: string }>();
  const lower = Date.parse(dates[0]) - 7 * 86_400_000;
  const upper = Date.parse(dates[dates.length - 1]);
  if (upper - lower > 15 * 366 * 86_400_000) return found;
  const url = new URL("https://api.frankfurter.dev/v2/rates");
  url.search = new URLSearchParams({ base: from, quotes: to, providers: "ecb",
    from: new Date(lower).toISOString().slice(0, 10), to: dates[dates.length - 1] }).toString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4500), next: { revalidate: 86_400 } });
    if (!response.ok) return found;
    const items = await response.json() as { base: string; quote: string; date: string; rate: number }[];
    if (!Array.isArray(items)) return found;
    const observations = items.filter(item => item.base === from && item.quote === to && item.rate > 0 && Number.isFinite(item.rate) &&
      /^\d{4}-\d{2}-\d{2}$/.test(item.date)).sort((a, b) => a.date.localeCompare(b.date));
    let index = 0;
    for (const date of dates) {
      while (index + 1 < observations.length && observations[index + 1].date <= date) index++;
      const item = observations[index];
      if (item && item.date <= date && Date.parse(date) - Date.parse(item.date) <= 7 * 86_400_000) {
        found.set(date, { rate: item.rate, date: item.date, source: `EZB-Tagesreferenz ${item.date}` });
      }
    }
  } catch { /* Keep unavailable conversions empty. */ }
  return found;
}
