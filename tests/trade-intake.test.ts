import { describe, expect, it } from "vitest";
import { csvTradeTable, parseTradeCsv } from "@/lib/trade-import";
import { parseFlatexConfirmation } from "@/lib/flatex-import";
import { flexResponse, parseFlexReport } from "@/lib/ibkr/flex-report";
import { fetchHistoricalReferenceRate } from "@/lib/market-data-providers/fx-core";

const flatex = `flatex
Handelstag 12.05.2022
Wertpapierabrechnung Verkauf Fonds
Nr.123456789/1 Verkauf Beispiel Fonds (IE00BQ3D6V05/A12GPB)
Ausgeführt : 80 St. Kurswert : 4.216,61 EUR
Kurs : 55,080000 USD Provision : 0,00 EUR
Devisenkurs : 1,045010 Eigene Spesen : 0,00 EUR
Die Verrechnung der Endbeträge erfolgt über Ihr Konto Nr.: 1000000000`;

const flex = `<FlexQueryResponse><FlexStatements><FlexStatement accountId="U9999999" toDate="20260112">
<AccountInformation currency="EUR"/><Trades>
<Trade accountId="U9999999" tradeID="209842" conid="1234" assetCategory="OPT" levelOfDetail="EXECUTION" symbol="EX 261218P00010000" description="Example &amp; Co" currency="USD" dateTime="20260105;113000" tradeDate="20260105" buySell="SELL" openCloseIndicator="O" quantity="-1" tradePrice="2.60" multiplier="100" putCall="P" strike="10" expiry="20261218" fxRateToBase="0.85"/>
<Trade levelOfDetail="ORDER"/>
</Trades><EquitySummaryInBase><EquitySummaryByReportDateInBase accountId="U9999999" currency="EUR" total="54321.01" reportDate="20260112"/></EquitySummaryInBase>
<OpenPositions><OpenPosition accountId="U9999999" currency="USD" conid="1234" levelOfDetail="SUMMARY" markPrice="2.45" reportDate="20260112"/></OpenPositions>
</FlexStatement></FlexStatements></FlexQueryResponse>`;

describe("broker intake formats", () => {
  it("maps common CSV headings and preserves fractional units and trade days", () => {
    const raw = "Datum;Typ;ISIN;Stückzahl;Kurs;Währung\n05.01.2026;Kauf;US0378331005;1,234567;120,35;USD";
    const file = csvTradeTable(raw);
    expect(parseTradeCsv(raw, file.mapping)[0]).toMatchObject({ date: "2026-01-05", type: "other", effect: "open", quantity: "1.234567", price: "120.35", isin: "US0378331005" });
    expect(() => parseTradeCsv(raw + "\n" + raw.split("\n")[1], file.mapping)).toThrow("Buchungsnummer");
  });

  it("reads standalone flatex confirmations and validates the printed conversion against gross values", () => {
    const { account, trade } = parseFlatexConfirmation(flatex, "EUR");
    expect(account).toBe("1000000000");
    expect(trade).toMatchObject({ reference: "123456789/1", date: "2022-05-12", ticker: "IE00BQ3D6V05", effect: "close", price: "55.08", currency: "USD", conversionSource: "flatex-Abrechnung" });
    expect(Number(trade.conversion)).toBeCloseTo(0.956928, 5);
    expect(parseFlatexConfirmation(flatex.replace("4.216,61", "2.216,61"), "EUR").trade.conversion).toBeUndefined();
    expect(() => parseFlatexConfirmation(flatex + "\nSammelabrechnung", "EUR")).toThrow("einzelne");
    expect(() => parseFlatexConfirmation(flatex.replace("55,080000 USD", "99,00 %"), "EUR")).toThrow("Stückkurs");
  });

  it("reads IBKR executions and optional dated valuations without confusing account currencies", () => {
    const report = parseFlexReport(flex, "EUR");
    expect(report.trades).toEqual([expect.objectContaining({ reference: "209842", instrument: "1234", name: "Example & Co", direction: "short_put", effect: "open", quantity: "1", multiplier: "100", strike: "10", expiry: "2026-12-18", conversion: "0.85" })]);
    expect(report.valuation).toEqual({ netAssetValue: { date: "2026-01-12", total: "54321.01" }, marks: [{ conid: "1234", currency: "USD", date: "2026-01-12", price: "2.45" }] });
    expect(parseFlexReport(flex, "CHF").trades[0].conversion).toBeUndefined();
    expect(parseFlexReport(flex, "CHF").valuation.netAssetValue).toBeUndefined();
    expect(() => parseFlexReport(flex.replace("openCloseIndicator=\"O\"", "openCloseIndicator=\"O;C\""), "EUR")).toThrow("Eröffnung/Schließung");
    expect(() => parseFlexReport('<!DOCTYPE x [<!ENTITY foo SYSTEM "file:///etc/passwd">]>' + flex, "EUR")).toThrow("Dokumenttypen");
    expect(() => flexResponse("<FlexStatementResponse><Status>Warn</Status><ErrorCode>1019</ErrorCode></FlexStatementResponse>")).toThrow("erstellt den Bericht");
  });

  it("uses only a dated and correctly directed reference rate", async () => {
    const fetcher = async (url: RequestInfo | URL) => {
      expect(String(url)).toContain("/usd/eur?providers=ecb&date=2026-01-10");
      return Response.json({ base: "USD", quote: "EUR", date: "2026-01-09", rate: 0.86 });
    };
    await expect(fetchHistoricalReferenceRate("USD", "EUR", "2026-01-10", fetcher)).resolves.toMatchObject({ rate: 0.86, date: "2026-01-09" });
    await expect(fetchHistoricalReferenceRate("USD", "EUR", "2026-01-10", async () => Response.json({ base: "USD", quote: "EUR", date: "2026-01-11", rate: 0.86 }))).resolves.toBeNull();
  });
});
