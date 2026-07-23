import Decimal from "decimal.js";

export function normalizeFxQuoteToBase(input: {
  instrumentCurrency: string;
  baseCurrency: string;
  quoteBaseCurrency: string;
  quoteTermCurrency: string;
  quote: number | string;
}) {
  const instrument = input.instrumentCurrency.trim().toUpperCase();
  const portfolioBase = input.baseCurrency.trim().toUpperCase();
  const quoteBase = input.quoteBaseCurrency.trim().toUpperCase();
  const quoteTerm = input.quoteTermCurrency.trim().toUpperCase();
  const quote = new Decimal(input.quote);
  if (!quote.isPositive()) throw new Error("FX quote must be positive.");
  if (instrument === portfolioBase) return 1;
  if (quoteBase === instrument && quoteTerm === portfolioBase) return quote.toNumber();
  if (quoteBase === portfolioBase && quoteTerm === instrument) return new Decimal(1).div(quote).toNumber();
  throw new Error("FX quote pair does not match instrument and portfolio currencies.");
}
