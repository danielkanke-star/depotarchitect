import { calculatePosition } from "./calculations/position-calculations";

export const MAX_IMPORT_ROWS = 2000;
export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

export type CsvField =
  | "external_position_id"
  | "ticker"
  | "instrument_name"
  | "category_name"
  | "status"
  | "direction"
  | "instrument_type"
  | "quantity"
  | "multiplier"
  | "entry_price"
  | "current_price"
  | "instrument_currency"
  | "entry_fx_to_base"
  | "current_fx_to_base"
  | "data_as_of"
  | "entry_date"
  | "stop_price"
  | "market_value"
  | "risk_amount"
  | "margin_requirement"
  | "margin_rate"
  | "margin_percent"
  | "sector"
  | "strategy"
  | "notes"
  | "option_type"
  | "strike_price"
  | "expiration_date";

export type ColumnMapping = Record<number, CsvField | "ignore">;
export type CategoryResolution = {
  mode: "existing" | "new" | "unassigned";
  target?: string;
};

export type NormalizedPosition = {
  external_position_id: string | null;
  ticker: string;
  instrument_name: string | null;
  category_name: string | null;
  status: "active" | "watch" | "high" | "danger" | "closed";
  direction: "long" | "short" | "long_put" | "long_call" | "short_put" | "short_call";
  instrument_type: "stock" | "etf" | "option" | "warrant" | "knock_out" | "cash" | "other";
  quantity: number;
  multiplier: number;
  entry_price: number | null;
  current_price: number | null;
  instrument_currency: string | null;
  entry_fx_to_base: number | null;
  current_fx_to_base: number | null;
  current_fx_as_of: string | null;
  current_fx_source: string | null;
  current_fx_status: "imported" | null;
  current_price_as_of: string | null;
  current_price_source: string | null;
  current_price_status: "imported" | null;
  entry_date: string | null;
  stop_price: number | null;
  market_value: number | null;
  risk_amount: number | null;
  margin_requirement: number | null;
  margin_rate: number | null;
  margin_source: "imported_direct" | "estimated" | "missing";
  sector: string | null;
  strategy: string | null;
  notes: string | null;
  option_type: "call" | "put" | null;
  strike_price: number | null;
  expiration_date: string | null;
};

export type ParsedCsv = {
  delimiter: ";" | "," | "\t";
  delimiterLabel: string;
  encoding: "UTF-8";
  headerDetected: boolean;
  headers: string[];
  rows: string[][];
  mapping: ColumnMapping;
};

export type AnalyzedRow = {
  rowNumber: number;
  raw: string[];
  status: "valid" | "warning" | "error";
  errors: string[];
  warnings: string[];
  derivedFields: string[];
  marginPreview: { original: string | null; normalizedRate: number | null; calculatedRequirement: number | null };
  position: NormalizedPosition | null;
};

export type ImportAnalysis = {
  rows: AnalyzedRow[];
  validRows: number;
  warningRows: number;
  errorRows: number;
  unknownCategories: string[];
  unknownInstrumentTypes: string[];
  probableDuplicateRows: number[];
  missingRequiredRows: number[];
  normalizedPositions: NormalizedPosition[];
  newCategories: string[];
};

export const CSV_FIELDS: Array<{ value: CsvField | "ignore"; label: string }> = [
  { value: "ignore", label: "Nicht importieren" },
  { value: "external_position_id", label: "Externe Positions-ID" },
  { value: "ticker", label: "Ticker" },
  { value: "instrument_name", label: "Bezeichnung" },
  { value: "category_name", label: "Kategorie" },
  { value: "status", label: "Status" },
  { value: "direction", label: "Richtung" },
  { value: "instrument_type", label: "Instrumenttyp" },
  { value: "quantity", label: "Menge" },
  { value: "multiplier", label: "Faktor / Multiplikator" },
  { value: "entry_price", label: "Einstandskurs" },
  { value: "current_price", label: "Aktueller Kurs" },
  { value: "instrument_currency", label: "Instrumentwährung" },
  { value: "entry_fx_to_base", label: "Entry-FX zur Basiswährung" },
  { value: "current_fx_to_base", label: "Aktueller FX zur Basiswährung" },
  { value: "data_as_of", label: "Datenzeitpunkt" },
  { value: "entry_date", label: "Einstiegsdatum" },
  { value: "stop_price", label: "Trading-Stop" },
  { value: "market_value", label: "Marktwert" },
  { value: "risk_amount", label: "Risiko bis Stop" },
  { value: "margin_requirement", label: "Margin-Anforderung" },
  { value: "margin_rate", label: "Marginquote (0,25 = 25 %)" },
  { value: "margin_percent", label: "Margin-Prozent" },
  { value: "sector", label: "Sektor" },
  { value: "strategy", label: "Strategie" },
  { value: "notes", label: "Kommentar" },
  { value: "option_type", label: "Optionsart" },
  { value: "strike_price", label: "Ausübungspreis" },
  { value: "expiration_date", label: "Verfallsdatum" },
];

