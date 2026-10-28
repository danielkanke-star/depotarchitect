import { describe, it, expect } from "vitest";
import { examplePosition as position, exampleSale as sale, createPreviewData } from "../src/lib/preview-data";
import { calculateJournal, salePnl } from "../src/lib/journal";
import { buildOverview } from "../src/lib/depot-overview";

describe("trade accounting before costs", () => {
  it("realizes each execution but counts the trade only on full closure", () => {
    const first = sale("p", { quantity: 2, price: 110 });
    const partial = position({ id: "p", sold_quantity: 2 });
    const stats = calculateJournal([partial], [first]);
    expect(stats.realized).toBe(18); expect(stats.closedCount).toBe(0); expect(stats.hitRate).toBeNull();
    const closed = calculateJournal([{ ...partial, sold_quantity: 10 }], [first, sale("p", { id: "second", quantity: 8, price: 95, sale_date: "2026-10-20" })]);
    expect(closed.realized).toBe(-18); expect(closed.closedCount).toBe(1); expect(closed.losses).toBe(1);
    expect(closed.trades[0].annualized).toBeNull();
  });
  it("groups same-day entries by category and waits for all of them", () => {
    const p = position({ id: "a", sold_quantity: 10 }), second = position({ id: "b" });
    expect(calculateJournal([p, second], [sale("a")]).closedCount).toBe(0);
    const separateCategory = calculateJournal([p, { ...second, category_id: "other" }], [sale("a")]);
    expect(separateCategory.trades).toHaveLength(2); expect(separateCategory.closedCount).toBe(1);
    expect(calculateJournal([p, { ...second, entry_date: "2026-10-02" }], [sale("a")]).trades).toHaveLength(2);
  });
  it("keeps frozen entry margin independent of current FX and margin requirements", () => {
    const p = position({ id: "p", sold_quantity: 10, entry_margin_base: 150 });
    const first = calculateJournal([p], [sale("p")]);
    const changed = calculateJournal([{ ...p, margin_rate: 0.8, margin_requirement: 900, current_fx_to_base: 0.5 }], [sale("p")]);
    expect(first.marginReturn).toBe(1.2); expect(changed.marginReturn).toBe(1.2);
  });
  it("preserves imported partial trade groups after resolving an open remainder's quote listing", () => {
    const closed = position({ id: "closed", sold_quantity: 10, source_import_id: "source-a", journal_source_key: "row-a", source_type: "custom_csv" });
    const open = position({ id: "open", source_import_id: "source-a", journal_source_key: "row-b", source_type: "custom_csv", listing_id: "verified-listing" });
    const stats = calculateJournal([closed, open], [sale("closed")]);
    expect(stats.trades).toHaveLength(1);
    expect(stats.closedCount).toBe(0);
    expect(calculateJournal([closed, { ...open, category_id: "other" }], [sale("closed")]).trades).toHaveLength(2);
    expect(calculateJournal([closed, { ...open, source_import_id: "unrelated-import" }], [sale("closed")]).trades).toHaveLength(2);
    const verified = position({ id: "verified", listing_id: "listing-one" });
    expect(calculateJournal([verified, { ...verified, id: "different", listing_id: "listing-two" }], []).trades).toHaveLength(2);
    const original = { ...closed, journal_instrument_ref: "original-sheet-instrument" };
    const normalized = { ...open, journal_instrument_ref: "original-sheet-instrument", ticker: "NORMALIZED", listing_id: "verified" };
    expect(calculateJournal([original, normalized], [sale("closed")]).trades).toHaveLength(1);
    expect(calculateJournal([original, { ...normalized, journal_instrument_ref: "different-source-listing" }], [sale("closed")]).trades).toHaveLength(2);
  });
  it("does not substitute current FX or current margin for unknown historical data", () => {
    const p = position({ id: "p", sold_quantity: 10, entry_margin_base: null });
    const stats = calculateJournal([p], [sale("p", { fx_to_base: null })]);
    expect(stats.trades[0].pnl).toBeNull(); expect(stats.marginReturn).toBeNull(); expect(stats.hitRate).toBeNull(); expect(stats.incompleteClosedCount).toBe(1);
  });
  it("uses the sign of a short and the actual execution FX", () => {
    expect(salePnl(position({ direction: "short", entry_price: 100, multiplier: 2 }), sale("x", { quantity: 2.5, price: 90, fx_to_base: 0.8 }))).toEqual({ native: 50, base: 40 });
  });
  it("counts flat outcomes in the hit-rate denominator and uses only the last twelve months", () => {
    const ps = [position({ id: "a", sold_quantity: 10 }), position({ id: "b", ticker: "OTHER", sold_quantity: 10 })];
    const stats = calculateJournal(ps, [sale("a"), sale("b", { price: 100, sale_date: "2025-09-01" })], new Date("2026-10-27T10:00:00Z"));
    expect(stats.hitRate).toBe(0.5); expect(stats.flat).toBe(1); expect(stats.rollingRealized).toBe(180);
  });
  it("counts Amazon once per category despite three separate entries", () => {
    const overview = buildOverview(createPreviewData());
    expect(overview.categoryOverview.find(c => c.id === "core")?.count).toBe(1);
    expect(overview.categoryOverview.find(c => c.id === "core")?.rows).toBe(3);
    expect(overview.instruments.find(i => i.ticker === "AMZN")?.count).toBe(3);
    expect(overview.journal.trades.filter(t => t.ticker === "AMZN")).toHaveLength(3);
    const oldFx=createPreviewData(); oldFx.positions[0].current_fx_as_of="2025-01-01T00:00:00Z";
    expect(buildOverview(oldFx).staleFx).toBe(1);
  });
});
