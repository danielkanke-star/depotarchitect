import { SaxesParser } from "saxes";
import Decimal from "decimal.js";
import { statementDateTime, type AccountBalanceInput } from "@/lib/account-balances";
import { exactTradeNumber, isinPattern, MAX_REPORT_BYTES, MAX_TRADES, validateTrade, type Trade } from "@/lib/trade-import";

export class FlexReportError extends Error {
  constructor(message: string, readonly status: "pending" | "credentials" | "report" | "unavailable" = "report") {
    super(message);
  }
}

type Fields = Record<string, string>;

function xmlRead(xml: string, open: (tag: string, fields: Fields, path: readonly string[]) => void, value?: (tag: string, text: string) => void) {
  if (xml.length > MAX_REPORT_BYTES || !xml.trimStart().startsWith("<")) throw new FlexReportError("Bitte einen Flex-Bericht im XML-Format verwenden.");
  const parser = new SaxesParser({ xmlns: false });
  const stack: string[] = [];
  parser.on("doctype", () => { throw new FlexReportError("XML-Dokumenttypen sind nicht zulässig."); });
  parser.on("opentag", tag => {
    if (stack.length >= 20) throw new FlexReportError("Der Flex-Bericht ist zu tief verschachtelt.");
    open(tag.name, tag.attributes, stack);
    stack.push(tag.name);
  });
  parser.on("closetag", () => stack.pop());
  parser.on("text", text => value?.(stack.at(-1) ?? "", text.trim()));
  parser.on("error", () => { throw new FlexReportError("Der Flex-Bericht enthält ungültiges XML."); });
  parser.write(xml).close();
}

export function flexResponse(xml: string) {
  let root = "";
  const values: Fields = {};
  xmlRead(xml, (tag, _fields, path) => { if (!path.length) root = tag; }, (tag, text) => {
    if (["Status", "ReferenceCode", "ErrorCode"].includes(tag) && text) values[tag] = (values[tag] ?? "") + text;
  });
  if (root === "FlexQueryResponse") return { report: true as const };
  if (root !== "FlexStatementResponse") throw new FlexReportError("Unbekanntes Flex-Berichtsformat.");
  if (["1018", "1019"].includes(values.ErrorCode)) throw new FlexReportError("IBKR erstellt den Bericht noch. Bitte später erneut versuchen.", "pending");
  if (["1012", "1014", "1015", "1017", "1020"].includes(values.ErrorCode)) throw new FlexReportError("IBKR hat den Berichts-Zugang abgelehnt. Token und Abfrage-ID prüfen.", "credentials");
  if (values.Status === "Success" && /^\d{1,32}$/.test(values.ReferenceCode ?? "")) return { report: false as const, reference: values.ReferenceCode };
  throw new FlexReportError("IBKR konnte den Bericht gerade nicht bereitstellen. Bitte Abfrage und Zeitraum prüfen.", "unavailable");
}

const compactDate = (raw = "") => raw.match(/^(\d{4})-?(\d{2})-?(\d{2})$/)?.slice(1).join("-") ?? "";

