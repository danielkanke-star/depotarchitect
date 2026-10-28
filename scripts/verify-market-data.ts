/** Release smoke check. Outputs public market data only, never credentials. */
import { searchTwelveDataInstruments, fetchTwelveDataQuote } from "../src/lib/market-data-providers/twelve-data-core";
import { fetchFxRate, fetchReferenceFxRate } from "../src/lib/market-data-providers/fx-core";
import { calculateSizing } from "../src/lib/risk-rules";

async function main() {
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!apiKey) throw new Error("TWELVE_DATA_API_KEY fehlt; echter Kursabruf nicht prüfbar.");
  const result = await searchTwelveDataInstruments("AMZN", { apiKey });
  if (result.status !== "success") throw new Error(`Instrumentensuche fehlgeschlagen: ${result.status}`);
  const listing = result.data.find(item => item.symbol === "AMZN" && item.currency === "USD");
  if (!listing) throw new Error("AMZN-Notierung in USD nicht gefunden.");
  const quote = await fetchTwelveDataQuote(listing, { apiKey });
  if (quote.status !== "success" || quote.data.price <= 0) throw new Error(`Echter AMZN-Kurs fehlgeschlagen: ${quote.status}`);
  const current = await fetchFxRate("USD", "EUR", apiKey);
  const usd = current && !("error" in current) ? current : await fetchReferenceFxRate("USD", "EUR");
  const chf = await fetchReferenceFxRate("CHF", "EUR");
  if (!usd || !chf) throw new Error("Automatische USD-/CHF-Umrechnung fehlgeschlagen.");
  const sizing = calculateSizing({ netLiquidity: 100000, existingRisk: 10000, riskComplete: true, riskPct: 1.2,
    entry: quote.data.price, stop: quote.data.price * 0.9, fxToBase: usd.rate, step: 0.001, direction: "long" });
  if (sizing.error || sizing.quantity <= 0 || sizing.actualRisk > 1080) throw new Error("Positionsberechnung mit echten Kursdaten fehlgeschlagen.");
  console.log(JSON.stringify({ verification: "market-data-release", result: "passed", symbol: quote.data.symbol, currency: quote.data.currency,
    price: quote.data.price, observedAt: quote.data.observedAt, usdToEur: usd, chfToEur: chf, sizing }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Kursprüfung fehlgeschlagen."); process.exitCode = 1; });
