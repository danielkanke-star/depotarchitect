import Decimal from "decimal.js";
import { parseDate, parseDelimited } from "@/lib/csv-import";
import { berlinDate } from "@/lib/risk-rules";

export type TradeSource = "csv" | "flatex" | "ibkr";
export type Trade = {
  reference: string;
  instrument: string;
  ticker: string;
  name: string;
  currency: string;
  date: string;
  time: string;
  side: "buy" | "sell";
  effect: "open" | "close";
  direction: "long" | "short" | "long_call" | "short_call" | "long_put" | "short_put";
  type: "stock" | "etf" | "option" | "other";
  quantity: string;
  price: string;
  multiplier: string;
  isin?: string;
  option?: "call" | "put";
  strike?: string;
  expiry?: string;
  conversion?: string;
  conversionSource?: string;
};

export const MAX_TRADES = 2000;
export const MAX_REPORT_BYTES = 3_000_000;
export const tradeCsvFields = {
  reference: "Buchungsnummer",
  date: "Handelstag",
  time: "Uhrzeit",
  side: "Kauf / Verkauf",
  ticker: "Ticker oder ISIN",
  quantity: "Stückzahl",
  price: "Kurs pro Stück",
  currency: "Handelswährung",
} as const;
export type TradeCsvField = keyof typeof tradeCsvFields;
export type TradeCsvMapping = Record<TradeCsvField, number>;
const columns = Object.keys(tradeCsvFields) as TradeCsvField[];
const aliases: Record<TradeCsvField, string[]> = {
  reference: ["Buchungsnummer", "Transaktions-ID", "Transaction ID", "Trade ID", "Ordernummer", "Referenz", "Belegnummer"],
  date: ["Handelstag", "Handelsdatum", "Datum", "Trade Date", "Date", "Date/Time"],
  time: ["Uhrzeit", "Zeit", "Time", "Trade Time"],
  side: ["Kauf / Verkauf", "Kauf/Verkauf", "Typ", "Art", "Buy/Sell", "Side", "Type", "Transaktionstyp"],
  ticker: ["Ticker oder ISIN", "ISIN", "Ticker", "Ticker Symbol", "Symbol", "Wertpapierkennung"],
  quantity: ["Stückzahl", "Menge", "Anzahl", "Quantity", "Shares", "Stück", "Nominale"],
  price: ["Kurs pro Stück", "Kurs", "Preis", "Trade Price", "Price", "Ausführungskurs"],
  currency: ["Handelswährung", "Währung", "Currency", "CurrencyPrimary", "Currency Gross Amount"],
};
const key = (value: string) => value.toLowerCase().normalize("NFD").replace(/\p{M}|[^a-z0-9]/gu, "");
const currencyPattern = /^[A-Z]{3}$/;
export const isinPattern = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

export function exactTradeNumber(value: string, kind: "decimal" | "german" | "csv" = "decimal", places = 6) {
  let normalized = value.trim().replace(/[\s\u00a0]/g, "");
  if (kind === "german") {
    if (!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(normalized)) throw new Error("Ungültige Zahl.");
    normalized = normalized.replaceAll(".", "").replace(",", ".");
  } else if (kind === "csv" && normalized.includes(",")) {
    if (!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+$/.test(normalized)) throw new Error("Ungültige Dezimalzahl. Bitte Dezimaltrennzeichen prüfen.");
    normalized = normalized.replaceAll(".", "").replace(",", ".");
  }
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized) || normalized.length > 30) throw new Error("Ungültige Zahl.");
  const amount = new Decimal(normalized);
  if (amount.decimalPlaces() > places || amount.abs().gte(1e12)) throw new Error("Zahl außerhalb des unterstützten Bereichs.");
  return amount.toFixed();
}

