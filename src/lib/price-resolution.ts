import type {
  Position,
  PositionPriceObservation,
  PositionPriceSourceType,
} from "./database.types";
import { canonicalMarketDataStatus, isUsableRealMarketData } from "./market-data";
import type { MarketDataStatus } from "./calculations/calculation-types";

const SOURCE_PRIORITY: Record<PositionPriceSourceType, number> = {
  ibkr: 600,
  broker: 550,
  market_data_provider: 500,
  google_sheets: 400,
  custom_csv: 390,
  manual: 200,
  legacy: 100,
};

export type ResolvedPositionPrice = {
  price: number;
  currency: string;
  status: MarketDataStatus;
  sourceType: PositionPriceSourceType;
  sourceName: string;
  observedAt: string | null;
};

/**
 * Resolves one canonical current price without overwriting source observations.
 * A usable IBKR value has the highest authority. Stale values only compete when
 * no non-stale observation is available.
 */
export function resolvePositionPrice(
  position: Pick<Position,
    "id" | "ticker" | "instrument_currency" | "current_price_native" | "current_price"
    | "current_price_status" | "current_price_source" | "current_price_as_of" | "source_type"
  >,
  observations: PositionPriceObservation[],
): ResolvedPositionPrice | null {
  if (position.source_type === "demo") return null;

  const ticker = position.ticker.trim().toUpperCase();
  const currency = position.instrument_currency?.trim().toUpperCase();
  if (!ticker || !currency) return null;

  const candidates = observations
    .filter((observation) =>
      observation.position_id === position.id
      && observation.ticker.trim().toUpperCase() === ticker
      && observation.currency.trim().toUpperCase() === currency
      && Number.isFinite(Number(observation.price_native))
      && Number(observation.price_native) >= 0)
    .map((observation) => ({
      price: Number(observation.price_native),
      currency,
      status: canonicalMarketDataStatus(observation.status, observation.source_type),
      sourceType: observation.source_type,
      sourceName: observation.source_name,
      observedAt: observation.observed_at,
    }))
    .filter((candidate) => isUsableRealMarketData(candidate.status));

  const freshCandidates = candidates.filter((candidate) => candidate.status !== "stale");
  const selected = [...(freshCandidates.length > 0 ? freshCandidates : candidates)].sort(compareCandidates)[0];
  if (selected) return selected;

  const legacyPrice = position.current_price_native ?? position.current_price;
  const legacyStatus = canonicalMarketDataStatus(
    position.current_price_status,
    position.source_type,
    legacyPrice !== null,
  );
  if (
    legacyPrice === null
    || !Number.isFinite(Number(legacyPrice))
    || Number(legacyPrice) < 0
    || !isUsableRealMarketData(legacyStatus)
  ) return null;

  return {
    price: Number(legacyPrice),
    currency,
    status: legacyStatus,
    sourceType: legacySourceType(position),
    sourceName: position.current_price_source?.trim() || "Legacy-Kurs",
    observedAt: position.current_price_as_of,
  };
}

export function positionPriceSourceLabel(sourceType: PositionPriceSourceType) {
  return ({
    ibkr: "IBKR",
    broker: "Broker",
    google_sheets: "Google Sheets",
    custom_csv: "CSV-Import",
    market_data_provider: "Marktdatenanbieter",
    manual: "Manuell",
    legacy: "Legacy",
  } as const)[sourceType];
}

function compareCandidates(a: ResolvedPositionPrice, b: ResolvedPositionPrice) {
  const priorityDifference = SOURCE_PRIORITY[b.sourceType] - SOURCE_PRIORITY[a.sourceType];
  if (priorityDifference !== 0) return priorityDifference;
  return timestamp(b.observedAt) - timestamp(a.observedAt);
}

function timestamp(value: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function legacySourceType(
  position: Pick<Position, "current_price_source" | "source_type">,
): PositionPriceSourceType {
  const source = position.current_price_source?.trim().toLowerCase() ?? "";
  if (source.includes("ibkr") || source.includes("interactive brokers")) return "ibkr";
  if (source.includes("broker")) return "broker";
  if (source.includes("google") && source.includes("sheet")) return "google_sheets";
  if (position.source_type === "custom_csv" || position.source_type === "csv") return "custom_csv";
  if (source.includes("provider") || source.includes("market")) return "market_data_provider";
  if (position.source_type === "manual" || source.includes("manual") || source.includes("manuell")) return "manual";
  return "legacy";
}
