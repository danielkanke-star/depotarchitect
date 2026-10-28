import Decimal from "decimal.js";
import type { Json, Position, PositionSale } from "./database.types";

/** A captured sheet reference, never an invented historical broker FX/margin. */
export type JournalSourceValues = {
  version: 1; capturedAt: string; documentId: string | null; sheet: string; row: number;
  ticker: string; category: string | null; direction: string; currency: string;
  units: number; entryPrice: number; entryDate: string | null; marginRate: number | null;
  fxToBase: number; sale: { units: number; price: number; date: string | null } | null;
  reportedPnlBase: number | null;
};
export type JournalSourceReference = {
  id: string; user_id: string; portfolio_id: string; position_id: string | null;
  source_key: string; source_values: Json; created_at: string;
};

export function readJournalSource(value: unknown): JournalSourceValues | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Partial<JournalSourceValues>;
  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const day = (v: unknown) => v === null || typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
    && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
  if (r.version !== 1 || typeof r.capturedAt !== "string" || !Number.isFinite(Date.parse(r.capturedAt))
    || (r.documentId !== null && (typeof r.documentId !== "string" || !/^[\w-]{10,150}$/.test(r.documentId)))
    || typeof r.sheet !== "string" || r.sheet.length > 100 || !Number.isInteger(r.row) || r.row! < 1
    || typeof r.ticker !== "string" || !r.ticker || r.ticker.length > 80
    || (r.category !== null && (typeof r.category !== "string" || r.category.length > 100))
    || !["long","short","long_call","long_put","short_call","short_put"].includes(r.direction ?? "")
    || !/^[A-Z]{3}$/.test(r.currency ?? "") || !finite(r.units) || r.units <= 0
    || !finite(r.entryPrice) || r.entryPrice < 0 || !day(r.entryDate)
    || (r.marginRate !== null && (!finite(r.marginRate) || r.marginRate < 0 || r.marginRate > 1))
    || !finite(r.fxToBase) || r.fxToBase <= 0
    || (r.reportedPnlBase !== null && !finite(r.reportedPnlBase))) return null;
  if (r.sale !== null && (!r.sale || !finite(r.sale.units) || r.sale.units <= 0 || r.sale.units > r.units
    || !finite(r.sale.price) || r.sale.price < 0 || !day(r.sale.date)
    || (r.entryDate && r.sale.date && r.sale.date < r.entryDate))) return null;
  return r as JournalSourceValues;
}

export function sourceMatchesEntry(p: Position, r: JournalSourceValues) {
  return p.ticker === r.ticker && p.instrument_currency === r.currency && p.direction === r.direction
    && p.entry_date === r.entryDate && new Decimal(p.entry_price).equals(r.entryPrice)
    && new Decimal(p.quantity).mul(p.multiplier).equals(r.units);
}
export function sourceMatchesSales(p: Position, sales: PositionSale[], r: JournalSourceValues) {
  if (!sourceMatchesEntry(p,r) || !r.sale || !sales.length) return false;
  // A single source row cannot invent an allocation across different exit days/prices.
  return sales.every(s => s.sale_date === r.sale!.date && new Decimal(s.price).equals(r.sale!.price))
    && sales.reduce((sum,s)=>sum.plus(new Decimal(s.quantity).mul(p.multiplier)),new Decimal(0)).equals(r.sale.units);
}
export function sourceMargin(r: JournalSourceValues) {
  return r.marginRate !== null && r.marginRate > 0
    ? new Decimal(r.entryPrice).mul(r.units).mul(r.marginRate).mul(r.fxToBase).toNumber() : null;
}
export function sourcePnl(r: JournalSourceValues) {
  if (!r.sale) return null;
  return new Decimal(r.sale.price).minus(r.entryPrice).mul(r.sale.units)
    .mul(r.direction.startsWith("short") ? -1 : 1).mul(r.fxToBase).toNumber();
}
export function sourceForPosition(p: Position, references: JournalSourceReference[]) {
  const row = references.find(r => r.position_id === p.id);
  const values = row ? readJournalSource(row.source_values) : null;
  return values && sourceMatchesEntry(p,values) ? values : null;
}