export function validateTrade(trade: Trade): Trade {
  const date = parseDate(trade.date);
  if (!date || date === "invalid" || date !== trade.date || date > berlinDate()) throw new Error("Handelstag prüfen.");
  if (trade.time && !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(trade.time)) throw new Error("Uhrzeit prüfen.");
  if (!trade.reference.trim() || trade.reference.length > 150 || !trade.instrument || trade.instrument.length > 100 ||
    !trade.ticker.trim() || trade.ticker.length > 80 || trade.name.length > 200 || !currencyPattern.test(trade.currency)) {
    throw new Error("Wertpapier, Buchungsnummer oder Währung fehlt.");
  }
  if (new Decimal(exactTradeNumber(trade.quantity)).lte(0) || new Decimal(exactTradeNumber(trade.price)).lt(0) ||
    new Decimal(exactTradeNumber(trade.multiplier)).lte(0)) throw new Error("Stückzahl, Kurs oder Kontraktgröße prüfen.");
  if (trade.conversion && new Decimal(exactTradeNumber(trade.conversion, "decimal", 12)).lte(0)) throw new Error("Wechselkurs prüfen.");
  return trade;
}

export function csvTradeTable(raw: string) {
  const input = raw.replace(/^\uFEFF/, "");
  const delimiter = [",", ";", "\t"].map(separator => ({ separator, width: parseDelimited(input.slice(0, 4000), separator)[0]?.length ?? 0 }))
    .sort((a, b) => b.width - a.width)[0].separator;
  const [headers, ...rows] = parseDelimited(input, delimiter);
  if (!headers || headers.length < 2 || headers.length > 80 || !rows.length || rows.length > MAX_TRADES) {
    throw new Error("Bitte eine CSV mit Kopfzeile und bis zu 2.000 Buchungen auswählen.");
  }
  const mapping = Object.fromEntries(columns.map(field => [
    field, aliases[field].map(key).map(alias => headers.findIndex(header => key(header) === alias)).find(index => index >= 0) ?? -1,
  ])) as TradeCsvMapping;
  return { headers, rows, mapping };
}

export function parseTradeCsv(raw: string, mapping: TradeCsvMapping) {
  const { rows, headers } = csvTradeTable(raw);
  for (const field of columns) {
    if (["reference", "time"].includes(field) && mapping[field] === -1) continue;
    if (!Number.isInteger(mapping[field]) || mapping[field] < 0 || mapping[field] >= headers.length) {
      throw new Error(`Bitte die Spalte „${tradeCsvFields[field]}“ zuordnen.`);
    }
  }
  const selected = columns.map(field => mapping[field]).filter(index => index >= 0);
  if (new Set(selected).size !== selected.length) throw new Error("Bitte jede Spalte nur einmal zuordnen.");
  const synthetic = new Map<string, number>();
  return rows.map((row, index) => {
    try {
      const get = (field: TradeCsvField) => (row[mapping[field]] ?? "").trim();
      const date = parseDate(get("date").split(/[T ;]/)[0]);
      const timeText = get("time") || get("date").match(/[T ;](\d\d:\d\d(?::\d\d)?)$/)?.[1] || "";
      const time = timeText.length === 5 ? timeText + ":00" : timeText;
      const action = key(get("side"));
      const side = ["kauf", "buy", "k"].includes(action) ? "buy" : ["verkauf", "sell", "v"].includes(action) ? "sell" : null;
      if (!side || !date || date === "invalid") throw new Error("Kauf/Verkauf und Handelstag prüfen.");
      const ticker = get("ticker").toUpperCase();
      const currency = get("currency").toUpperCase();
      const quantity = new Decimal(exactTradeNumber(get("quantity"), "csv")).abs().toFixed();
      const price = exactTradeNumber(get("price"), "csv");
      const signature = [ticker, currency, date, time, side, quantity, price].join("|");
      const occurrence = (synthetic.get(signature) ?? 0) + 1;
      synthetic.set(signature, occurrence);
      if (!get("reference") && occurrence > 1) throw new Error("Identische Buchungen brauchen eine eigene Buchungsnummer.");
      return validateTrade({
        reference: get("reference") ? `ref:${get("reference")}` : `row:${signature}`,
        instrument: ticker, ticker, name: ticker, currency, date, time, side,
        effect: side === "buy" ? "open" : "close", direction: "long",
        type: "other", quantity, price, multiplier: "1", ...(isinPattern.test(ticker) ? { isin: ticker } : {}),
      });
    } catch (error) {
      throw new Error(`Zeile ${index + 2}. ${error instanceof Error ? error.message : "Buchung prüfen."}`);
    }
  });
}
