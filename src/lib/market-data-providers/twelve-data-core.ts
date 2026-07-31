import type { MarketDataStatus } from "@/lib/calculations/calculation-types";

const API_BASE_URL = "https://api.twelvedata.com";
const REQUEST_TIMEOUT_MS = 5_000;
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1_000;

type FetchLike = typeof fetch;

type TwelveDataErrorResponse = {
  status?: string;
  code?: number;
  message?: string;
};

type SymbolSearchResponse = TwelveDataErrorResponse & {
  data?: Array<{
    symbol?: string;
    instrument_name?: string;
    exchange?: string;
    mic_code?: string;
    instrument_type?: string;
    currency?: string;
  }>;
};

type QuoteResponse = TwelveDataErrorResponse & {
  symbol?: string;
  name?: string;
  exchange?: string;
  mic_code?: string;
  currency?: string;
  close?: string;
  timestamp?: number;
  last_quote_at?: number;
  is_market_open?: boolean;
};

export type TwelveDataInstrument = {
  symbol: string;
  name: string | null;
  exchange: string | null;
  micCode: string;
  currency: string;
  instrumentType: string | null;
};

export type TwelveDataQuote = TwelveDataInstrument & {
  price: number;
  observedAt: string;
  status: Extract<MarketDataStatus, "delayed" | "end_of_day" | "stale">;
};

export type TwelveDataResult<T> =
  | { status: "success"; data: T }
  | { status: "ambiguous"; candidates: TwelveDataInstrument[] }
  | { status: "not_found" | "rate_limited" | "upstream_error" | "invalid_response" };

type RequestOptions = {
  apiKey: string;
  fetchImpl?: FetchLike;
  now?: Date;
};

export async function findTwelveDataInstrument(
  {
    symbol,
    currency,
  }: {
    symbol: string;
    currency: string;
  },
  options: RequestOptions,
): Promise<TwelveDataResult<TwelveDataInstrument>> {
  const response = await requestJson<SymbolSearchResponse>(
    "/symbol_search",
    { symbol },
    options,
  );
  if (response.status !== "success") return response;

  const normalizedSymbol = symbol.trim().toUpperCase();
  const normalizedCurrency = currency.trim().toUpperCase();
  const candidates = (response.data.data ?? [])
    .map(toInstrument)
    .filter((candidate): candidate is TwelveDataInstrument => candidate !== null)
    .filter((candidate) =>
      candidate.symbol === normalizedSymbol
      && candidate.currency === normalizedCurrency);

  if (candidates.length === 0) return { status: "not_found" };
  if (candidates.length > 1) return { status: "ambiguous", candidates };
  return { status: "success", data: candidates[0] };
}

export async function fetchTwelveDataQuote(
  {
    symbol,
    currency,
    micCode,
  }: {
    symbol: string;
    currency: string;
    micCode: string | null;
  },
  options: RequestOptions,
): Promise<TwelveDataResult<TwelveDataQuote>> {
  const normalizedMic = micCode?.trim().toUpperCase() || null;
  const response = await requestJson<QuoteResponse>(
    "/quote",
    {
      symbol,
      timezone: "UTC",
      ...(normalizedMic ? { mic_code: normalizedMic } : {}),
    },
    options,
  );
  if (response.status !== "success") return response;

  const quote = response.data;
  const instrument = toInstrument({
    symbol: quote.symbol,
    instrument_name: quote.name,
    exchange: quote.exchange,
    mic_code: quote.mic_code,
    currency: quote.currency,
  });
  const price = Number(quote.close);
  const timestamp = quote.last_quote_at ?? quote.timestamp;
  const normalizedCurrency = currency.trim().toUpperCase();

  if (
    !instrument
    || instrument.symbol !== symbol.trim().toUpperCase()
    || instrument.currency !== normalizedCurrency
    || (normalizedMic !== null && instrument.micCode !== normalizedMic)
    || !Number.isFinite(price)
    || price < 0
    || !Number.isFinite(timestamp)
  ) return { status: "invalid_response" };

  const observedAt = new Date(Number(timestamp) * 1_000);
  if (Number.isNaN(observedAt.getTime())) return { status: "invalid_response" };

  return {
    status: "success",
    data: {
      ...instrument,
      price,
      observedAt: observedAt.toISOString(),
      status: quoteStatus(observedAt, quote.is_market_open === true, options.now ?? new Date()),
    },
  };
}

export function quoteStatus(
  observedAt: Date,
  isMarketOpen: boolean,
  now: Date,
): TwelveDataQuote["status"] {
  if (now.getTime() - observedAt.getTime() > STALE_AFTER_MS) return "stale";
  return isMarketOpen ? "delayed" : "end_of_day";
}

async function requestJson<T extends TwelveDataErrorResponse>(
  path: string,
  params: Record<string, string>,
  { apiKey, fetchImpl = fetch }: RequestOptions,
): Promise<TwelveDataResult<T>> {
  const url = new URL(path, API_BASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        Authorization: `apikey ${apiKey}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { status: "upstream_error" };
  }

  let body: T;
  try {
    body = await response.json() as T;
  } catch {
    return { status: "invalid_response" };
  }

  if (response.status === 429 || body.code === 429) return { status: "rate_limited" };
  if (!response.ok || body.status === "error") {
    return body.code === 404 ? { status: "not_found" } : { status: "upstream_error" };
  }
  return { status: "success", data: body };
}

function toInstrument(value: {
  symbol?: string;
  instrument_name?: string;
  exchange?: string;
  mic_code?: string;
  instrument_type?: string;
  currency?: string;
}): TwelveDataInstrument | null {
  const symbol = value.symbol?.trim().toUpperCase() ?? "";
  const micCode = value.mic_code?.trim().toUpperCase() ?? "";
  const currency = value.currency?.trim().toUpperCase() ?? "";
  if (!symbol || !/^[A-Z0-9]{4}$/.test(micCode) || !/^[A-Z]{3}$/.test(currency)) return null;
  return {
    symbol,
    name: value.instrument_name?.trim() || null,
    exchange: value.exchange?.trim() || null,
    micCode,
    currency,
    instrumentType: value.instrument_type?.trim() || null,
  };
}
