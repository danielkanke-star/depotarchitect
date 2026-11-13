import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_REQUEST_BYTES, prepareImportPayload } from "@/lib/import-file";
import { readImportPayload } from "@/lib/import-file-server";
import { csvTradeTable, parseTradeCsv } from "@/lib/trade-import";
import { parseFlexReport } from "@/lib/ibkr/flex-report";

function payloadForm(payload: string | Blob) {
  const form = new FormData();
  form.set("file_data", payload);
  return form;
}

describe("file import transport", () => {
  it("keeps small imports unchanged and validates the transfer size server-side", async () => {
    const text = "Buchungsnummer;Währung\n1;EUR";
    expect(await prepareImportPayload(text)).toBe(text);
    expect(await readImportPayload(payloadForm(text))).toBe(text);
    await expect(readImportPayload(payloadForm("a".repeat(MAX_IMPORT_REQUEST_BYTES + 1)))).rejects.toThrow("übertragen");
  });

  it("transports a 13 MB CSV losslessly, including quoted and non-ASCII data", async () => {
    const text = 'Datum;Typ;ISIN;Stückzahl;Kurs;Währung;Kommentar\n2026-01-05;Kauf;US0378331005;1,25;120,35;USD;"'
      + 'Größe; ""Beleg""\n'.repeat(800_000) + '"';
    expect(Buffer.byteLength(text)).toBeGreaterThanOrEqual(13_000_000);
    const compressed = await prepareImportPayload(text);
    expect(compressed).toBeInstanceOf(Blob);
    const received = await readImportPayload(payloadForm(compressed));
    expect(received).toBe(text);
    expect(parseTradeCsv(received, csvTradeTable(received).mapping)[0]).toMatchObject({ quantity: "1.25", price: "120.35" });
  });

  it("accepts larger Flex files while keeping parser validation", async () => {
    const text = '<FlexQueryResponse><FlexStatements><FlexStatement accountId="U1234" toDate="20260112">'
      + '<AccountInformation currency="EUR"/><CashReport><CashReportCurrency currency="BASE_SUMMARY" endingCash="12.34"/></CashReport>'
      + "<Unused>" + "x".repeat(13_000_000) + "</Unused></FlexStatement></FlexStatements></FlexQueryResponse>";
    const result = await readImportPayload(payloadForm(await prepareImportPayload(text)));
    expect(parseFlexReport(result, "EUR", "balances").valuation.balances).toMatchObject([{ currency: "EUR", amount: "12.34" }]);
  });

  it("rejects invalid compressed content and caps the expanded data", async () => {
    const overLimit = "x".repeat(MAX_IMPORT_FILE_BYTES + 1);
    const oversized = new Blob([new Uint8Array(gzipSync(overLimit))], { type: "application/gzip" });
    await expect(prepareImportPayload(overLimit)).rejects.toThrow("25 MB");
    await expect(readImportPayload(payloadForm(oversized))).rejects.toThrow("25 MB");
    const invalid = new Blob(["invalid"], { type: "application/gzip" });
    await expect(readImportPayload(payloadForm(invalid))).rejects.toThrow("gelesen");
  });
});