const aliases: Record<CsvField, string[]> = {
  external_position_id: ["external id", "external position id", "externe id", "positions id", "position id"],
  ticker: ["ticker", "symbol", "wkn ticker", "wertpapier ticker"],
  instrument_name: ["bezeichnung", "name", "instrument", "instrument name", "wertpapier"],
  category_name: ["kategorie", "category", "strategie", "bucket"],
  status: ["status", "ampel", "positionsstatus"],
  direction: ["richtung", "direction", "seite", "side"],
  instrument_type: ["instrumenttyp", "instrument type", "wertpapierart", "typ", "asset type"],
  quantity: ["stuck", "stueck", "anzahl", "menge", "quantity", "qty"],
  multiplier: ["faktor", "multiplikator", "multiplier", "contract multiplier"],
  entry_price: ["kaufkurs", "einstand", "einstandskurs", "entry price", "cost basis"],
  current_price: ["aktueller kurs", "current price", "kurs", "last price", "mark price"],
  instrument_currency: ["wahrung", "waehrung", "currency", "instrument currency", "instrumentwahrung"],
  entry_fx_to_base: ["entry_fx_to_base", "entry fx to base", "entry fx zur basiswahrung"],
  current_fx_to_base: ["fx_to_base", "fx to base", "current_fx_to_base", "current fx to base", "fx zur basiswahrung", "instrumentwahrung in basiswahrung"],
  data_as_of: ["datenzeitpunkt", "data as of", "as of", "kurszeitpunkt"],
  entry_date: ["einstiegsdatum", "kaufdatum", "entry date", "open date"],
  stop_price: ["stop", "trading stop", "stoppreis", "stop price"],
  market_value: ["marktwert", "market value", "positionswert", "position value"],
  risk_amount: ["risiko bis stop", "positionsrisiko", "risk amount", "risk to stop"],
  margin_requirement: ["margin anforderung", "margin requirement", "margin betrag", "margin amount"],
  margin_rate: ["margin_rate", "margin rate", "marginquote", "margin quote"],
  margin_percent: ["margin prozent", "margin percent", "margin pct", "margin %"],
  sector: ["sektor", "sector", "branche", "industry"],
  strategy: ["strategie", "strategy", "setup"],
  notes: ["kommentar", "notiz", "notizen", "comment", "notes"],
  option_type: ["optionsart", "option type", "call put", "put call"],
  strike_price: ["ausubungspreis", "ausuebungspreis", "strike", "strike price"],
  expiration_date: ["verfallsdatum", "falligkeit", "faelligkeit", "expiration", "expiry", "expiry date"],
};

const normalizedAliasToField = new Map<string, CsvField>();
for (const [field, names] of Object.entries(aliases) as Array<[CsvField, string[]]>) {
  for (const name of names) normalizedAliasToField.set(normalizeLabel(name), field);
}

function normalizeLabel(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9%]+/g, " ")
    .trim()
    .toLowerCase();
}

function parseDelimited(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (character === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }

  if (quoted) throw new Error("Die CSV-Datei enthält ein nicht geschlossenes Anführungszeichen.");
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }

  return rows.filter((candidate) => candidate.some((value) => value.trim() !== ""));
}

