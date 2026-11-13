"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { createHash } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { getOrCreatePortfolio } from "@/lib/portfolio";
import { parseTradeCsv, MAX_REPORT_BYTES, MAX_TRADES, type TradeCsvMapping, type Trade, type TradeSource } from "@/lib/trade-import";
import { parseFlatexConfirmation } from "@/lib/flatex-import";
import { parseFlexReport } from "@/lib/ibkr/flex-report";
import { fetchFlexReport, validFlexCredentials } from "@/lib/ibkr/flex-client";
import { brokerAccountHash, flexConfiguration, runFlexSync, sealFlex, type ImportOutcome } from "@/lib/ibkr/flex-sync";
import { completeTradeConversions } from "@/lib/trade-conversions";
import { berlinDate, normalizeTradingProfile } from "@/lib/risk-rules";
import { parseDate } from "@/lib/csv-import";
import type { Json } from "@/lib/database.types";

export type IntakeState = {
  message: string;
  error?: boolean;
  saved?: boolean;
  revision?: string;
  summary?: ImportOutcome & { total: number; missingRates: number; sample: Trade[]; account?: string };
};

const value = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const importPages = ["/import", "/cockpit", "/depot", "/performance", "/risiko", "/einstellungen"];
const refreshPages = () => importPages.forEach(page => revalidatePath(page));
const ledgerMessage = (message: string) => /^(In diesem Depot|Dieses Depot|Dieses Brokerkonto|Eine bereits|Für |Buchung für |Datum, Stückzahl)/.test(message)
  ? message : "Die Buchungen konnten nicht übernommen werden. Bitte Format und Depot prüfen.";
const summaryMessage = (outcome: ImportOutcome) => `${outcome.opened} Eröffnungen · ${outcome.closed} Schließungen · ${outcome.skipped} bereits vorhanden`;

async function setActiveDepot(id: string) {
  (await cookies()).set("depotarchitect-active-depot", id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 31536000 });
  revalidatePath("/", "layout");
}

export async function switchDepot(form: FormData) {
  const { supabase, userId } = await requireUser();
  const { data } = await supabase.from("portfolios").select("id").eq("user_id", userId).eq("id", value(form, "portfolio")).maybeSingle();
  if (data) await setActiveDepot(data.id);
  redirect("/cockpit");
}

export async function addDepot(_previous: IntakeState, form: FormData): Promise<IntakeState> {
  const { supabase } = await requireUser();
  const profile = normalizeTradingProfile(value(form, "risk_profile"));
  if (!profile) return { error: true, message: "Bitte ein Trading-Profil wählen." };
  const { data, error } = await supabase.rpc("create_named_portfolio", {
    depot_name: value(form, "name"), base_currency: value(form, "currency"), depot_type: value(form, "account_type"), trading_profile: profile,
  });
  if (error || !data) return { error: true, message: error?.code === "23505" ? "Dieser Depotname ist bereits vergeben." : "Depotname, Währung und Kontotyp prüfen." };
  await setActiveDepot(data);
  redirect("/import");
}

export async function inspectTradeFile(_previous: IntakeState, form: FormData): Promise<IntakeState> {
  const { supabase } = await requireUser();
  const portfolio = await getOrCreatePortfolio();
  if (value(form, "portfolio") !== portfolio.id) return { error: true, message: "Das aktive Depot hat sich geändert. Bitte den Import neu öffnen." };
  const payload = String(form.get("file_data") ?? "");
  if (!payload || Buffer.byteLength(payload) > MAX_REPORT_BYTES) return { error: true, message: "Bitte eine Datei bis 3 MB auswählen." };
  try {
    const kind = value(form, "source") as TradeSource;
    let account: string;
    let trades: Trade[];
    if (kind === "ibkr") {
      ({ account, trades } = parseFlexReport(payload, portfolio.currency));
    } else if (kind === "flatex") {
      const texts = JSON.parse(payload) as unknown;
      if (!Array.isArray(texts) || !texts.length || texts.length > 50 || texts.some(text => typeof text !== "string")) throw new Error("Bitte bis zu 50 flatex-Abrechnungen auswählen.");
      const documents = texts.map((text: string, index) => {
        try { return parseFlatexConfirmation(text, portfolio.currency); }
        catch (error) { throw new Error(`Beleg ${index + 1}. ${error instanceof Error ? error.message : "Datei prüfen."}`); }
      });
      account = documents[0].account;
      if (!account || documents.some(document => document.account !== account)) throw new Error("Die flatex-Abrechnungen müssen zum selben Verrechnungskonto gehören.");
      trades = documents.map(document => document.trade);
    } else if (kind === "csv") {
      account = portfolio.id;
      trades = parseTradeCsv(payload, JSON.parse(value(form, "mapping")) as TradeCsvMapping);
    } else throw new Error("Bitte CSV, flatex-PDF oder IBKR-Flex-XML auswählen.");
    if (!trades.length || trades.length > MAX_TRADES) throw new Error("Die Datei enthält keine unterstützten Ausführungen.");
    const preview = value(form, "mode") !== "save";
    const entries = await completeTradeConversions(trades, portfolio.currency);
    const { data, error } = await supabase.rpc("import_depot_executions", {
      target_portfolio: portfolio.id, source_kind: kind, account_hash: brokerAccountHash(kind, account),
      entries: entries as unknown as Json, allow_existing: value(form, "allow_existing") === "yes", preview,
    });
    if (error) return { error: true, message: ledgerMessage(error.message) };
    const outcome = data as unknown as ImportOutcome;
    if (!preview) refreshPages();
    return {
      saved: !preview,
      message: summaryMessage(outcome),
      ...(preview ? { summary: makeSummary(outcome, entries, portfolio.currency, kind === "csv" ? undefined : account.slice(-4)) } : {}),
    };
  } catch (error) {
    unstable_rethrow(error);
    return { error: true, message: error instanceof Error && !(error instanceof SyntaxError) ? error.message : "Das Dateiformat konnte nicht gelesen werden." };
  }
}