function execution(row: Fields, baseCurrency: string, reportCurrency: string): Trade {
  const type = row.assetCategory === "OPT" ? "option" : row.assetCategory === "STK" ? (row.subCategory === "ETF" ? "etf" : "stock") : row.assetCategory === "FUND" ? "other" : null;
  const side = row.buySell === "BUY" ? "buy" : row.buySell === "SELL" ? "sell" : null;
  const indicator = row.openCloseIndicator;
  const effect = indicator === "O" ? "open" : indicator === "C" ? "close" : null;
  if (!type || !side || !effect || !/^\d+$/.test(row.conid ?? "") || !row.tradeID ||
    (row.transactionType && row.transactionType !== "ExchTrade" && row.transactionType !== "Trade") ||
    (row.notes ?? "").split(/[;, ]+/).some(code => ["Ca", "Co", "A", "Ex", "Ep"].includes(code))) {
    throw new Error("Buchungsart, Kontraktkennung oder Kennzeichnung für Eröffnung/Schließung wird nicht unterstützt.");
  }
  const long = (side === "buy") === (effect === "open");
  const option = type === "option" ? row.putCall === "P" ? "put" : row.putCall === "C" ? "call" : undefined : undefined;
  const strike = option ? exactTradeNumber(row.strike ?? "") : undefined;
  const expiry = option ? compactDate(row.expiry) : undefined;
  if (type === "option" && (!option || !expiry || !row.multiplier)) throw new Error("Optionsdaten fehlen.");
  const dateTime = (row.dateTime ?? "").match(/^(\d{4}-?\d{2}-?\d{2})[;T ](\d\d):?(\d\d):?(\d\d)$/);
  const time = dateTime ? dateTime.slice(2).join(":") : "";
  const date = compactDate(row.tradeDate || dateTime?.[1]);
  if (!time) throw new Error("Ausführungszeit fehlt. In der Flex-Abfrage „Date/Time“ auswählen.");
  const conversion = reportCurrency === baseCurrency && row.fxRateToBase
    ? exactTradeNumber(row.fxRateToBase, "decimal", 12) : undefined;
  return validateTrade({
    reference: row.tradeID, instrument: row.conid,
    ticker: (row.symbol ?? "").trim(), name: (row.description ?? row.symbol ?? "").trim(),
    currency: row.currency ?? "", date, time, side, effect, direction: option ? long ? `long_${option}` : `short_${option}` : long ? "long" : "short",
    type, quantity: new Decimal(exactTradeNumber(row.quantity ?? "")).abs().toFixed(),
    price: exactTradeNumber(row.tradePrice ?? ""), multiplier: exactTradeNumber(row.multiplier || "1"),
    ...(isinPattern.test(row.isin ?? "") ? { isin: row.isin } : {}),
    ...(option ? { option, strike, expiry } : {}),
    ...(conversion ? { conversion, conversionSource: "IBKR-Bericht" } : {}),
  });
}

