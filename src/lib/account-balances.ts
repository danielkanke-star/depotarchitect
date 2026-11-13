import { parseDate, parseDelimited } from "@/lib/csv-import";
import { exactTradeNumber } from "@/lib/trade-import";

export type AccountBalanceKind = "depot_value" | "cash_total" | "cash_currency" | "withdrawable";
export type AccountBalanceInput = {
  kind: AccountBalanceKind;
  currency: string;
  amount: string;
  observedAt: string;
  settled?: string;
};

export const accountBalanceLabels: Record<AccountBalanceKind, string> = {
  depot_value: "Depotwert",
  cash_total: "Cash gesamt",
  cash_currency: "Cash je Währung",
  withdrawable: "Auszahlbar ohne Kredit",
};

export function statementDateTime(date: string) {
  const normalized = parseDate(date);
  if (!normalized || normalized === "invalid" || normalized !== date) throw new Error("Ungültiger Berichtstag.");
  return new Date(date + "T00:00:00Z").toISOString();
}

export function parseAccountBalanceCsv(raw: string, baseCurrency: string) {
  const text = raw.replace(/^\uFEFF/, "");
  const delimiter = text.split(/\r?\n/, 1)[0].includes(";") ? ";" : ",";
  const [header, ...rows] = parseDelimited(text, delimiter, 102, 4);
  if (header?.map(field => field.trim().toLowerCase()).join("|") !== "art|währung|betrag|stand" || !rows.length || rows.length > 100) {
    throw new Error("Bitte die CSV-Vorlage für Kontowerte mit den Spalten Art, Währung, Betrag und Stand verwenden.");
  }
  const seen = new Set<string>();
  return rows.map((row, index): AccountBalanceInput => {
    try {
      const [label, rawCurrency, rawAmount, observed] = row.map(field => field.trim());
      const kind = (Object.keys(accountBalanceLabels) as AccountBalanceKind[]).find(key => accountBalanceLabels[key].toLowerCase() === label?.toLowerCase());
      const currency = rawCurrency?.toUpperCase() ?? "";
      if (row.length !== 4 || !kind || !/^[A-Z]{3}$/.test(currency)) throw new Error("Art und Währung prüfen.");
      if (kind === "depot_value" && currency !== baseCurrency) throw new Error(`Der Depotwert muss in ${baseCurrency} vorliegen.`);
      const amount = exactTradeNumber(rawAmount ?? "", "csv", 8);
      if (kind === "withdrawable" && amount.startsWith("-")) throw new Error("Der auszahlbare Betrag darf nicht negativ sein.");
      const observedAt = /^\d{4}-\d{2}-\d{2}$/.test(observed ?? "") ? statementDateTime(observed) : parseObservedAt(observed);
      if (Date.parse(observedAt) > Date.now()) throw new Error("Der Stand liegt in der Zukunft.");
      const key = `${kind}/${currency}`;
      if (seen.has(key)) throw new Error("Jeden Kontowert pro Währung nur einmal angeben.");
      seen.add(key);
      return { kind, currency, amount, observedAt };
    } catch (error) {
      throw new Error(`Zeile ${index + 2}. ${error instanceof Error ? error.message : "Kontowert prüfen."}`);
    }
  });
}

function parseObservedAt(value: string | undefined) {
  const date = value?.match(/^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/);
  if (!date || !value || !Number.isFinite(Date.parse(value))) throw new Error("Datum oder Datum mit Uhrzeit und Zeitzone angeben.");
  statementDateTime(date[1]);
  return new Date(value).toISOString();
}
