import { describe, expect, it } from "vitest";
import { analyzeImport, parseCsvText, type ColumnMapping } from "../src/lib/csv-import";

function parseAndAnalyze(csv: string, mapping?: ColumnMapping) {
  const parsed = parseCsvText(csv);
  return { parsed, analysis: analyzeImport(parsed, mapping ?? parsed.mapping, ["Kerninvestment", "Momentumtrade", "taktische Beimischung", "Hedge"]) };
}

describe("CSV snapshot parser", () => {
  it("parses semicolon CSV, German decimals and German dates", () => {
    const { parsed, analysis } = parseAndAnalyze("Ticker;Menge;Aktueller Kurs;Einstiegsdatum\nSAP;2;123,45;21.07.2026");
    expect(parsed.delimiterLabel).toBe("Semikolon");
    expect(analysis.normalizedPositions[0]).toMatchObject({ ticker: "SAP", quantity: 2, current_price: 123.45, entry_date: "2026-07-21", market_value: null });
    expect(analysis.rows[0].derivedFields).toContain("Marktwert");
  });

  it("parses comma CSV with quoted values and English decimal points", () => {
    const { parsed, analysis } = parseAndAnalyze('Symbol,Quantity,Current Price,Bezeichnung\nMSFT,3,412.25,"Microsoft, Inc."');
    expect(parsed.delimiterLabel).toBe("Komma");
    expect(analysis.normalizedPositions[0]).toMatchObject({ ticker: "MSFT", quantity: 3, current_price: 412.25, instrument_name: "Microsoft, Inc." });
  });

  it("parses tab-separated CSV and ISO dates", () => {
    const { parsed, analysis } = parseAndAnalyze("Ticker\tMenge\tMarktwert\tEinstiegsdatum\nANET\t4\t1200.50\t2026-07-20");
    expect(parsed.delimiterLabel).toBe("Tabulator");
    expect(analysis.normalizedPositions[0].entry_date).toBe("2026-07-20");
  });

  it("rejects an empty file", () => {
    expect(() => parseCsvText("\n \n")).toThrow("leer");
  });

  it("supports files without a header through manual mapping", () => {
    const parsed = parseCsvText("SAP;2;100\nMSFT;3;200");
    const mapping: ColumnMapping = { 0: "ticker", 1: "quantity", 2: "market_value" };
    const analysis = analyzeImport(parsed, mapping, []);
    expect(parsed.headerDetected).toBe(false);
    expect(analysis.normalizedPositions.map((position) => position.ticker)).toEqual(["SAP", "MSFT"]);
  });

  it("reports missing ticker, invalid quantity and negative values concretely", () => {
    const { analysis } = parseAndAnalyze("Ticker;Menge;Marktwert;Stop\n;nicht-zahl;100;-1");
    expect(analysis.errorRows).toBe(1);
    expect(analysis.rows[0].errors).toEqual(expect.arrayContaining([
      "Ticker fehlt.",
      "Menge ist keine Zahl.",
      "Menge fehlt.",
      "Trading-Stop darf nicht negativ sein.",
    ]));
  });

  it("allows multiple tranches of the same ticker when identity fields differ", () => {
    const { analysis } = parseAndAnalyze("Ticker;Menge;Marktwert;Einstand\nSAP;2;200;90\nSAP;2;220;95");
    expect(analysis.validRows).toBe(2);
    expect(analysis.probableDuplicateRows).toEqual([]);
  });

  it("allows two different options on the same underlying", () => {
    const csv = "Ticker;Menge;Marktwert;Instrumenttyp;Richtung;Optionsart;Ausübungspreis;Verfallsdatum\nQQQ;1;300;Option;Long Call;Call;500;2026-09-18\nQQQ;1;280;Option;Long Put;Put;450;2026-10-16";
    const { analysis } = parseAndAnalyze(csv);
    expect(analysis.validRows).toBe(2);
    expect(analysis.probableDuplicateRows).toEqual([]);
  });

  it("warns only for probably identical rows", () => {
    const { analysis } = parseAndAnalyze("Ticker;Menge;Marktwert;Einstand\nSAP;2;200;90\nSAP;2;200;90");
    expect(analysis.probableDuplicateRows).toEqual([2, 3]);
    expect(analysis.warningRows).toBe(2);
  });

  it("surfaces unknown categories and resolves them explicitly", () => {
    const parsed = parseCsvText("Ticker;Menge;Marktwert;Kategorie\nSAP;2;200;Sondersituationen");
    const unresolved = analyzeImport(parsed, parsed.mapping, ["Kerninvestment"]);
    const resolved = analyzeImport(parsed, parsed.mapping, ["Kerninvestment"], { Sondersituationen: { mode: "new", target: "Sondersituationen" } });
    expect(unresolved.unknownCategories).toEqual(["Sondersituationen"]);
    expect(resolved.newCategories).toEqual(["Sondersituationen"]);
    expect(resolved.normalizedPositions[0].category_name).toBe("Sondersituationen");
  });

  it("rejects unknown instrument types and incomplete options", () => {
    const unknown = parseAndAnalyze("Ticker;Menge;Marktwert;Instrumenttyp\nSAP;2;200;Kryptowarrant").analysis;
    const option = parseAndAnalyze("Ticker;Menge;Marktwert;Instrumenttyp\nQQQ;1;300;Option").analysis;
    expect(unknown.unknownInstrumentTypes).toEqual(["Kryptowarrant"]);
    expect(unknown.errorRows).toBe(1);
    expect(option.rows[0].errors).toEqual(expect.arrayContaining(["Option ohne gültige Optionsart.", "Option ohne Ausübungspreis.", "Option ohne Verfallsdatum."]));
  });

  it("never maps NetLiq to a position market value", () => {
    const parsed = parseCsvText("Ticker;Menge;Aktueller Kurs;NetLiq;Netto Liquidität\nSAP;2;100;50000;50000");
    expect(Object.values(parsed.mapping)).not.toContain("market_value");
    expect(parsed.mapping[3]).toBe("ignore");
    expect(parsed.mapping[4]).toBe("ignore");
  });
});
