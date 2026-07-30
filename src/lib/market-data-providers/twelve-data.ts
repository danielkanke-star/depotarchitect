import "server-only";

import {
  fetchTwelveDataQuote,
  findTwelveDataInstrument,
  type TwelveDataInstrument,
  type TwelveDataQuote,
  type TwelveDataResult,
} from "./twelve-data-core";

export type TwelveDataProviderResult<T> =
  | TwelveDataResult<T>
  | { status: "disabled" };

export async function resolveTwelveDataInstrument(input: {
  symbol: string;
  currency: string;
  micCode: string | null;
}): Promise<TwelveDataProviderResult<TwelveDataInstrument>> {
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!apiKey) return { status: "disabled" };

  if (input.micCode) {
    return {
      status: "success",
      data: {
        symbol: input.symbol.trim().toUpperCase(),
        name: null,
        exchange: null,
        micCode: input.micCode,
        currency: input.currency.trim().toUpperCase(),
        instrumentType: null,
      },
    };
  }
  return findTwelveDataInstrument(input, { apiKey });
}

export async function getTwelveDataQuote(input: {
  symbol: string;
  currency: string;
  micCode: string;
}): Promise<TwelveDataProviderResult<TwelveDataQuote>> {
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!apiKey) return { status: "disabled" };
  return fetchTwelveDataQuote(input, { apiKey });
}
