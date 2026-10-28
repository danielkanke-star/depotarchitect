import type { Position } from "../database.types";

export type IbkrQuote = {
  conid: number;
  symbol: string;
  name: string;
  currency: string;
  mic: string | null;
  assetClass: "STK" | "OPT";
  isin: string | null;
  multiplier: number;
  expiry: string | null;
  strike: number | null;
  right: "C" | "P" | null;
  price: number;
  bid: number | null;
  ask: number | null;
  observedAt: string;
  fetchedAt: string;
  quality: "live" | "delayed" | "end_of_day" | "broker_valuation" | "stale";
  priceBasis?: "last" | "mid" | "broker_valuation";
};

export const IBKR_EXCHANGES: Record<string, string> = {
  ETR: "XETR", IBIS: "XETR", IBIS2: "XETR", XETRA: "XETR", XETR: "XETR",
  EPA: "XPAR", SBF: "XPAR", XPAR: "XPAR", NYSE: "XNYS", NASDAQ: "XNAS",
  NASDAQNGS: "XNAS", NASDAQNMS: "XNAS", ARCA: "ARCX", AMEX: "XASE",
  EBS: "XSWX", SWX: "XSWX", LSE: "XLON", LSEETF: "XLON",
};

export function splitIbkrQuery(value: string) {
  const text = value.trim().toUpperCase();
  const parts = text.split(":");
  if (parts.length === 2) {
    const mic = IBKR_EXCHANGES[parts[0]] ?? (/^[A-Z0-9]{4}$/.test(parts[0]) ? parts[0] : null);
    return { symbol: parts[1], mic, valid: mic !== null && parts[1].length > 0 };
  }
  return { symbol: text, mic: null, valid: parts.length === 1 && text.length > 0 };
}

/** Reject decorated prices, NaN, missing values and IBKR's -1 sentinel. */
export function ibkrNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string" || !/^[CH]?[0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?$/.test(value.trim())) return null;
  const parsed = Number(value.trim().replace(/^[CH]/, "").replaceAll(",", ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseIbkrOccSymbol(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /^([A-Z0-9.]{1,6})\s*(\d{6})([CP])(\d{8})$/.exec(value.trim());
  if (!match) return null;
  const date = `20${match[2].slice(0, 2)}-${match[2].slice(2, 4)}-${match[2].slice(4, 6)}`;
  if (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) return null;
  const strike = Number(match[4]) / 1000;
  return strike > 0 ? { root: match[1], expiry: date, right: match[3] as "C" | "P", strike } : null;
}

export function validateIbkrQuote(value: unknown, now = Date.now()): IbkrQuote | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const q = value as Partial<IbkrQuote>;
  const validTime = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v)) && Date.parse(v) <= now + 60_000;
  if (!Number.isSafeInteger(q.conid) || q.conid! <= 0
    || typeof q.symbol !== "string" || !q.symbol || q.symbol.length > 80
    || typeof q.name !== "string" || q.name.length > 200
    || !/^[A-Z]{3}$/.test(q.currency ?? "")
    || (q.mic !== null && !/^[A-Z0-9]{4}$/.test(q.mic ?? ""))
    || !["STK", "OPT"].includes(q.assetClass ?? "")
    || !["live", "delayed", "end_of_day", "broker_valuation", "stale"].includes(q.quality ?? "")
    || typeof q.price !== "number" || !Number.isFinite(q.price) || q.price < 0
    || typeof q.multiplier !== "number" || !Number.isFinite(q.multiplier) || q.multiplier <= 0
    || !validTime(q.observedAt) || !validTime(q.fetchedAt)) return null;
  if (q.isin !== null && (typeof q.isin !== "string" || !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(q.isin))) return null;
  for (const key of ["bid", "ask"] as const) if (q[key] !== null && (typeof q[key] !== "number" || !Number.isFinite(q[key]) || q[key]! < 0)) return null;
  if (q.assetClass === "OPT" && (!q.expiry || !/^\d{4}-\d{2}-\d{2}$/.test(q.expiry)
    || typeof q.strike !== "number" || !Number.isFinite(q.strike) || q.strike <= 0 || !["C", "P"].includes(q.right ?? ""))) return null;
  return q as IbkrQuote;
}

type MatchPosition = Pick<Position, "ticker" | "instrument_currency" | "instrument_type" | "multiplier" | "expiration_date" | "strike_price" | "option_type" | "direction">;

/** Match a contract, never a broker aggregate quantity, to all corresponding lots. */
export function ibkrQuoteMatchesPosition(q: IbkrQuote, p: MatchPosition) {
  if (q.currency !== p.instrument_currency?.toUpperCase()) return false;
  const query = splitIbkrQuery(p.ticker);
  if (!query.valid) return false;
  if (p.instrument_type === "option") {
    const underlying = query.symbol.split(/\s+/)[0];
    const right = p.option_type?.toUpperCase().startsWith("C") || p.direction.endsWith("call") ? "C"
      : p.option_type?.toUpperCase().startsWith("P") || p.direction.endsWith("put") ? "P" : null;
    return q.assetClass === "OPT" && q.symbol === underlying && q.expiry === p.expiration_date
      && q.strike === Number(p.strike_price) && q.right === right && q.multiplier === Number(p.multiplier);
  }
  return ["stock", "etf"].includes(p.instrument_type) && q.assetClass === "STK"
    && q.symbol === query.symbol && (!query.mic || q.mic === query.mic) && q.multiplier === Number(p.multiplier);
}

export function ibkrQuoteStatus(q: IbkrQuote, now = Date.now()) {
  const limit = q.quality === "end_of_day" ? 7 * 86_400_000 : 15 * 60_000;
  if (now - Date.parse(q.fetchedAt) > 5 * 60_000 || now - Date.parse(q.observedAt) > limit) return "stale" as const;
  return q.quality === "broker_valuation" ? "manually_updated" as const : q.quality;
}

export function ibkrSourceLabel(q: IbkrQuote) {
  return q.quality === "broker_valuation" ? "IBKR-Depotbewertung · Kurszeit unbestätigt"
    : q.quality === "end_of_day" ? "IBKR · Schlusskurs" : q.priceBasis === "mid" ? "IBKR · Mittelkurs aus Geld/Brief" : "IBKR";
}
