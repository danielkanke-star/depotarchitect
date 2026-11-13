import { describe, expect, it } from "vitest";
import { csvTradeTable, parseTradeCsv } from "@/lib/trade-import";
import { parseFlatexConfirmation } from "@/lib/flatex-import";
import { flexResponse, parseFlexReport } from "@/lib/ibkr/flex-report";
import { parseAccountBalanceCsv } from "@/lib/account-balances";
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
    const { account, trade } = parseFlatexConfirmation(flatex.replaceAll(" ", "   "), "EUR");
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
    expect(report.valuation).toEqual({ netAssetValue: { date: "2026-01-12", total: "54321.01" }, balances: [], marks: [{ conid: "1234", currency: "USD", date: "2026-01-12", price: "2.45" }] });
    expect(parseFlexReport(flex, "CHF").trades[0].conversion).toBeUndefined();
    expect(parseFlexReport(flex, "CHF").valuation.netAssetValue).toBeUndefined();
    expect(() => parseFlexReport(flex.replace("openCloseIndicator=\"O\"", "openCloseIndicator=\"O;C\""), "EUR")).toThrow("Eröffnung/Schließung");
    expect(() => parseFlexReport('<!DOCTYPE x [<!ENTITY foo SYSTEM "file:///etc/passwd">]>' + flex, "EUR")).toThrow("Dokumenttypen");
    expect(() => flexResponse("<FlexStatementResponse><Status>Warn</Status><ErrorCode>1019</ErrorCode></FlexStatementResponse>")).toThrow("erstellt den Bericht");
  });

  it("imports reported cash and settled cash independently, without deriving a payout", () => {
    const cash = `<CashReport><CashReportCurrency currency="BASE_SUMMARY" endingCash="-20" endingSettledCash="15"/>
      <CashReportCurrency currency="USD" endingCash="90" endingSettledCash="80" toDate="20260112"/>
      <CashReportCurrency currency="CHF" endingCash="120" toDate="20260110"/></CashReport>`;
    const statement = flex.replace("</FlexStatement>", cash + "</FlexStatement>").replace(/<Trades>[\s\S]*?<\/Trades>/, "");
    const report = parseFlexReport(statement, "EUR", "balances");
    expect(report.trades).toEqual([]);
    expect(report.valuation.marks).toEqual([]);
    expect(report.valuation.balances).toEqual([
      { kind: "cash_total", currency: "EUR", amount: "-20", settled: "15", observedAt: "2026-01-12T00:00:00.000Z" },
      { kind: "cash_currency", currency: "USD", amount: "90", settled: "80", observedAt: "2026-01-12T00:00:00.000Z" },
    ]);
    expect(parseFlexReport(statement, "EUR").valuation.balances).toHaveLength(2);
  });

  it("accepts nine-decimal IBKR balances and rounds directly to their storage precision", () => {
    const cash = `<CashReport><CashReportCurrency currency="BASE_SUMMARY" endingCash="-20.123456785" endingSettledCash="15.123456781"/></CashReport>`;
    const statement = flex.replace('total="54321.01"', 'total="1234.564999999"')
      .replace("</EquitySummaryInBase>", '<EquitySummaryByReportDateInBase currency="EUR" total="9876.543210987" reportDate="20260111"/></EquitySummaryInBase>')
      .replace("</FlexStatement>", cash + "</FlexStatement>");
    const report = parseFlexReport(statement, "EUR", "balances");
    expect(report.valuation.netAssetValue).toEqual({ date: "2026-01-12", total: "1234.56" });
    expect(report.valuation.balances[0]).toMatchObject({ amount: "-20.12345679", settled: "15.12345678" });
    expect(() => parseFlexReport(statement.replace('endingCash="-20.123456785"', 'endingCash="invalid"'), "EUR", "balances")).toThrow("IBKR-Cashsaldo in EUR");
  });

  it("accepts an explicitly reported worthless expiration while rejecting assignment and exercise", () => {
    const expires = flex.replace('expiry="20261218"', 'expiry="20260105"')
      .replace('openCloseIndicator="O"', 'openCloseIndicator="C"')
      .replace('tradePrice="2.60"', 'tradePrice="0" transactionType="BookTrade" notes="Ep"');
    expect(parseFlexReport(expires, "EUR").trades[0]).toMatchObject({ effect: "close", direction: "long_put", price: "0" });
    for (const invalid of [
      expires.replace('notes="Ep"', 'notes="Ep;A"'),
      expires.replace('notes="Ep"', 'notes="Ex"'),
      expires.replace('notes="Ep"', 'notes="AEx"'),
      expires.replace('tradePrice="0"', 'tradePrice="2"'),
      expires.replace('expiry="20260105"', 'expiry="20260106"'),
    ]) expect(() => parseFlexReport(invalid, "EUR")).toThrow("Eröffnung/Schließung");
  });

  it("requires a distinct dated broker value for withdrawable cash, including a reported zero", () => {
    const header = "Art;Währung;Betrag;Stand\n";
    expect(parseAccountBalanceCsv(header + "Depotwert;EUR;-1,25;2026-01-12\nAuszahlbar ohne Kredit;CHF;0;2026-01-12T14:30:00+01:00", "EUR")).toEqual([
      { kind: "depot_value", currency: "EUR", amount: "-1.25", observedAt: "2026-01-12T00:00:00.000Z" },
      { kind: "withdrawable", currency: "CHF", amount: "0", observedAt: "2026-01-12T13:30:00.000Z" },
    ]);
    expect(() => parseAccountBalanceCsv(header + "Auszahlbar ohne Kredit;EUR;-5;2026-01-12", "EUR")).toThrow("negativ");
    expect(() => parseAccountBalanceCsv(header + "Depotwert;USD;5;2026-01-12", "EUR")).toThrow("EUR");
    expect(() => parseAccountBalanceCsv(header + "Cash gesamt;EUR;5;2099-01-12", "EUR")).toThrow("Zukunft");
    expect(() => parseAccountBalanceCsv(header + "Cash gesamt;EUR;5;2026-02-30", "EUR")).toThrow("Berichtstag");
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
