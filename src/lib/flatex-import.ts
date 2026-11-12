import Decimal from "decimal.js";
import { parseDate } from "@/lib/csv-import";
import { exactTradeNumber, validateTrade, type Trade } from "@/lib/trade-import";

export function parseFlatexConfirmation(raw: string, baseCurrency: string): { trade: Trade; account: string } {
  const text = raw.normalize("NFKC").replace(/[\u00a0\t]/g, " ").replace(/ {2,}/g, " ");
  const heading = [...text.matchAll(/Wertpapierabrechnung\s+(Kauf|Verkauf)\b/gi)];
  if (!/flatex/i.test(text) || heading.length !== 1 || /\b(?:Storno|Sammelabrechnung|Kapitalmaßnahme)\b/i.test(text)) {
    throw new Error("Bitte eine einzelne flatex-Kauf- oder Verkaufsabrechnung mit Text auswählen.");
  }
  const booking = text.match(/\bNr\.\s*(\d+\s*\/\s*\d+)\s+(Kauf|Verkauf)\s+([^\r\n]{1,180}?)\s*\(([A-Z]{2}[A-Z0-9]{9}\d)\s*\//i);
  const date = parseDate(text.match(/Handelstag\s*:?[ ]*(\d{2}\.\d{2}\.\d{4})/i)?.[1] ?? "");
  const quantity = text.match(/Ausgeführt\s*:\s*([\d.,]+)\s+(?:St\.|Stück\b|STK\b)/i);
  const price = text.match(/\bKurs\s*:\s*([\d.,]+)\s+([A-Z]{3})\b/);
  if (!booking || !date || date === "invalid" || !quantity || !price || booking[2].toLowerCase() !== heading[0][1].toLowerCase()) {
    throw new Error("Belegnummer, Handelstag, Stückzahl, ISIN und Stückkurs konnten nicht eindeutig gelesen werden.");
  }
  const side = booking[2].toLowerCase() === "kauf" ? "buy" : "sell";
  const units = exactTradeNumber(quantity[1], "german");
  const unitPrice = exactTradeNumber(price[1], "german");
  const gross = text.match(/Kurswert\s*:\s*([\d.,]+)\s+([A-Z]{3})\b/);
  const printedRate = text.match(/Devisenkurs\s*:\s*([\d.,]+)/i);
  const account = text.match(/Verrechnung[^\n]*Konto Nr\.?\s*:\s*([\d ]+)/i)?.[1].replaceAll(" ", "") ?? "";
  let conversion: string | undefined;
  if (baseCurrency !== price[2] && gross?.[2] === baseCurrency && printedRate) {
    const grossNative = new Decimal(unitPrice).mul(units);
    const grossBase = new Decimal(exactTradeNumber(gross[1], "german"));
    const rate = new Decimal(exactTradeNumber(printedRate[1], "german", 12));
    if (rate.gt(0) && grossBase.gt(0)) {
      const matching = [rate, new Decimal(1).div(rate)].filter(candidate => grossNative.mul(candidate).minus(grossBase).abs().lte("0.015"));
      if (matching.length === 1 || rate.eq(1) && matching.length) conversion = matching[0].toDecimalPlaces(12).toFixed();
    }
  }
  return { account, trade: validateTrade({
    reference: booking[1].replaceAll(" ", ""), instrument: booking[4], ticker: booking[4], isin: booking[4],
    name: booking[3].trim(), currency: price[2], date,
    time: text.match(/Handelszeit\s*:?\s*(\d\d:\d\d:\d\d)/i)?.[1] ?? "",
    side, effect: side === "buy" ? "open" : "close", direction: "long", type: "other",
    quantity: units, price: unitPrice, multiplier: "1",
    ...(conversion ? { conversion, conversionSource: "flatex-Abrechnung" } : {}),
  }) };
}
