import Decimal from "decimal.js";
import { parseDate, parseDelimited, parseLocalizedNumber, MAX_FILE_SIZE_BYTES, MAX_IMPORT_ROWS } from "./csv-import";
import { berlinDate } from "./risk-rules";
import { looksLikeOptionContract } from "./source-instrument";

export type JournalEntry = {
  source_key: string; ticker: string; category: string; instrument_type: "stock" | "etf"; direction: "long" | "short";
  quantity: number; multiplier: number; quantity_step: number; entry_price: number; entry_date: string;
  instrument_currency: string; entry_fx_to_base: number | null; current_fx_to_base: number | null;
  current_price: number | null; stop_price: number | null; stop_updated_at: string | null; margin_rate: number | null;
  entry_margin_base: number | null; tradingview_url: string | null; notes: string | null;
  sales: { quantity: number; price: number; sale_date: string; fx_to_base: number | null; fx_source: string | null }[];
};
export type JournalImportRow = { row: number; ticker: string; errors: string[]; warnings: string[]; entry: JournalEntry | null };
export type JournalImportPreview = { rows: JournalImportRow[]; entries: JournalEntry[]; errors: number; warnings: number; format: string; skipped: number };
const label = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const aliases: Record<string, string[]> = {
  ticker: ["Ticker", "Symbol"], category: ["Kategorie", "category"], direction: ["Positionstyp", "direction", "Richtung"],
  status: ["Status", "gekauftverkauft"], quantity: ["Menge", "quantity"], entry_price: ["Einstandskurs", "entry_price"],
  entry_date: ["EinstigDatum", "Einstiegsdatum", "entry_date"], stop_price: ["TradingStop", "stop_price"],
  stop_updated_at: ["stop_updated_at", "Stoppdatum"], margin_rate: ["Margin (%)", "margin_rate", "Marginquote"],
  instrument_currency: ["Währung", "instrument_currency"], price: ["Verkaufskurs", "sale_price"], sale_date: ["VerkaufDatum", "Verkaufsdatum", "sale_date"],
  current_fx_to_base: ["Währunskurs", "Währungskurs", "current_fx_to_base"], current_price: ["Aktueller Kurs", "current_price"],
  notes: ["Kommentar", "notes"], tradingview_url: ["TradingView Link", "tradingview_url"],
  entry_margin_base: ["Einstiegsmargin", "entry_margin_base"], entry_fx_to_base: ["entry_fx_to_base", "EinstiegsFX"],
  sale_fx: ["sale_fx_to_base", "VerkaufsFX"], sold_quantity: ["sold_quantity", "VerkaufteMenge"],
  multiplier: ["multiplier", "Multiplikator"], quantity_step: ["quantity_step", "Stückelung"], instrument_type: ["instrument_type", "Instrumentart"], external_id: ["journal_id", "JournalID"],
};
const aliasMap = new Map(Object.entries(aliases).flatMap(([field, names]) => names.map(n => [label(n), field])));
function dateValue(raw: string) {
  // The source sheet contains both 29.12.25 and 29.12.2025.
  const expanded = raw.replace(/^(\d{1,2}\.\d{1,2}\.)(\d{2})$/, (_match, prefix: string, year: string) => `${prefix}20${year}`);
  return parseDate(expanded);
}

