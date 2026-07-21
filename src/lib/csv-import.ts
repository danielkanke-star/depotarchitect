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
  | "entry_date"
  | "stop_price"
  | "market_value"
  | "risk_amount"
  | "margin_requirement"
  | "margin_percent"
  | "sector"
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
  instrument_type: "stock" | "etf" | "option" | "cash" | "other";
  quantity: number;
  multiplier: number;
  entry_price: number | null;
  current_price: number | null;
  entry_date: string | null;
  stop_price: number | null;
  market_value: number | null;
  risk_amount: number | null;
  margin_requirement: number | null;
  margin_percent: number | null;
  sector: string | null;
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
  { value: "entry_date", label: "Einstiegsdatum" },
  { value: "stop_price", label: "Trading-Stop" },
  { value: "market_value", label: "Marktwert" },
  { value: "risk_amount", label: "Risiko bis Stop" },
  { value: "margin_requirement", label: "Margin-Anforderung" },
  { value: "margin_percent", label: "Margin-Prozent" },
  { value: "sector", label: "Sektor" },
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
  entry_date: ["einstiegsdatum", "kaufdatum", "entry date", "open date"],
  stop_price: ["stop", "trading stop", "stoppreis", "stop price"],
  market_value: ["marktwert", "market value", "positionswert", "position value"],
  risk_amount: ["risiko bis stop", "positionsrisiko", "risk amount", "risk to stop"],
  margin_requirement: ["margin anforderung", "margin requirement", "margin betrag", "margin amount"],
  margin_percent: ["margin prozent", "margin percent", "margin pct", "margin %"],
  sector: ["sektor", "sector", "branche", "industry"],
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
  etf: "etf", fonds: "etf", option: "option", optionsschein: "option",
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

function dateField(values: Record<CsvField, string>, field: CsvField, label: string, errors: string[]) {
  const parsed = parseDate(values[field] ?? "");
  if (parsed === "invalid") errors.push(`${label} ist nicht erkennbar.`);
  return parsed === "invalid" ? null : parsed;
}

export function analyzeImport(
  parsed: Pick<ParsedCsv, "rows" | "headerDetected">,
  mapping: ColumnMapping,
  existingCategories: string[],
  categoryResolutions: Record<string, CategoryResolution> = {},
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
    let marketValue = numberField(values, "market_value", "Marktwert", errors);
    if (marketValue === null && currentPrice === null) {
      errors.push("Marktwert oder aktueller Kurs fehlt.");
      missingRequiredRows.add(rowNumber);
    } else if (marketValue === null && currentPrice !== null && quantity !== null) {
      marketValue = Math.round(quantity * multiplier * currentPrice * 100) / 100;
      derivedFields.push("Marktwert");
      warnings.push("Marktwert wurde aus Menge, Faktor und aktuellem Kurs abgeleitet.");
    }

    const entryPrice = numberField(values, "entry_price", "Einstandskurs", errors);
    const stopPrice = numberField(values, "stop_price", "Trading-Stop", errors);
    const riskAmount = numberField(values, "risk_amount", "Risiko bis Stop", errors);
    const marginRequirement = numberField(values, "margin_requirement", "Margin-Anforderung", errors);
    const marginPercent = numberField(values, "margin_percent", "Margin-Prozent", errors);
    const strikePrice = numberField(values, "strike_price", "Ausübungspreis", errors);
    const numericValues: Array<[string, number | null]> = [
      ["Einstandskurs", entryPrice], ["Aktueller Kurs", currentPrice], ["Trading-Stop", stopPrice],
      ["Marktwert", marketValue], ["Risiko bis Stop", riskAmount], ["Margin-Anforderung", marginRequirement],
      ["Margin-Prozent", marginPercent], ["Ausübungspreis", strikePrice],
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
        entry_date: entryDate,
        stop_price: stopPrice,
        market_value: marketValue,
        risk_amount: riskAmount,
        margin_requirement: marginRequirement,
        margin_percent: marginPercent,
        sector: values.sector?.trim() || null,
        notes: values.notes?.trim() || null,
        option_type: optionType,
        strike_price: strikePrice,
        expiration_date: expirationDate,
      };

    return {
      rowNumber,
      raw,
      status: errors.length ? "error" : warnings.length ? "warning" : "valid",
      errors,
      warnings,
      derivedFields,
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