export async function connectFlex(_previous: IntakeState, form: FormData): Promise<IntakeState> {
  const { supabase } = await requireUser();
  const portfolio = await getOrCreatePortfolio();
  const config = flexConfiguration();
  if (!config) return { error: true, message: "Der automatische Abruf ist in dieser Umgebung noch nicht aktiviert. Du kannst einen Flex-Bericht als Datei importieren." };
  if (value(form, "portfolio") !== portfolio.id) return { error: true, message: "Das aktive Depot hat sich geändert. Bitte die Einrichtung neu öffnen." };
  const credentials = { query: value(form, "query"), token: value(form, "token") };
  const expires = value(form, "expires");
  if (!validFlexCredentials(credentials) || parseDate(expires) !== expires || !expires || expires < berlinDate() ||
    Date.parse(expires) - Date.parse(berlinDate()) > 366 * 86_400_000) {
    return { error: true, message: "Abfrage-ID, Token und Gültigkeitsdatum prüfen." };
  }
  const validation = await supabase.rpc("ibkr_flex_allow_validation");
  if (!validation.data) return { error: true, message: "Der Abruf kann in wenigen Sekunden erneut versucht werden." };
  try {
    const report = parseFlexReport(await fetchFlexReport(credentials), portfolio.currency);
    const accountHash = brokerAccountHash("ibkr", report.account);
    const label = report.account.slice(-4);
    const revision = createHash("sha256").update(JSON.stringify([accountHash, report.trades, report.valuation])).digest("hex");
    const entries = await completeTradeConversions(report.trades, portfolio.currency);
    const allowExisting = value(form, "allow_existing") === "yes";
    if (value(form, "mode") === "save" && value(form, "revision") === revision) {
      const { data, error } = await supabase.rpc("ibkr_flex_connect", {
        target_portfolio: portfolio.id, source_account: accountHash, display_account: label,
        sealed: sealFlex(portfolio.id, credentials, config.encryptionKey),
        worker_key_hash: createHash("sha256").update(config.workerKey).digest("hex"), expires,
        entries: entries as unknown as Json, valuation: report.valuation as unknown as Json, allow_existing: allowExisting,
      });
      if (error) return { error: true, message: ledgerMessage(error.message) };
      refreshPages();
      return { saved: true, message: `IBKR verbunden. ${summaryMessage(data as unknown as ImportOutcome)}` };
    }
    const { data, error } = await supabase.rpc("import_depot_executions", {
      target_portfolio: portfolio.id, source_kind: "ibkr", account_hash: accountHash,
      entries: entries as unknown as Json, allow_existing: allowExisting, preview: true,
    });
    if (error) return { error: true, message: ledgerMessage(error.message) };
    const outcome = data as unknown as ImportOutcome;
    return { revision, message: value(form, "mode") === "save" ? "IBKR hat den Bericht geändert. Bitte die neue Vorschau prüfen." : summaryMessage(outcome),
      summary: makeSummary(outcome, entries, portfolio.currency, label) };
  } catch (error) {
    unstable_rethrow(error);
    return { error: true, message: error instanceof Error ? error.message : "Der IBKR-Bericht konnte nicht geprüft werden." };
  }
}

export async function syncFlex(_previous: IntakeState, form: FormData): Promise<IntakeState> {
  const { supabase } = await requireUser();
  const portfolio = await getOrCreatePortfolio();
  if (value(form, "portfolio") !== portfolio.id) return { error: true, message: "Das aktive Depot hat sich geändert." };
  const result = await runFlexSync(supabase, portfolio.id);
  refreshPages();
  if (!result) return { message: "Gerade ist kein weiterer Abruf möglich. Bei abgelaufenem Zugang bitte den Token erneuern." };
  if (result.error) return { error: true, message: result.message ? ledgerMessage(result.message) : result.error === "credentials" ? "IBKR hat den Zugang abgelehnt. Bitte den Token prüfen." : "IBKR konnte den Bericht gerade nicht liefern." };
  return { saved: true, message: summaryMessage(result as ImportOutcome) };
}

export async function disconnectFlex(form: FormData) {
  const { supabase } = await requireUser();
  const portfolio = await getOrCreatePortfolio();
  if (value(form, "portfolio") === portfolio.id) await supabase.rpc("ibkr_flex_disconnect", { target_portfolio: portfolio.id });
  refreshPages();
}

function makeSummary(outcome: ImportOutcome, entries: Trade[], currency: string, account?: string) {
  return { ...outcome, total: entries.length, missingRates: entries.filter(trade => trade.currency !== currency && !trade.conversion).length,
    sample: entries.slice(0, 12).map(trade => ({ ...trade, reference: "", instrument: "" })), account };
}