export async function analyzeJournalCsv(text: string, baseCurrency = "EUR", now = new Date()): Promise<JournalImportPreview> {
  if (new TextEncoder().encode(text).length > MAX_FILE_SIZE_BYTES) throw new Error("Die Datei darf höchstens 2 MB groß sein.");
  const candidates = [";", ",", "\t"].map(delimiter => {
    const rows = parseDelimited(text.replace(/^\uFEFF/, ""), delimiter);
    const header = rows.slice(0, 20).findIndex(r => r.some(c => label(c) === "ticker") && r.some(c => ["menge", "quantity"].includes(label(c))));
    return { rows, header };
  });
  const chosen = candidates.find(c => c.header >= 0);
  if (!chosen) throw new Error("Keine Journal-Kopfzeile erkannt. Benötigt werden mindestens Ticker, Menge, Einstandskurs und Einstiegsdatum.");
  const headers = chosen.rows[chosen.header];
  const sheetFormat = headers.some(c => label(c) === "richtungsfaktor") && headers.some(c => label(c) === "tradingstop");
  const mapping = new Map<string, number>();
  headers.forEach((h, i) => { const f = aliasMap.get(label(h)); if (f) mapping.set(f, i); });
  if (sheetFormat) { mapping.set("status", 5); mapping.set("stop_updated_at", 10); }
  for (const key of ["ticker", "quantity", "entry_price", "entry_date", "instrument_currency", "direction", "status"]) if (!mapping.has(key)) throw new Error(`Pflichtspalte fehlt: ${key}.`);
  const dataRows = chosen.rows.slice(chosen.header + 1);
  if (dataRows.length > MAX_IMPORT_ROWS) throw new Error(`Höchstens ${MAX_IMPORT_ROWS} Datenzeilen sind möglich.`);
  const rows: JournalImportRow[] = []; const occurrences = new Map<string, number>(); let skipped = 0;
  const today = berlinDate(now);
  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    const raw = (key: string) => cells[mapping.get(key) ?? -1]?.trim() ?? "";
    const ticker = raw("ticker").toUpperCase();
    if (!ticker) { skipped++; continue; }
    const errors: string[] = [], warnings: string[] = [];
    const num = (key: string, required = false) => {
      let value=raw(key).replace(/%$/, "");
      // The recognized source sheet uses de_DE: 1.000 is one thousand, while
      // fractional quantities use a comma. Generic CSV keeps decimal dots.
      if (sheetFormat && /^[+-]?\d{1,3}(?:\.\d{3})+$/.test(value.replace(/[\s€$£]/g,""))) value=value.replace(/\./g,"");
      const v = parseLocalizedNumber(value);
      if (v === "invalid" && ["current_price","current_fx_to_base"].includes(key)) warnings.push(`${key}: keine numerische Kursreferenz; Wert bleibt unbekannt.`);
      else if (v === "invalid" || (required && v === null)) errors.push(`${key}: gültige Zahl erforderlich.`);
      return v === "invalid" ? null : v;
    };
    const date = (key: string, required = false) => { const d = dateValue(raw(key)); if (d === "invalid" || (required && d === null)) errors.push(`${key}: gültiges Datum erforderlich.`); return d === "invalid" ? null : d; };
    const quantity = num("quantity", true), entry = num("entry_price", true), entryDate = date("entry_date", true);
    const stop = num("stop_price"), price = num("current_price"), salePrice = num("price"), saleDate = date("sale_date");
    const multiplier = num("multiplier") ?? 1, step = num("quantity_step") ?? (quantity !== null && !Number.isInteger(quantity) ? 0.000001 : 1);
    if (quantity !== null && (quantity <= 0 || new Decimal(quantity).decimalPlaces() > 6)) errors.push("Menge muss positiv sein und darf höchstens sechs Nachkommastellen haben.");
    if (entry !== null && entry < 0 || stop !== null && stop < 0 || price !== null && price < 0 || multiplier <= 0 || step < 0.000001 || new Decimal(step).decimalPlaces() > 6) errors.push("Kurse, Multiplikator und Stückelung prüfen.");
    if (entryDate && entryDate > today) errors.push("Einstiegsdatum liegt in der Zukunft.");
    const directionRaw = label(raw("direction"));
    const direction = ["long", "kauf", "buy"].includes(directionRaw) ? "long" : ["short", "sell"].includes(directionRaw) ? "short" : null;
    if (!direction) errors.push("Richtung nicht eindeutig: LONG oder SHORT angeben; Hedge ist eine Kategorie.");
    const type = label(raw("instrument_type") || "stock");
    const instrumentType = ["stock", "aktie"].includes(type) ? "stock" : type === "etf" ? "etf" : null;
    if (!instrumentType) errors.push("Der Journalimport unterstützt Aktien und ETFs. Derivate benötigen geprüfte Vertragsdaten.");
    if (looksLikeOptionContract(ticker)) errors.push("Optionskontrakt im Ticker erkannt. Kontraktzahl, Multiplikator und Vertragsdaten müssen vor der Übernahme geprüft werden.");
    let currency = raw("instrument_currency").toUpperCase(), currentFx = num("current_fx_to_base");
    if (sheetFormat && /^[A-Z]{6}$/.test(currency)) {
      const from = currency.slice(0, 3), to = currency.slice(3);
      if (from === baseCurrency) { currency = to; currentFx = currentFx !== null && currentFx > 0 ? new Decimal(1).div(currentFx).toNumber() : null; }
      else if (to === baseCurrency) { currency = from; }
      else errors.push("Währungspaar passt nicht zur Depotbasiswährung.");
    }
    if (!/^[A-Z]{3}$/.test(currency)) errors.push("Handelswährung muss eindeutig sein (zum Beispiel USD).");
    if (currency === baseCurrency) currentFx = 1;
    let entryFx = num("entry_fx_to_base"), saleFx = num("sale_fx");
    if (currency === baseCurrency) { entryFx = 1; saleFx = 1; }
    for (const value of [currentFx, entryFx, saleFx]) if (value !== null && value <= 0) errors.push("Wechselkurse müssen positiv sein.");
    let margin = num("margin_rate");
    if (margin !== null && (raw("margin_rate").endsWith("%") || sheetFormat)) margin /= 100;
    if (margin !== null && (margin < 0 || margin > 1)) errors.push("Marginquote muss zwischen 0 und 1 liegen, Prozentwerte mit % angeben.");
    const marginBase = num("entry_margin_base");
    if (marginBase !== null && marginBase < 0) errors.push("Einstiegsmargin darf nicht negativ sein.");
    // A current sheet margin percentage is not evidence for the historical margin.
    if (marginBase === null) warnings.push("Historische Einstiegsmargin fehlt; Marginrendite bleibt offen.");
    const status = label(raw("status"));
    const closed = ["verkauft", "closed", "geschlossen"].includes(status);
    if (!closed && !["gekauft", "active", "offen", "open", "teilverkauft"].includes(status)) errors.push("Status nicht erkannt: gekauft/verkauft oder open/closed verwenden.");
    const sold = num("sold_quantity") ?? (closed ? quantity : 0);
    const sales: JournalEntry["sales"] = [];
    if (sold !== null && sold > 0) {
      if (salePrice === null || salePrice < 0 || !saleDate || saleDate > today || (entryDate !== null && saleDate < entryDate) || (quantity !== null && sold > quantity)) errors.push("Verkaufsmenge, Kurs und tatsächliches Verkaufsdatum prüfen.");
      else sales.push({ quantity: sold, price: salePrice, sale_date: saleDate, fx_to_base: saleFx, fx_source: saleFx === null ? null : currency === baseCurrency ? "identity" : "import_execution_reference" });
      if (saleFx === null) warnings.push("Historischer Verkaufs-FX fehlt; realisierter Euro-G&V bleibt offen.");
    } else if (saleDate || salePrice !== null) errors.push("Verkaufsdaten ohne verkaufte Menge. Status und sold_quantity prüfen.");
    if (closed && sold !== quantity) errors.push("Geschlossene Zeilen müssen vollständig verkauft sein.");
    if (!closed && (!price || currentFx === null || stop === null)) warnings.push("Aktueller Kurs, FX oder Stopp fehlt; die Risikoübersicht kann unvollständig sein.");
    const stopDate = date("stop_updated_at");
    if (stopDate && stopDate > today) errors.push("Stoppdatum liegt in der Zukunft.");
    if (stop !== null && !stopDate) warnings.push("Stoppdatum unbekannt; wird nicht auf heute gesetzt.");
    let url = raw("tradingview_url") || null;
    if (url && !/^https:\/\/([a-z0-9-]+\.)?tradingview\.com\//.test(url)) { warnings.push("TradingView-Feld enthält keinen übernehmbaren HTTPS-Link; Text wird im Kommentar erhalten."); url = null; }
    if (ticker.length > 80 || raw("category").length > 100 || raw("notes").length > 1000) errors.push("Ticker, Kategorie oder Kommentar ist zu lang.");
    if (!raw("category")) warnings.push("Kategorie fehlt; Position bleibt sichtbar ohne Zuordnung.");
    // Includes execution data: repeated identical files are skipped; changed files
    // must be reviewed rather than silently overwriting a previously imported lot.
    const identity = JSON.stringify([raw("external_id") || null, ticker, raw("category"), direction, currency, quantity, entry, entryDate, sold, salePrice, saleDate]);
    const occurrence = (occurrences.get(identity) ?? 0) + 1; occurrences.set(identity, occurrence);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${identity}:${occurrence}`));
    const key = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
    const normalized: JournalEntry | null = errors.length || quantity === null || entry === null || entryDate === null || !direction || !instrumentType ? null : {
      source_key: key, ticker, category: raw("category"), direction, instrument_type: instrumentType, quantity, multiplier, quantity_step: step,
      entry_price: entry, entry_date: entryDate, instrument_currency: currency, entry_fx_to_base: entryFx, current_fx_to_base: currentFx,
      current_price: price, stop_price: stop, stop_updated_at: stopDate ? `${stopDate}T12:00:00+01:00` : null, margin_rate: margin, entry_margin_base: marginBase,
      tradingview_url: url, notes: [raw("notes"), !url && raw("tradingview_url") ? `TradingView: ${raw("tradingview_url")}` : ""].filter(Boolean).join("\n").slice(0,1000) || null, sales,
    };
    rows.push({ row: chosen.header + i + 2, ticker, errors, warnings, entry: normalized });
  }
  if (!rows.length) throw new Error("Keine Positionen gefunden.");
  return { rows, entries: rows.flatMap(r => r.entry ? [r.entry] : []), errors: rows.filter(r => r.errors.length).length, warnings: rows.filter(r => r.warnings.length).length,
    format: sheetFormat ? "Google-Sheets-Depotjournal · Kopfzeile automatisch erkannt" : "DepotArchitect-Journal", skipped };
}

export const JOURNAL_TEMPLATE = "journal_id;ticker;category;direction;status;quantity;entry_price;entry_date;instrument_currency;current_price;stop_price;stop_updated_at;margin_rate;entry_fx_to_base;entry_margin_base;current_fx_to_base;sold_quantity;sale_price;sale_date;sale_fx_to_base;quantity_step;notes;tradingview_url\nbeispiel-1;BEISPIEL;Kerninvestment;long;open;10;100;2026-10-01;USD;110;95;2026-10-14;15%;0,9;135;0,9;0;;;;0,01;Beispiel ersetzen;\n";
