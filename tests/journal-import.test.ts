import { describe, expect, it } from "vitest";
import { analyzeJournalCsv, JOURNAL_TEMPLATE } from "../src/lib/journal-import";
const now = new Date("2026-10-27T12:00:00Z");
describe("Google Sheets journal migration", () => {
  it("recognizes the fifth-row header, quoted comments and inverse EURUSD", async () => {
    const text = 'Kontogröße;100000\nProfil;Aggressiv\nÜbersicht;\nInfo;\n;Ticker;Kategorie;Positions-typ;Richtungs faktor; ;Menge;Einstands-kurs;Einstig-Datum;Trading-Stop;;Margin (%);Währung;Verkaufskurs;Verkauf-Datum;Währunskurs;Aktueller Kurs;Kommentar\n;AMZN;Kerninvestment;LONG;;verkauft;1.000;100;01.10.2026;95;14.10.26;15%;EURUSD;110;14.10.2026;1,1;120;"Notiz; bleibt"';
    const p = await analyzeJournalCsv(text,"EUR",now);
    expect(p.errors).toBe(0); expect(p.entries).toHaveLength(1);
    expect(p.entries[0]).toMatchObject({ instrument_currency:"USD", direction:"long", margin_rate:0.15, entry_margin_base:null, notes:"Notiz; bleibt", stop_updated_at:"2026-10-14T12:00:00+01:00" });
    expect(p.entries[0].current_fx_to_base).toBeCloseTo(1/1.1);
    expect(p.entries[0].sales[0]).toMatchObject({ quantity:1000, price:110, sale_date:"2026-10-14", fx_to_base:null });
  });
  it("can preserve complete entry references from the explicit template", async () => {
    const p = await analyzeJournalCsv(JOURNAL_TEMPLATE,"EUR",now);
    expect(p.errors).toBe(0); expect(p.entries[0]).toMatchObject({ entry_margin_base:135, entry_fx_to_base:0.9, quantity_step:0.01 });
  });
  it("does not silently import a free-text option contract as a stock", async () => {
    const p = await analyzeJournalCsv(JOURNAL_TEMPLATE.replace("BEISPIEL", "SAMPLE Jun17'27 132 CALL"), "EUR", now);
    expect(p.entries).toHaveLength(0);
    expect(p.rows[0].errors).toContainEqual(expect.stringContaining("Optionskontrakt"));
    expect((await analyzeJournalCsv(JOURNAL_TEMPLATE.replace("BEISPIEL", "CALL"), "EUR", now)).errors).toBe(0);
  });
  it("produces stable keys and retains identical separate lots", async () => {
    const text = JOURNAL_TEMPLATE+JOURNAL_TEMPLATE.split("\n")[1]+"\n";
    const a = await analyzeJournalCsv(text,"EUR",now), b = await analyzeJournalCsv(text,"EUR",now);
    expect(a.entries).toHaveLength(2); expect(a.entries[0].source_key).not.toBe(a.entries[1].source_key);
    expect(a.entries.map(e=>e.source_key)).toEqual(b.entries.map(e=>e.source_key));
  });
  it("rejects missing or impossible execution dates and never uses today's date", async () => {
    const p = await analyzeJournalCsv(JOURNAL_TEMPLATE.replace(';open;',';closed;').replace(';0;;;;',';10;110;31.02.2026;0,9;'),"EUR",now);
    expect(p.errors).toBeGreaterThan(0); expect(p.entries).toHaveLength(0);
  });
  it("rejects ambiguous hedge direction and future entry dates", async () => {
    const p = await analyzeJournalCsv(JOURNAL_TEMPLATE.replace(';long;',';hedge;').replace('2026-10-01','2027-01-01'),"EUR",now);
    expect(p.rows[0].errors).toEqual(expect.arrayContaining([expect.stringContaining("Richtung"),expect.stringContaining("Zukunft")]));
  });
});