function delimiterScore(rows: string[][]) {
  if (rows.length === 0) return -1;
  const frequencies = new Map<number, number>();
  for (const row of rows.slice(0, 25)) {
    frequencies.set(row.length, (frequencies.get(row.length) ?? 0) + 1);
  }
  const [columns, occurrences] = [...frequencies.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  return columns > 1 ? columns * occurrences : 0;
}

function autoMap(headers: string[]) {
  const mapping: ColumnMapping = {};
  const used = new Set<CsvField>();
  headers.forEach((header, index) => {
    const field = normalizedAliasToField.get(normalizeLabel(header));
    if (field && !used.has(field)) {
      mapping[index] = field;
      used.add(field);
    } else {
      mapping[index] = "ignore";
    }
  });
  return mapping;
}

export function parseCsvText(input: string): ParsedCsv {
  const text = input.replace(/^\uFEFF/, "");
  if (!text.trim()) throw new Error("Die CSV-Datei ist leer.");

  const candidates = ([";", ",", "\t"] as const).map((delimiter) => {
    const rows = parseDelimited(text, delimiter);
    return { delimiter, rows, score: delimiterScore(rows) };
  });
  const selected = candidates.sort((a, b) => b.score - a.score)[0];
  const maxColumns = Math.max(...selected.rows.map((row) => row.length));
  if (maxColumns < 2) throw new Error("Es konnten keine getrennten CSV-Spalten erkannt werden.");
  const firstRow = selected.rows[0];
  const headerMatches = firstRow.filter((cell) => normalizedAliasToField.has(normalizeLabel(cell))).length;
  const headerDetected = headerMatches > 0;
  const headers = headerDetected
    ? Array.from({ length: maxColumns }, (_, index) => firstRow[index] || `Spalte ${index + 1}`)
    : Array.from({ length: maxColumns }, (_, index) => `Spalte ${index + 1}`);
  const rows = headerDetected ? selected.rows.slice(1) : selected.rows;
  if (rows.length === 0) throw new Error("Die CSV-Datei enthält keine Datenzeilen.");
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Maximal ${MAX_IMPORT_ROWS} Datenzeilen können in einem Import verarbeitet werden.`);
  }

  return {
    delimiter: selected.delimiter,
    delimiterLabel: selected.delimiter === ";" ? "Semikolon" : selected.delimiter === "," ? "Komma" : "Tabulator",
    encoding: "UTF-8",
    headerDetected,
    headers,
    rows,
    mapping: headerDetected ? autoMap(headers) : Object.fromEntries(headers.map((_, index) => [index, "ignore"])),
  };
}

export function parseLocalizedNumber(value: string): number | null | "invalid" {
  const compact = value.trim().replace(/[\s€$£]/g, "");
  if (!compact) return null;
  if (!/^[+-]?[\d.,']+$/.test(compact)) return "invalid";

  let normalized = compact.replace(/'/g, "");
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = normalized.split(thousandsSeparator).join("").replace(decimalSeparator, ".");
  } else if (lastComma >= 0) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if ((normalized.match(/\./g) ?? []).length > 1) {
    const pieces = normalized.split(".");
    const decimal = pieces.pop();
    normalized = `${pieces.join("")}.${decimal}`;
  }

  const result = Number(normalized);
  return Number.isFinite(result) ? result : "invalid";
}

export function parseDate(value: string): string | null | "invalid" {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let year: number;
  let month: number;
  let day: number;

  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(trimmed);
    if (!match) return "invalid";
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return "invalid";
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function mappedValues(raw: string[], mapping: ColumnMapping) {
  const values = {} as Record<CsvField, string>;
  Object.entries(mapping).forEach(([index, field]) => {
    if (field !== "ignore") values[field] = raw[Number(index)]?.trim() ?? "";
  });
  return values;
}

const instrumentTypes: Record<string, NormalizedPosition["instrument_type"]> = {
  aktie: "stock", aktien: "stock", stock: "stock", equity: "stock",
  etf: "etf", fonds: "etf", option: "option", optionsschein: "warrant", warrant: "warrant",
  knockout: "knock_out", "knock out": "knock_out", knock_out: "knock_out",
  cash: "cash", bargeld: "cash", sonstiges: "other", other: "other",
};
const directions: Record<string, NormalizedPosition["direction"]> = {
  long: "long", kauf: "long", buy: "long", short: "short", verkauf: "short", sell: "short",
  "long put": "long_put", longput: "long_put", "long call": "long_call", longcall: "long_call",
  "short put": "short_put", shortput: "short_put", "short call": "short_call", shortcall: "short_call",
};
const statuses: Record<string, NormalizedPosition["status"]> = {
  aktiv: "active", active: "active", ok: "active", watch: "watch", beobachten: "watch",
  hoch: "high", high: "high", gefahr: "danger", danger: "danger", geschlossen: "closed", closed: "closed",
};
const optionTypes: Record<string, "call" | "put"> = {
  call: "call", kaufoption: "call", put: "put", verkaufsoption: "put",
};

function enumValue<T extends string>(raw: string | undefined, values: Record<string, T>, fallback?: T): T | "invalid" | null {
  if (!raw?.trim()) return fallback ?? null;
  return values[normalizeLabel(raw)] ?? "invalid";
}

function numberField(values: Record<CsvField, string>, field: CsvField, label: string, errors: string[]) {
  const parsed = parseLocalizedNumber(values[field] ?? "");
  if (parsed === "invalid") errors.push(`${label} ist keine Zahl.`);
  return parsed === "invalid" ? null : parsed;
}

export function normalizeMarginRate(values: Pick<Record<CsvField, string>, "margin_rate" | "margin_percent">) {
  const rateRaw = values.margin_rate?.trim() ?? "";
  const percentRaw = values.margin_percent?.trim() ?? "";
  if (rateRaw && percentRaw) return { original: `${rateRaw} / ${percentRaw}`, rate: null, error: "Marginquote und Margin-Prozent dürfen nicht gleichzeitig befüllt sein." };
  const original = rateRaw || percentRaw;
  if (!original) return { original: null, rate: null, error: null };
  const hasPercentSign = original.endsWith("%");
  const numeric = parseLocalizedNumber(hasPercentSign ? original.slice(0, -1) : original);
  if (numeric === null || numeric === "invalid") return { original, rate: null, error: "Marginquote ist keine Zahl." };

  const rate = rateRaw
    ? hasPercentSign ? numeric / 100 : numeric
    : numeric / 100;
  if (rate < 0 || rate > 1) {
    return {
      original,
      rate: null,
      error: rateRaw
        ? "Eine ausdrücklich als Quote definierte Spalte muss zwischen 0 und 1 liegen oder ein Prozentzeichen enthalten."
        : "Margin-Prozent muss zwischen 0 und 100 liegen.",
    };
  }
  return { original, rate, error: null };
}

function dateField(values: Record<CsvField, string>, field: CsvField, label: string, errors: string[]) {
  const parsed = parseDate(values[field] ?? "");
  if (parsed === "invalid") errors.push(`${label} ist nicht erkennbar.`);
  return parsed === "invalid" ? null : parsed;
}

function dateTimeField(values: Record<CsvField, string>, field: CsvField, label: string, errors: string[]) {
  const raw = values[field]?.trim() ?? "";
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    errors.push(`${label} ist nicht erkennbar.`);
    return null;
  }
  return date.toISOString();
}

export function analyzeImport(
  parsed: Pick<ParsedCsv, "rows" | "headerDetected">,
  mapping: ColumnMapping,
  existingCategories: string[],
  categoryResolutions: Record<string, CategoryResolution> = {},
  baseCurrency = "EUR",
): ImportAnalysis {
  const existingCategoryMap = new Map(existingCategories.map((name) => [normalizeLabel(name), name]));
  const unknownCategorySet = new Set<string>();
  const unknownInstrumentTypeSet = new Set<string>();
  const newCategorySet = new Set<string>();
  const missingRequiredRows = new Set<number>();

  const rows: AnalyzedRow[] = parsed.rows.map((raw, index) => {
    const values = mappedValues(raw, mapping);
    const errors: string[] = [];
    const warnings: string[] = [];
    const derivedFields: string[] = [];
    const rowNumber = index + (parsed.headerDetected ? 2 : 1);
    const ticker = (values.ticker ?? "").trim().toUpperCase();
    if (!ticker) {
      errors.push("Ticker fehlt.");
      missingRequiredRows.add(rowNumber);
    }

    const quantity = numberField(values, "quantity", "Menge", errors);
    if (quantity === null) {
      errors.push("Menge fehlt.");
      missingRequiredRows.add(rowNumber);
    } else if (quantity <= 0) {
      errors.push("Menge muss größer als null sein.");
    }

    const multiplier = numberField(values, "multiplier", "Faktor", errors) ?? 1;
    if (multiplier <= 0) errors.push("Faktor muss größer als null sein.");

    const currentPrice = numberField(values, "current_price", "Aktueller Kurs", errors);
    const marketValue = numberField(values, "market_value", "Marktwert", errors);
    if (marketValue === null && currentPrice === null) {
      errors.push("Marktwert oder aktueller Kurs fehlt.");
      missingRequiredRows.add(rowNumber);
    } else if (marketValue === null && currentPrice !== null && quantity !== null) {
      derivedFields.push("Marktwert");
      warnings.push("Marktwert wird nach dem Import zentral aus den Ausgangsdaten berechnet.");
    }

    const instrumentCurrency = values.instrument_currency?.trim().toUpperCase() || null;
    if (instrumentCurrency && !/^[A-Z]{3}$/.test(instrumentCurrency)) errors.push("Instrumentwährung muss ein dreistelliger ISO-Code sein.");
    const entryFxToBase = numberField(values, "entry_fx_to_base", "Entry-FX zur Basiswährung", errors);
    const parsedCurrentFxToBase = numberField(values, "current_fx_to_base", "Aktueller FX zur Basiswährung", errors);
    const currentFxToBase = parsedCurrentFxToBase ?? (instrumentCurrency === baseCurrency.trim().toUpperCase() ? 1 : null);
    if (entryFxToBase !== null && entryFxToBase <= 0) errors.push("Entry-FX zur Basiswährung muss größer als null sein.");
    if (currentFxToBase !== null && currentFxToBase <= 0) errors.push("Aktueller FX zur Basiswährung muss größer als null sein.");
    if (currentPrice !== null && currentFxToBase === null && marketValue === null) {
      warnings.push("Wechselkurs fehlt; der Marktwert bleibt bis zur Ergänzung nicht berechenbar.");
    }

    const entryPrice = numberField(values, "entry_price", "Einstandskurs", errors);
    const stopPrice = numberField(values, "stop_price", "Trading-Stop", errors);
    const riskAmount = numberField(values, "risk_amount", "Risiko bis Stop", errors);
    const marginRequirement = numberField(values, "margin_requirement", "Margin-Anforderung", errors);
    const normalizedMargin = normalizeMarginRate(values);
    if (normalizedMargin.error) errors.push(normalizedMargin.error);
    const marginRate = normalizedMargin.rate;
    const strikePrice = numberField(values, "strike_price", "Ausübungspreis", errors);
    const numericValues: Array<[string, number | null]> = [
      ["Einstandskurs", entryPrice], ["Aktueller Kurs", currentPrice], ["Trading-Stop", stopPrice],
      ["Marktwert", marketValue], ["Risiko bis Stop", riskAmount], ["Margin-Anforderung", marginRequirement],
      ["Marginquote", marginRate], ["Ausübungspreis", strikePrice],
    ];
    for (const [label, value] of numericValues) {
      if (value !== null && value < 0) errors.push(`${label} darf nicht negativ sein.`);
    }

    const instrumentTypeRaw = values.instrument_type?.trim();
    const instrumentType = enumValue(instrumentTypeRaw, instrumentTypes, "stock");
    if (instrumentType === "invalid") {
      errors.push(`Unbekannter Instrumenttyp: ${instrumentTypeRaw}.`);
      unknownInstrumentTypeSet.add(instrumentTypeRaw);
    }

    const directionRaw = values.direction?.trim();
    const direction = enumValue(directionRaw, directions, "long");
    if (direction === "invalid") errors.push(`Unbekannte Richtung: ${directionRaw}.`);

    const statusRaw = values.status?.trim();
    const status = enumValue(statusRaw, statuses, "active");
    if (status === "invalid") errors.push(`Unbekannter Status: ${statusRaw}.`);

    const optionTypeRaw = values.option_type?.trim();
    const optionType = enumValue(optionTypeRaw, optionTypes);
    if (optionType === "invalid") errors.push(`Unbekannte Optionsart: ${optionTypeRaw}.`);
    const entryDate = dateField(values, "entry_date", "Einstiegsdatum", errors);
    const expirationDate = dateField(values, "expiration_date", "Verfallsdatum", errors);
    const dataAsOf = dateTimeField(values, "data_as_of", "Datenzeitpunkt", errors);
    if (instrumentType === "option") {
      if (!optionType || optionType === "invalid") errors.push("Option ohne gültige Optionsart.");
      if (strikePrice === null) errors.push("Option ohne Ausübungspreis.");
      if (expirationDate === null) errors.push("Option ohne Verfallsdatum.");
    }

    const categoryRaw = values.category_name?.trim() ?? "";
    let categoryName: string | null = null;
    if (categoryRaw) {
      const existing = existingCategoryMap.get(normalizeLabel(categoryRaw));
      if (existing) {
        categoryName = existing;
      } else {
        unknownCategorySet.add(categoryRaw);
        const resolution = categoryResolutions[categoryRaw];
        if (!resolution) {
          warnings.push(`Unbekannte Kategorie: ${categoryRaw}.`);
        } else if (resolution.mode === "unassigned") {
          warnings.push(`Kategorie ${categoryRaw} wird als Nicht zugeordnet importiert.`);
        } else if (resolution.mode === "existing" && resolution.target) {
          const target = existingCategoryMap.get(normalizeLabel(resolution.target));
          if (target) categoryName = target;
          else errors.push(`Zielkategorie für ${categoryRaw} ist nicht vorhanden.`);
        } else if (resolution.mode === "new") {
          const target = (resolution.target || categoryRaw).trim();
          if (!target || target.length > 100) errors.push(`Neue Kategorie für ${categoryRaw} ist ungültig.`);
          else {
            categoryName = target;
            newCategorySet.add(target);
            warnings.push(`Neue Kategorie wird angelegt: ${target}.`);
          }
        }
      }
    }

    const position: NormalizedPosition | null = errors.length > 0 || !instrumentType || instrumentType === "invalid" || !direction || direction === "invalid" || !status || status === "invalid" || optionType === "invalid" || quantity === null
      ? null
      : {
        external_position_id: values.external_position_id?.trim() || null,
        ticker,
        instrument_name: values.instrument_name?.trim() || null,
        category_name: categoryName,
        status,
        direction,
        instrument_type: instrumentType,
        quantity,
        multiplier,
        entry_price: entryPrice,
        current_price: currentPrice,
        instrument_currency: instrumentCurrency,
        entry_fx_to_base: entryFxToBase,
        current_fx_to_base: currentFxToBase,
        current_fx_as_of: currentFxToBase === null ? null : dataAsOf,
        current_fx_source: currentFxToBase === null ? null : "custom_csv",
        current_fx_status: currentFxToBase === null ? null : "imported",
        current_price_as_of: currentPrice === null ? null : dataAsOf,
        current_price_source: currentPrice === null ? null : "custom_csv",
        current_price_status: currentPrice === null ? null : "imported",
        entry_date: entryDate,
        stop_price: stopPrice,
        market_value: marketValue,
        risk_amount: riskAmount,
        margin_requirement: marginRequirement,
        margin_rate: marginRate,
        margin_source: marginRequirement !== null ? "imported_direct" : marginRate !== null ? "estimated" : "missing",
        sector: values.sector?.trim() || null,
        strategy: values.strategy?.trim() || null,
        notes: values.notes?.trim() || null,
        option_type: optionType,
        strike_price: strikePrice,
        expiration_date: expirationDate,
      };

    if (position) {
      const calculation = calculatePosition({
        id: String(rowNumber),
        ticker: position.ticker,
        instrumentType: position.instrument_type,
        direction: position.direction,
        quantity: position.quantity,
        multiplier: position.multiplier,
        entryPrice: position.entry_price,
        currentPrice: position.current_price,
        entryFxToBase: position.entry_fx_to_base,
        currentFxToBase: position.current_fx_to_base,
        netLiquidity: null,
        effectiveStopPrice: position.stop_price,
        directMarginRequirement: position.margin_requirement,
        directMarginProvenance: position.margin_requirement === null ? undefined : "imported_direct",
        marginRate: position.margin_rate,
      });
      const calculatedMarketValue = calculation.positionValueBase.value;
      if (calculatedMarketValue !== null) {
        derivedFields.push("Marktwert in Basiswährung");
        if (marketValue !== null && materiallyDifferent(marketValue, calculatedMarketValue)) {
          warnings.push(`Importierter Marktwert ${marketValue} weicht vom berechneten Wert ${calculatedMarketValue} ab und wird nicht als fachliche Wahrheit verwendet.`);
        }
      }
      const calculatedRisk = calculation.stopRisk.value;
      if (calculatedRisk !== null) {
        derivedFields.push("Risiko bis Stop");
        if (riskAmount !== null && materiallyDifferent(riskAmount, calculatedRisk)) {
          warnings.push(`Importiertes Risiko ${riskAmount} weicht vom berechneten Wert ${calculatedRisk} ab und wird nicht als fachliche Wahrheit verwendet.`);
        }
      }
    }

    return {
      rowNumber,
      raw,
      status: errors.length ? "error" : warnings.length ? "warning" : "valid",
      errors,
      warnings,
      derivedFields,
      marginPreview: {
        original: normalizedMargin.original,
        normalizedRate: marginRate,
        calculatedRequirement: position ? calculatePosition({
          id: String(rowNumber),
          ticker: position.ticker,
          instrumentType: position.instrument_type,
          direction: position.direction,
          quantity: position.quantity,
          multiplier: position.multiplier,
          entryPrice: position.entry_price,
          currentPrice: position.current_price,
          currentFxToBase: position.current_fx_to_base,
          netLiquidity: null,
          effectiveStopPrice: position.stop_price,
          directMarginRequirement: position.margin_requirement,
          directMarginProvenance: position.margin_requirement === null ? undefined : "imported_direct",
          marginRate: position.margin_rate,
        }).marginRequirement.value : null,
      },
      position,
    };
  });

  const identityRows = new Map<string, number>();
  const probableDuplicateRows = new Set<number>();
  for (const row of rows) {
    if (!row.position) continue;
    const position = row.position;
    const identity = JSON.stringify([
      position.external_position_id,
      position.ticker,
      position.instrument_type,
      position.direction,
      position.quantity,
      position.entry_price,
      position.option_type,
      position.strike_price,
      position.expiration_date,
    ]);
    const firstRow = identityRows.get(identity);
    if (firstRow) {
      probableDuplicateRows.add(firstRow);
      probableDuplicateRows.add(row.rowNumber);
      row.warnings.push(`Wahrscheinlich identisch mit Zeile ${firstRow}.`);
      row.status = "warning";
      const original = rows.find((candidate) => candidate.rowNumber === firstRow);
      if (original && !original.warnings.some((warning) => warning.startsWith("Wahrscheinlich identisch"))) {
        original.warnings.push(`Wahrscheinlich identisch mit Zeile ${row.rowNumber}.`);
        original.status = "warning";
      }
    } else {
      identityRows.set(identity, row.rowNumber);
    }
  }

  const normalizedPositions = rows.flatMap((row) => row.position ? [row.position] : []);
  return {
    rows,
    validRows: normalizedPositions.length,
    warningRows: rows.filter((row) => row.status === "warning").length,
    errorRows: rows.filter((row) => row.status === "error").length,
    unknownCategories: [...unknownCategorySet],
    unknownInstrumentTypes: [...unknownInstrumentTypeSet],
    probableDuplicateRows: [...probableDuplicateRows].sort((a, b) => a - b),
    missingRequiredRows: [...missingRequiredRows].sort((a, b) => a - b),
    normalizedPositions,
    newCategories: [...newCategorySet],
  };
}

function materiallyDifferent(reported: number, calculated: number) {
  return Math.abs(reported - calculated) > Math.max(0.01, Math.abs(calculated) * 0.001);
}
