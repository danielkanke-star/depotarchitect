import Decimal from "decimal.js";
import type { Position, PositionSale } from "./database.types";
import { berlinDate, calendarDays } from "./risk-rules";
import { readJournalSource, sourceForPosition, sourceMargin, sourceMatchesSales, sourcePnl, type JournalSourceReference, type JournalSourceValues } from "./journal-source-reference";

export function instrumentKey(p: Position) {
  // An unconfirmed ticker never merges different currencies or contracts/listings.
  return p.listing_id ?? [p.ticker.trim().toUpperCase(), p.instrument_currency, p.instrument_type, p.option_type, p.strike_price, p.expiration_date].join("|");
}
export function tradeKey(p: Position) {
  // A journal CSV has no verified listing identity. Preserve its original
  // instrument grouping within that import when an open remainder later gets
  // a quote listing; that lookup must not turn closed partials into new trades.
  const instrument = p.source_import_id && p.journal_source_key
    ? ["journal", p.source_import_id, p.journal_instrument_ref ?? [p.ticker.trim().toUpperCase(), p.instrument_currency, p.instrument_type, p.option_type, p.strike_price, p.expiration_date].join("|")].join("|")
    : instrumentKey(p);
  return [p.portfolio_id, instrument, p.direction, p.entry_date ?? `unknown:${p.id}`, p.category_id ?? "none"].join("::");
}
export function positionSales(p: Position, sales: PositionSale[]) {
  const own = sales.filter(s => s.position_id === p.id);
  if (own.length || !p.sold_quantity || p.sale_price === null || !p.sale_date) return own;
  // Legacy references retain provenance and never borrow today's FX.
  return [{ id: `legacy:${p.id}`, user_id: p.user_id, portfolio_id: p.portfolio_id, position_id: p.id,
    quantity: Number(p.sold_quantity), price: Number(p.sale_price), sale_date: p.sale_date,
    fx_to_base: null, fx_source: null, source: "legacy_aggregate", request_id: `legacy:${p.id}`, created_at: p.created_at }];
}
export function salePnl(p: Position, sale: PositionSale) {
  const factor = p.direction === "short" || p.direction.startsWith("short_") ? -1 : 1;
  const native = new Decimal(sale.price).minus(p.entry_price).mul(sale.quantity).mul(p.multiplier).mul(factor);
  const fx = sale.fx_to_base;
  return { native: native.toNumber(), base: fx !== null && Number.isFinite(fx) && fx > 0 ? native.mul(fx).toNumber() : null };
}
export function realizedForPosition(p: Position, sales: PositionSale[], reference: JournalSourceValues | null = null) {
  const own = positionSales(p,sales);
  const referenceApplies = reference !== null && sourceMatchesSales(p,own,reference);
  const values = own.map(s => {
    const v = salePnl(p,s);
    return { ...v, base: v.base ?? (referenceApplies ? new Decimal(v.native).mul(reference!.fxToBase).toNumber() : null) };
  });
  return { native: values.reduce((sum, v) => sum.plus(v.native), new Decimal(0)).toNumber(),
    base: values.every(v => v.base !== null) ? values.reduce((sum, v) => sum.plus(v.base!), new Decimal(0)).toNumber() : null,
    hasSales: values.length > 0, referenceUsed: referenceApplies && own.some(s=>salePnl(p,s).base===null) };
}
export type TradeResult = {
  key: string; ticker: string; categoryId: string | null; categoryName?: string | null; entryDate: string | null;
  closed: boolean; closeDate: string | null; quantity: number; remaining: number;
  pnl: number | null; margin: number | null; marginReturn: number | null; days: number | null;
  annualized: number | null; positionIds: string[];
  hasSales: boolean;
  referenceUsed: boolean; marginReferenceUsed: boolean;
};
export function calculateJournal(positions: Position[], sales: PositionSale[], now = new Date(), references: JournalSourceReference[] = []) {
  positions = positions.filter(p => p.instrument_type !== "cash" && p.source_type !== "demo");
  const sourceByPosition = new Map(positions.map(p=>[p.id,sourceForPosition(p,references)]));
  const realized = (p: Position) => realizedForPosition(p,sales,sourceByPosition.get(p.id));
  const groups = new Map<string, Position[]>();
  for (const p of positions) {
    const key = tradeKey(p); groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const today = berlinDate(now);
  const cutoffDate = new Date(`${today}T00:00:00Z`); cutoffDate.setUTCFullYear(cutoffDate.getUTCFullYear() - 1);
  const cutoff = cutoffDate.toISOString().slice(0, 10);
  const rollingEntries = positions.flatMap(p => {
    const own=positionSales(p,sales), r=sourceByPosition.get(p.id);
    const applies=!!r && sourceMatchesSales(p,own,r);
    return own.filter(s=>s.sale_date>cutoff && s.sale_date<=today).map(s=>salePnl(p,s).base ?? (applies ? new Decimal(salePnl(p,s).native).mul(r!.fxToBase).toNumber() : null));
  });
  const trades: TradeResult[] = [...groups].map(([key, ps]) => {
    const quantity = ps.reduce((sum, p) => sum.plus(p.quantity), new Decimal(0));
    const sold = ps.reduce((sum, p) => sum.plus(p.sold_quantity), new Decimal(0));
    const closed = quantity.equals(sold);
    const pnls = ps.map(p => realized(p).base);
    const pnl = pnls.every(v => v !== null) ? pnls.reduce<Decimal>((sum, v) => sum.plus(v!), new Decimal(0)).toNumber() : null;
    const margins = ps.map(p => p.entry_margin_base ?? (sourceByPosition.get(p.id) ? sourceMargin(sourceByPosition.get(p.id)!) : null));
    const margin = margins.every(v => v !== null && v !== undefined && v > 0) ? margins.reduce<Decimal>((sum, v) => sum.plus(v!), new Decimal(0)).toNumber() : null;
    const dates = ps.flatMap(p => positionSales(p, sales).map(s => s.sale_date)).sort();
    const closeDate = closed ? dates.at(-1) ?? null : null;
    const days = closeDate ? calendarDays(ps[0].entry_date, closeDate) : !closed ? calendarDays(ps[0].entry_date,today) : null;
    const marginReturn = closed && pnl !== null && margin ? new Decimal(pnl).div(margin).toNumber() : null;
    // For multiple exit cash flows a simple CAGR would be misleading. Only a single
    // exit date is extrapolated, and never from an averaged return/holding period.
    const annualized = marginReturn !== null && marginReturn > -1 && days !== null && days > 0 && new Set(dates).size === 1
      ? Math.expm1(Math.log1p(marginReturn) * 365 / days) : null;
    return { key, ticker: ps[0].ticker, categoryId: ps[0].category_id, entryDate: ps[0].entry_date,
      closed, closeDate, quantity: quantity.toNumber(), remaining: quantity.minus(sold).toNumber(), pnl, margin, marginReturn,
      days, annualized: annualized !== null && Number.isFinite(annualized) ? annualized : null, positionIds: ps.map(p => p.id), hasSales: dates.length > 0,
      referenceUsed: ps.some(p=>realized(p).referenceUsed), marginReferenceUsed: ps.some(p=>p.entry_margin_base===null && !!sourceByPosition.get(p.id)) };
  });
  // Source-only closures can have a known result while their exit date is absent.
  // Keep that fact; never create a fictional execution date or broker transaction.
  const unlinked = references.filter(r=>r.position_id===null).flatMap(r=>{
    const v=readJournalSource(r.source_values);
    return v?.sale && v.sale.units===v.units ? [{record:r,values:v}] : [];
  });
  for(const {record,values:r} of unlinked) {
    const pnl=sourcePnl(r),margin=sourceMargin(r),days=r.sale!.date ? calendarDays(r.entryDate,r.sale!.date) : null;
    const marginReturn=pnl!==null && margin!==null && margin>0 ? new Decimal(pnl).div(margin).toNumber():null;
    trades.push({key:`source:${record.id}`,ticker:r.ticker,categoryId:null,categoryName:r.category,entryDate:r.entryDate,closed:true,closeDate:r.sale!.date,
      quantity:r.units,remaining:0,pnl,margin,marginReturn,days,annualized:null,positionIds:[],hasSales:true,referenceUsed:true,marginReferenceUsed:margin!==null});
    if(r.sale!.date && r.sale!.date>cutoff && r.sale!.date<=today) rollingEntries.push(pnl);
  }
  const closed = trades.filter(t => t.closed);
  const known = closed.filter(t => t.pnl !== null);
  const wins = known.filter(t => t.pnl! > 0), losses = known.filter(t => t.pnl! < 0), flat = known.filter(t => t.pnl === 0);
  const average = (ns: number[]) => ns.length ? ns.reduce((s, n) => s.plus(n), new Decimal(0)).div(ns.length).toNumber() : null;
  const allRealized = [...positions.filter(p=>realized(p).hasSales).map(p=>realized(p).base), ...unlinked.map(r=>sourcePnl(r.values))];
  const sumKnown = (ns: (number | null)[]) => ns.reduce<Decimal>((s, n) => n === null ? s : s.plus(n), new Decimal(0)).toNumber();
  const marginCovered = closed.filter(t=>t.pnl!==null && t.margin!==null && t.margin>0);
  const combinedMargin = marginCovered.reduce((s,t)=>s.plus(t.margin!),new Decimal(0));
  return { trades, closedCount: closed.length, wins: wins.length, losses: losses.length, flat: flat.length,
    incompleteClosedCount: closed.length - known.length, hitRate: known.length ? wins.length / known.length : null,
    averageWin: average(wins.map(t => t.pnl!)), averageLoss: average(losses.map(t => t.pnl!)),
    averageDays: average(closed.flatMap(t => t.days === null ? [] : [t.days])),
    realized: sumKnown(allRealized), realizedComplete: allRealized.every(v => v !== null),
    rollingRealized: sumKnown(rollingEntries), rollingComplete: rollingEntries.every(v => v !== null) && unlinked.every(r=>r.values.sale?.date), cutoff, today,
    marginReturn: combinedMargin.gt(0) ? new Decimal(sumKnown(marginCovered.map(t => t.pnl))).div(combinedMargin).toNumber() : null,
    marginCoveredCount:marginCovered.length, datedClosedCount:closed.filter(t=>t.days!==null).length,
    referenceCount:trades.filter(t=>t.referenceUsed||t.marginReferenceUsed).length,
    referenceAsOf:references.map(r=>readJournalSource(r.source_values)?.capturedAt).filter((v):v is string=>!!v).sort().at(-1)??null,
    undatedSalesCount:unlinked.filter(r=>!r.values.sale?.date).length };
}
