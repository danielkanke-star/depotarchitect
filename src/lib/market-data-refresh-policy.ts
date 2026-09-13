export const TWELVE_DATA_FREE_LIMITS = {
  providerMinute: 8,
  providerDay: 800,
  automaticMinute: 6,
  automaticDay: 650,
  interactiveReservePerDay: 150,
} as const;

export type ListingRefreshCandidate = {
  listingId: string;
  symbol: string;
  micCode: string;
  currency: string;
  lastFetchedAt: string | null;
  isMarketOpen: boolean | null;
  positionCount: number;
  watchlisted: boolean;
};

export type UsageSnapshot = {
  minuteRequests: number;
  dayRequests: number;
};

const ACTIVE_MAX_AGE_MS = 60 * 60 * 1_000;
const CLOSED_MARKET_MAX_AGE_MS = 12 * 60 * 60 * 1_000;
const WATCHLIST_MAX_AGE_MS = 6 * 60 * 60 * 1_000;

export function listingKey(input: Pick<ListingRefreshCandidate, "symbol" | "micCode" | "currency">) {
  return `${input.symbol.trim().toUpperCase()}@${input.micCode.trim().toUpperCase()}:${input.currency.trim().toUpperCase()}`;
}

export function uniqueListings<T extends Pick<ListingRefreshCandidate, "symbol" | "micCode" | "currency">>(items: T[]) {
  const unique = new Map<string, T>();
  for (const item of items) {
    const key = listingKey(item);
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

export function canSpendProviderCredit(
  usage: UsageSnapshot,
  mode: "automatic" | "interactive",
) {
  if (usage.minuteRequests >= TWELVE_DATA_FREE_LIMITS.providerMinute) return false;
  if (usage.dayRequests >= TWELVE_DATA_FREE_LIMITS.providerDay) return false;
  if (mode === "automatic") {
    return usage.minuteRequests < TWELVE_DATA_FREE_LIMITS.automaticMinute
      && usage.dayRequests < TWELVE_DATA_FREE_LIMITS.automaticDay;
  }
  return true;
}

export function needsRefresh(candidate: ListingRefreshCandidate, now = new Date()) {
  if (!candidate.lastFetchedAt) return true;
  const fetchedAt = Date.parse(candidate.lastFetchedAt);
  if (!Number.isFinite(fetchedAt)) return true;
  const maxAge = candidate.positionCount > 0
    ? candidate.isMarketOpen === false ? CLOSED_MARKET_MAX_AGE_MS : ACTIVE_MAX_AGE_MS
    : candidate.watchlisted ? WATCHLIST_MAX_AGE_MS : Number.POSITIVE_INFINITY;
  return now.getTime() - fetchedAt >= maxAge;
}

export function selectAutomaticRefresh(
  candidates: ListingRefreshCandidate[],
  usage: UsageSnapshot,
  now = new Date(),
) {
  if (!canSpendProviderCredit(usage, "automatic")) return null;
  return uniqueListings(candidates)
    .filter((candidate) => needsRefresh(candidate, now))
    .sort((left, right) => {
      if (left.positionCount !== right.positionCount) return right.positionCount - left.positionCount;
      return Date.parse(left.lastFetchedAt ?? "1970-01-01") - Date.parse(right.lastFetchedAt ?? "1970-01-01");
    })[0] ?? null;
}

export function uniqueFxPairs(pairs: Array<{ sourceCurrency: string; targetCurrency: string }>) {
  const result = new Map<string, { sourceCurrency: string; targetCurrency: string }>();
  for (const pair of pairs) {
    const sourceCurrency = pair.sourceCurrency.trim().toUpperCase();
    const targetCurrency = pair.targetCurrency.trim().toUpperCase();
    if (sourceCurrency === targetCurrency) continue;
    result.set(`${sourceCurrency}:${targetCurrency}`, { sourceCurrency, targetCurrency });
  }
  return [...result.values()];
}
