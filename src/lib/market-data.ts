import type {
  MarketDataStatus as DatabaseMarketDataStatus,
  Portfolio,
  PortfolioCashBalance,
  PortfolioFxRate,
  Position,
} from "@/lib/database.types";
import type { MarketDataStatus } from "@/lib/calculations/calculation-types";

const USABLE_REAL_STATUSES = new Set<MarketDataStatus>([
  "live",
  "delayed",
  "end_of_day",
  "manually_updated",
  "stale",
]);

export function canonicalMarketDataStatus(
  status: DatabaseMarketDataStatus | string | null | undefined,
  sourceType?: string | null,
  hasValue = true,
): MarketDataStatus {
  if (!hasValue) return "missing";
  if (sourceType === "demo" || status === "demo") return "demo";
  if (status === "closing") return "end_of_day";
  if (status === "manual" || status === "imported") return "manually_updated";
  if (
    status === "live"
    || status === "delayed"
    || status === "end_of_day"
    || status === "manually_updated"
    || status === "stale"
    || status === "missing"
  ) return status;
  return "stale";
}

export function isUsableRealMarketData(status: MarketDataStatus) {
  return USABLE_REAL_STATUSES.has(status);
}

export function latestUsableFxRate(
  rates: PortfolioFxRate[],
  sourceCurrency: string,
  targetCurrency: string,
) {
  const source = sourceCurrency.trim().toUpperCase();
  const target = targetCurrency.trim().toUpperCase();
  if (source === target) {
    return {
      rate: 1,
      status: "manually_updated" as const,
      source: "identity",
      asOf: null,
    };
  }

  const rate = rates
    .filter((candidate) =>
      candidate.source_currency === source
      && candidate.target_currency === target
      && isUsableRealMarketData(canonicalMarketDataStatus(candidate.status, candidate.source_type)))
    .sort((a, b) => Date.parse(b.rate_as_of) - Date.parse(a.rate_as_of))[0];

  return rate
    ? {
        rate: Number(rate.rate),
        status: canonicalMarketDataStatus(rate.status, rate.source_type),
        source: rate.source_name,
        asOf: rate.rate_as_of,
      }
    : null;
}

export type PortfolioDataQuality = {
  securityPositionCount: number;
  positionsWithRealPrice: number;
  positionsWithStop: number;
  positionsWithReliableMargin: number;
  requiredFxPairCount: number;
  completeFxPairCount: number;
  stalePriceCount: number;
  demoPriceCount: number;
  demoFxCount: number;
  oldestPriceAsOf: string | null;
};

export function calculatePortfolioDataQuality({
  portfolio,
  positions,
  cashBalances,
  fxRates,
}: {
  portfolio: Pick<Portfolio, "currency">;
  positions: Position[];
  cashBalances: PortfolioCashBalance[];
  fxRates: PortfolioFxRate[];
}): PortfolioDataQuality {
  const baseCurrency = portfolio.currency.trim().toUpperCase();
  const securities = positions.filter((position) => position.instrument_type !== "cash");
  const priceStatuses = securities.map((position) =>
    canonicalMarketDataStatus(
      position.current_price_status,
      position.source_type,
      (position.current_price_native ?? position.current_price) !== null,
    ));
  const requiredCurrencies = new Set([
    ...securities.map((position) => position.instrument_currency?.trim().toUpperCase()).filter(Boolean),
    ...cashBalances.map((balance) => balance.currency.trim().toUpperCase()),
  ].filter((currency): currency is string => Boolean(currency) && currency !== baseCurrency));

  const completeFxPairCount = [...requiredCurrencies].filter((currency) =>
    latestUsableFxRate(fxRates, currency, baseCurrency)
    || securities.some((position) =>
      position.instrument_currency?.trim().toUpperCase() === currency
      && position.current_fx_to_base !== null
      && isUsableRealMarketData(canonicalMarketDataStatus(position.current_fx_status, position.source_type)))
    || cashBalances.some((balance) =>
      balance.currency.trim().toUpperCase() === currency
      && balance.current_fx_to_base !== null
      && isUsableRealMarketData(canonicalMarketDataStatus(balance.fx_status, balance.source_type)))
  ).length;

  const realPriceTimes = securities.flatMap((position, index) => {
    if (!isUsableRealMarketData(priceStatuses[index]) || !position.current_price_as_of) return [];
    const timestamp = Date.parse(position.current_price_as_of);
    return Number.isNaN(timestamp) ? [] : [{ value: position.current_price_as_of, timestamp }];
  });

  return {
    securityPositionCount: securities.length,
    positionsWithRealPrice: priceStatuses.filter(isUsableRealMarketData).length,
    positionsWithStop: securities.filter((position) => (position.stop_price_native ?? position.stop_price) !== null).length,
    positionsWithReliableMargin: securities.filter((position) =>
      position.margin_source !== "missing"
      && position.margin_source !== "legacy_untrusted"
      && position.margin_confidence !== "untrusted"
      && position.margin_confidence !== "missing").length,
    requiredFxPairCount: requiredCurrencies.size,
    completeFxPairCount,
    stalePriceCount: priceStatuses.filter((status) => status === "stale").length,
    demoPriceCount: priceStatuses.filter((status) => status === "demo").length,
    demoFxCount: fxRates.filter((rate) => canonicalMarketDataStatus(rate.status, rate.source_type) === "demo").length,
    oldestPriceAsOf: realPriceTimes.sort((a, b) => a.timestamp - b.timestamp)[0]?.value ?? null,
  };
}
