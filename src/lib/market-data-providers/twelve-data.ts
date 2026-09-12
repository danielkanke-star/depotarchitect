import "server-only";

import {
  fetchTwelveDataQuote,
  searchTwelveDataInstruments,
  type TwelveDataInstrument,
  type TwelveDataQuote,
  type TwelveDataResult,
} from "./twelve-data-core";

export type TwelveDataProviderResult<T> =
  | TwelveDataResult<T>
  | { status: "disabled" };

export async function getTwelveDataQuote(input: {
  symbol: string;
  currency: string;
  micCode: string | null;
}): Promise<TwelveDataProviderResult<TwelveDataQuote>> {
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!apiKey) return { status: "disabled" };
  return fetchTwelveDataQuote(input, { apiKey });
}

export async function searchTwelveData(searchTerm: string): Promise<TwelveDataProviderResult<TwelveDataInstrument[]>> {
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!apiKey) return { status: "disabled" };
  return searchTwelveDataInstruments(searchTerm, { apiKey });
}