export function parseFlexReport(xml: string, baseCurrency: string, mode: "full" | "balances" = "full") {
  const trades: Trade[] = [];
  let account = "";
  let accountCurrency = "";
  let foundTrades = false;
  let nonExecutionRows = 0;
  let reportThrough = "";
  const cashRows: Fields[] = [];
  let netAssetValue: { date: string; total: string } | undefined;
  const marks = new Map<string, { conid: string; currency: string; date: string; price: string }>();
  let root = "";
  xmlRead(xml, (tag, row, path) => {
    if (!path.length) root = tag;
    if (root !== "FlexQueryResponse") return;
    if (tag === "FlexStatement" && path.at(-1) === "FlexStatements") {
      if (!/^[A-Z0-9-]{4,40}$/.test(row.accountId ?? "") || account) {
        throw new FlexReportError("Die Flex-Abfrage muss genau ein Brokerkonto enthalten.");
      }
      account = row.accountId;
      accountCurrency = row.currency ?? "";
      reportThrough = compactDate(row.toDate);
    }
    if (tag === "AccountInformation" && path.includes("FlexStatement") && /^[A-Z]{3}$/.test(row.currency ?? "")) accountCurrency = row.currency;
    if (tag === "EquitySummaryByReportDateInBase" && path.at(-1) === "EquitySummaryInBase" &&
        (row.currency || accountCurrency) === baseCurrency && !row.model && (!row.accountId || row.accountId === account)) {
      const date = compactDate(row.reportDate);
      if (date && (!netAssetValue || date > netAssetValue.date) && row.total) {
        const total = exactTradeNumber(row.total, "decimal", 8);
        netAssetValue = { date, total };
      }
    }
    if (tag === "CashReportCurrency" && path.at(-1) === "CashReport" &&
      !row.model && (!row.accountId || row.accountId === account) && row.endingCash) {
      if (cashRows.length >= 1000) throw new FlexReportError("Der Cash Report enthält zu viele Zeilen.");
      cashRows.push(row);
    }
    if (mode === "balances") return;
    if (tag === "OpenPosition" && path.at(-1) === "OpenPositions" && row.levelOfDetail === "SUMMARY" && !row.model &&
        (!row.accountId || row.accountId === account) && /^\d+$/.test(row.conid ?? "") && /^[A-Z]{3}$/.test(row.currency ?? "") && row.markPrice) {
      const date = compactDate(row.reportDate) || reportThrough;
      const price = exactTradeNumber(row.markPrice, "decimal", 8);
      const key = `${row.conid}/${row.currency}`;
      if (date && new Decimal(price).gte(0) && (!marks.has(key) || date > marks.get(key)!.date)) {
        marks.set(key, { conid: row.conid, currency: row.currency, date, price });
      }
    }
    if (tag === "Trades" && path.at(-1) === "FlexStatement") foundTrades = true;
    if (tag !== "Trade" || path.at(-1) !== "Trades" || !path.includes("FlexStatement")) return;
    if ((row.levelOfDetail ?? "EXECUTION") !== "EXECUTION") { nonExecutionRows++; return; }
    if (row.accountId && row.accountId !== account) throw new FlexReportError("Die Flex-Abfrage muss genau ein Brokerkonto enthalten.");
    if (trades.length >= MAX_TRADES) throw new FlexReportError("Bitte den Zeitraum auf höchstens 2.000 Ausführungen begrenzen.");
    try { trades.push(execution(row, baseCurrency, accountCurrency)); }
    catch (error) { throw new FlexReportError(`Ausführung ${trades.length + 1}. ${error instanceof Error ? error.message : "Bericht prüfen."}`); }
  });
  if (root !== "FlexQueryResponse") flexResponse(xml);
  const balances = cashReportBalances(cashRows, accountCurrency, reportThrough);
  if (!account || (!foundTrades && !netAssetValue && !balances.length)) {
    throw new FlexReportError("Im Bericht fehlen verwendbare Handels- oder Kontowerte.");
  }
  if (nonExecutionRows && !trades.length) throw new FlexReportError("Der Bericht enthält Zusammenfassungen. Bitte den Detailgrad Ausführungen auswählen.");
  return { account, trades, valuation: { netAssetValue, balances, marks: [...marks.values()].slice(0, MAX_TRADES) } };
}

function cashReportBalances(rows: Fields[], baseCurrency: string, reportThrough: string) {
  const report = new Map<string, AccountBalanceInput>();
  for (const row of rows) {
    const total = row.currency === "BASE_SUMMARY";
    const currency = total ? baseCurrency : row.currency;
    const date = compactDate(row.reportDate) || compactDate(row.toDate) || reportThrough;
    if (!date || !/^[A-Z]{3}$/.test(currency ?? "")) continue;
    const kind = total ? "cash_total" : "cash_currency";
    const observedAt = statementDateTime(date);
    const amount = exactTradeNumber(row.endingCash, "decimal", 8);
    const settled = row.endingSettledCash ? exactTradeNumber(row.endingSettledCash, "decimal", 8) : undefined;
    const key = `${kind}/${currency}`;
    const existing = report.get(key);
    if (existing && existing.observedAt === observedAt && (existing.amount !== amount || existing.settled !== settled)) {
      throw new FlexReportError("Der Cash Report enthält widersprüchliche Beträge für denselben Stand.");
    }
    if (!existing || existing.observedAt < observedAt) report.set(key, { kind, currency, amount, settled, observedAt });
  }
  const newestDetail = [...report.values()].filter(row => row.kind === "cash_currency").map(row => row.observedAt).sort().at(-1);
  return [...report.values()].filter(row => row.kind === "cash_total" || row.observedAt === newestDetail);
}
