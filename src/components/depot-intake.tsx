"use client";

import { startTransition, useActionState, useRef, useState, type DragEvent, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, FileUp, Link2, Plus, Upload } from "lucide-react";
import { addDepot, connectFlex, disconnectFlex, inspectTradeFile, syncFlex, type IntakeState } from "@/app/(dashboard)/import/intake-actions";
import { csvTradeTable, tradeCsvFields, type TradeCsvField, type TradeCsvMapping, type TradeSource } from "@/lib/trade-import";
import { importFileSizeError, MAX_IMPORT_FILE_BYTES, MAX_IMPORT_FILE_MB, MAX_PDF_BATCH_MB, MAX_PDF_FILES, prepareImportPayload, readImportText } from "@/lib/import-file";
import { berlinDate, TRADING_PROFILES } from "@/lib/risk-rules";
import type { FlexStatus } from "@/lib/ibkr/flex-sync";
import { Card } from "./ui";
import { InfoTip } from "./info-tip";

const initial: IntakeState = { message: "" };
const primary = "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#062218] disabled:opacity-45";
const secondary = "inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:border-accent/60 disabled:opacity-45";
const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" });
const showDate = (date: string) => dateFormat.format(new Date(date.length === 10 ? date + "T12:00:00Z" : date));

export function IntakeChoices({ connected = false }: { connected?: boolean }) {
  const choices = [
    { href: "/import?via=broker", icon: Link2, title: connected ? "Brokerverbindung" : "Broker verbinden", text: "Interactive Brokers · automatischer Berichtsabruf" },
    { href: "/import?via=datei", icon: FileUp, title: "Dateien importieren", text: "flatex-PDF, Handels-CSV oder IBKR-Flex-XML" },
    { href: "/depot?add=position", icon: Plus, title: "Position erfassen", text: "Wertpapier, Stückzahl und Einstiegskurs" },
  ];
  return <div className="grid gap-3 md:grid-cols-3">{choices.map(({ href, icon: Icon, title, text }) =>
    <Link href={href} key={href} className="surface group flex min-h-36 flex-col justify-between gap-5 rounded-2xl border border-border p-5 transition-colors hover:border-accent/55 focus-visible:outline-2 focus-visible:outline-accent">
      <div className="flex items-center justify-between"><Icon size={22} className="text-accent" aria-hidden="true" /><ArrowRight size={17} className="text-muted group-hover:text-accent" aria-hidden="true" /></div>
      <div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-xs leading-5 text-muted">{text}</p></div>
    </Link>
  )}</div>;
}

export function NewDepotForm({ initialName = "" }: { initialName?: string }) {
  const [state, action, pending] = useActionState(addDepot, initial);
  return <details className="rounded-xl border border-border p-4">
    <summary className="cursor-pointer text-sm font-medium">Neues Depot anlegen</summary>
    <form action={action} className="mt-4 grid gap-3 sm:grid-cols-3">
      <label>Name<input name="name" defaultValue={initialName} required maxLength={60} placeholder="z. B. flatex" /></label>
      <label>Depotwährung<select name="currency" defaultValue="EUR">
        {["EUR", "USD", "CHF", "GBP", "CAD", "AUD", "JPY", "DKK", "SEK", "NOK", "PLN"].map(currency => <option key={currency}>{currency}</option>)}
      </select></label>
      <label>Kontotyp<select name="account_type" defaultValue="cash_account"><option value="cash_account">Bardepot</option><option value="margin_account">Margin-Depot</option><option value="portfolio_margin_account">Portfolio-Margin</option><option value="other">Sonstiges</option></select></label>
      <label>Trading-Profil<select name="risk_profile" defaultValue="" required><option value="" disabled>Profil wählen</option>
        {Object.keys(TRADING_PROFILES).map(name => <option key={name}>{name}</option>)}</select></label>
      <div className="self-end text-xs text-muted sm:col-span-2">Von frühen bis späteren Risikohinweisen. Details sind in den Einstellungen sichtbar.</div>
      <div className="sm:col-span-3"><button className={primary} disabled={pending}>{pending ? "Wird angelegt …" : "Depot anlegen"}</button></div>
      <Feedback state={state} />
    </form>
  </details>;
}

type LoadedFile = { source: TradeSource; data: string | Blob; names: string[]; headers?: string[]; mapping?: TradeCsvMapping };

export function TradeFileImport({ portfolio, hasPositions }: { portfolio: string; hasPositions: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const loadVersion = useRef(0);
  const [loaded, setLoaded] = useState<LoadedFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState("");
  const [state, setState] = useState<IntakeState>(initial);
  const [pending, setPending] = useState(false);
  const [allow, setAllow] = useState(false);
  const [savedToDepot, setSavedToDepot] = useState(false);
  const fileLabel = loaded?.names.length === 1 ? loaded.names[0] : loaded?.names.length ? `${loaded.names.length} Abrechnungen ausgewählt` : "CSV, XML oder PDF";
  async function load(files: File[]) {
    const version = ++loadVersion.current;
    setState(initial);
    setLoaded(null);
    setLocalError("");
    setLoading(true);
    try {
      if (!files.length) return;
      if (files.some(file => file.size === 0)) throw new Error("Die Auswahl enthält eine leere Datei.");
      if (files.some(file => file.size > MAX_IMPORT_FILE_BYTES)) throw new Error(importFileSizeError);
      const names = files.map(file => file.name);
      const extension = (name: string) => name.toLowerCase().split(".").at(-1);
      let next: LoadedFile;
      if (names.every(name => extension(name) === "pdf")) {
        if (files.length > MAX_PDF_FILES || files.reduce((total, file) => total + file.size, 0) > MAX_PDF_BATCH_MB * 1_000_000) {
          throw new Error(`Bis zu ${MAX_PDF_FILES} PDF-Belege mit insgesamt höchstens ${MAX_PDF_BATCH_MB} MB auswählen.`);
        }
        const { extractFlatexText, FlatexPdfPageLimitError } = await import("@/lib/flatex-pdf");
        const texts: string[] = [];
        for (const [index, file] of files.entries()) {
          try { texts.push(await extractFlatexText(file)); }
          catch (error) {
            if (error instanceof FlatexPdfPageLimitError) throw new Error(`Beleg ${index + 1}. ${error.message}`);
            throw new Error(`Beleg ${index + 1} konnte nicht gelesen werden. Bitte ein Original-PDF mit Text auswählen.`);
          }
        }
        next = { source: "flatex", data: await prepareImportPayload(JSON.stringify(texts)), names };
      } else if (files.length === 1 && extension(names[0]) === "xml") {
        next = { source: "ibkr", data: await prepareImportPayload(await readImportText(files[0])), names };
      } else if (files.length === 1 && ["csv", "tsv"].includes(extension(names[0]) ?? "")) {
        const data = await readImportText(files[0]);
        const { headers, mapping } = csvTradeTable(data);
        next = { source: "csv", data: await prepareImportPayload(data), names, headers, mapping };
      } else throw new Error("Eine CSV- oder XML-Datei oder mehrere flatex-PDFs auswählen.");
      if (version === loadVersion.current) setLoaded(next);
    } catch (error) {
      if (version === loadVersion.current) setLocalError(error instanceof Error ? error.message : "Die Datei konnte nicht gelesen werden.");
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }
  async function submit(save: boolean) {
    if (!loaded || pending || loading || save && !state.summary) return;
    const form = new FormData();
    form.set("portfolio", portfolio);
    form.set("source", loaded.source);
    form.set("file_data", loaded.data);
    if (loaded.mapping) form.set("mapping", JSON.stringify(loaded.mapping));
    form.set("mode", save ? "save" : "preview");
    if (allow) form.set("allow_existing", "yes");
    setPending(true);
    try {
      const outcome = await inspectTradeFile(initial, form);
      setState(outcome);
      if (outcome.saved) setSavedToDepot(true);
    } catch {
      setState({ error: true, message: "Der Import konnte nicht erreicht werden. Bitte erneut versuchen." });
    } finally { setPending(false); }
  }
  function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    if (!pending && !loading) void load(Array.from(event.dataTransfer.files));
  }
  return <Card>
    <div className="mb-5 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Dateien auswählen</h2>
      <a className="text-xs text-accent" href="/handelsdatei.csv" download>CSV-Beispiel</a>
    </div>
    <div className={`rounded-xl border border-dashed px-5 py-6 text-center ${dragging ? "border-accent bg-accent/10" : "border-border"}`}
      onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
      <Upload size={22} className="mx-auto mb-3 text-muted" aria-hidden="true" />
      <p className="mb-3 break-all text-sm text-muted">{loading ? "Dateien werden gelesen …" : fileLabel}</p>
      <input ref={input} type="file" multiple accept=".csv,.tsv,.xml,.pdf" className="hidden" onChange={event => {
        void load(Array.from(event.target.files ?? []));
        event.target.value = "";
      }} />
      <button type="button" className={secondary} onClick={() => input.current?.click()} disabled={loading || pending}>{loaded ? "Dateien wechseln" : "Dateien wählen"}</button>
    </div>
    {localError && <p role="alert" className="mt-3 text-sm text-red-300">{localError}</p>}
    {loaded?.headers && loaded.mapping && <div className="mt-5">
      <h3 className="mb-3 text-sm font-semibold">Spalten zuordnen</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(Object.keys(tradeCsvFields) as TradeCsvField[]).map(field => <label key={field}>{tradeCsvFields[field]}{["reference", "time"].includes(field) ? " (optional)" : ""}
        <select value={loaded.mapping![field]} disabled={pending} onChange={event => {
          setLoaded({ ...loaded, mapping: { ...loaded.mapping!, [field]: Number(event.target.value) } }); setState(initial);
        }}><option value={-1}>Spalte auswählen</option>{loaded.headers!.map((header, index) => <option key={index} value={index}>{header || `Spalte ${index + 1}`}</option>)}</select>
      </label>)}</div>
    </div>}
    {loaded && <div className="mt-5">
      {(hasPositions || savedToDepot) && <OverlapConfirmation checked={allow} onChange={checked => { setAllow(checked); setState(initial); }} disabled={pending} />}
      {state.summary && <Preview summary={state.summary} />}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!state.saved && <button type="button" className={state.summary ? secondary : primary} disabled={pending || loading} onClick={() => void submit(false)}>{pending ? "Wird geprüft …" : "Vorschau prüfen"}</button>}
        {state.summary && <button type="button" className={primary} disabled={pending} onClick={() => void submit(true)}>Buchungen übernehmen</button>}
        {state.saved && <Link href="/depot" className={primary}>Zum Depot <ArrowRight size={16} aria-hidden="true" /></Link>}
      </div>
      <Feedback state={state} />
    </div>}
    <details className="mt-5 text-sm text-muted"><summary className="cursor-pointer">Unterstützte Dateien</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
        <li>Bis zu {MAX_IMPORT_FILE_MB} MB je Datei.</li>
        <li>flatex · bis zu {MAX_PDF_FILES} einzelne Kauf- und Verkaufsabrechnungen als PDF mit insgesamt {MAX_PDF_BATCH_MB} MB.</li>
        <li>CSV · Käufe und Verkäufe mit Stückkurs, Handelstag und Handelswährung. Spaltenüberschriften dürfen abweichen.</li>
        <li>IBKR · Activity Flex Query im XML-Format mit ausgeführten Trades.</li>
      </ul>
    </details>
  </Card>;
}

export function FlexConnectionForm({ portfolio, connected, available, hasPositions, currency }: {
  portfolio: string; connected: FlexStatus | null; available: boolean; hasPositions: boolean; currency: string;
}) {
  const [state, action, pending] = useActionState(connectFlex, initial);
  const [sync, syncAction, syncing] = useActionState(syncFlex, initial);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState({ query: "", token: "", expires: "" });
  const [allow, setAllow] = useState(false);
  const [changed, setChanged] = useState(false);
  const invalid = connected && (connected.expires < berlinDate() || connected.lastError === "credentials");
  const attention = connected?.lastError && connected.lastError !== "credentials" ? "Letzter Abruf fehlgeschlagen" : null;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const mode = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? "preview";
    const data = new FormData(event.currentTarget);
    data.set("mode", mode);
    setChanged(false);
    if (mode === "save" && (!state.revision || changed)) data.set("mode", "preview");
    startTransition(() => action(data));
  }
  return <Card>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Interactive Brokers</h2><div className="mt-1 flex items-center gap-2 text-sm text-muted">
        Täglicher Berichtsabruf <InfoTip label="Was übernimmt die Verbindung?">Flex liefert je nach Bericht gemeldete Käufe, Verkäufe, den Depotwert, Cashbestände und Schlusskurse. Der auszahlbare Betrag steht separat beim Broker.</InfoTip>
      </div></div>
      {connected && <span className={`rounded-full border px-3 py-1 text-xs ${invalid || attention ? "border-amber-400/40 text-amber-200" : "border-accent/35 text-accent"}`}>{invalid ? "Token erneuern" : attention || "Verbunden"}</span>}
    </div>
    {connected && <div className="my-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
      <span>Konto ····{connected.account}</span><span>Letzter Abruf {showDate(connected.lastSuccess)}</span><span>Token gültig bis {showDate(connected.expires)}</span>
    </div>}
    {connected && !editing && <div className="flex flex-wrap gap-2">
      <form action={syncAction}><input type="hidden" name="portfolio" value={portfolio} /><button className={primary} disabled={syncing || Boolean(invalid) || !available}>{syncing ? "Bericht wird abgerufen …" : "Jetzt abrufen"}</button></form>
      <button type="button" className={secondary} onClick={() => setEditing(true)}>Token erneuern</button>
      <form action={disconnectFlex} onSubmit={event => { if (!window.confirm("Automatischen Berichtsabruf trennen? Importierte Buchungen bleiben erhalten.")) event.preventDefault(); }}><input type="hidden" name="portfolio" value={portfolio} /><button className={secondary}>Trennen</button></form>
    </div>}
    <Feedback state={sync} />
    {available && (editing || !connected) && !state.saved && <>
      <details className="mt-5 rounded-lg border border-border px-4 py-3 text-sm" open={!connected || undefined}>
        <summary className="cursor-pointer font-medium">Wo finde ich Abfrage-ID und Token?</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-5 text-muted">
          <li>Im <a href="https://www.interactivebrokers.com/sso/Login" target="_blank" rel="noreferrer" className="text-accent">IBKR-Client-Portal</a> unter Berichte → Flex-Abfragen den Flex Web Service aktivieren. Token und Ablaufdatum übernehmen.</li>
          <li>Eine Activity Flex Query für genau ein Konto erstellen. Format XML, Bereich Trades, Detailgrad Ausführungen. Für den laufenden Abruf einen rollierenden Zeitraum wählen, etwa die letzten sieben Tage.</li>
          <li>Alle Felder unter Trades aktivieren, besonders Trade ID, Date/Time, Open/Close Indicator, Conid, Currency und FX Rate to Base. Für die Depotwährung ({currency}) und den Broker-Wechselkurs „Account Information“ wählen. Für Depotwert, Cash und Schlusskurse „NAV Summary in Base“, „Cash Report“ und „Open Positions“ mit Detailgrad „Summary“ wählen.</li>
          <li>Ältere Käufe zuerst als Flex-XML importieren. So können spätere Verkäufe den richtigen Einstiegen zugeordnet werden.</li>
          <li>Für den Abruf reiner Kontowerte genügen „Account Information“, „NAV Summary in Base“ und „Cash Report“. Lass „Trades“ in dieser Abfrage weg.</li>
        </ol>
      </details>
      <form onSubmit={submit} className="mt-4">
        <input type="hidden" name="portfolio" value={portfolio} />
        <input type="hidden" name="revision" value={changed ? "" : state.revision ?? ""} />
        <div className="grid gap-3 sm:grid-cols-3">
          <label>Abfrage-ID<input name="query" inputMode="numeric" value={fields.query} onChange={e => { setFields({ ...fields, query: e.target.value }); setChanged(true); }} required /></label>
          <label>Flex-Token<input name="token" type="password" autoComplete="off" value={fields.token} onChange={e => { setFields({ ...fields, token: e.target.value }); setChanged(true); }} required /></label>
          <label>Gültig bis<input name="expires" type="date" value={fields.expires} onChange={e => { setFields({ ...fields, expires: e.target.value }); setChanged(true); }} required /></label>
        </div>
        {hasPositions && <OverlapConfirmation checked={allow} onChange={checked => { setAllow(checked); setChanged(true); }} disabled={pending} />}
        {allow && <input type="hidden" name="allow_existing" value="yes" />}
        {state.summary && !changed && <Preview summary={state.summary} />}
        <div className="mt-4 flex flex-wrap gap-2">
          <button className={state.summary && !changed ? secondary : primary} value="preview" disabled={pending}>{pending ? "Bericht wird geprüft …" : "Bericht prüfen"}</button>
          {state.summary && !changed && <button className={primary} value="save" disabled={pending}>Verbinden und übernehmen</button>}
          {connected && <button type="button" className={secondary} onClick={() => setEditing(false)}>Abbrechen</button>}
        </div>
      </form>
    </>}
    {!available && <p className="mt-3 text-sm text-muted">Automatischer Abruf ist in dieser Umgebung noch nicht eingerichtet. <Link className="text-accent" href="/import?via=datei">Bericht als Datei importieren</Link></p>}
    {!changed && <Feedback state={state} />}
    {state.saved && <Link href="/depot" className={`mt-3 ${primary}`}>Zum Depot <ArrowRight size={16} aria-hidden="true" /></Link>}
  </Card>;
}

function OverlapConfirmation({ checked, onChange, disabled }: { checked: boolean; onChange: (value: boolean) => void; disabled: boolean }) {
  return <details className="mt-3 text-sm text-muted" open={checked || undefined}><summary className="cursor-pointer">Buchungen zu einem bestehenden Depot hinzufügen</summary>
    <label className="mt-2 flex items-start gap-2 text-xs"><input className="!mt-0 !w-auto accent-accent" type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
      Ich habe geprüft, dass sich die Buchungen mit anderen Datenquellen in diesem Depot nicht überschneiden.</label>
  </details>;
}

function Preview({ summary }: { summary: NonNullable<IntakeState["summary"]> }) {
  return <div className="mt-5 rounded-xl border border-border p-4">
    <h3 className="text-sm font-semibold">Importvorschau {summary.account && <span className="font-normal text-muted">· Konto ····{summary.account}</span>}</h3>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      <span>{summary.total} Buchungen</span><span>{summary.opened} Eröffnungen</span><span>{summary.closed} Schließungen</span><span>{summary.skipped} bereits vorhanden</span>
    </div>
    {summary.missingRates > 0 && <p className="mt-2 text-xs text-amber-200">Für {summary.missingRates} Buchungen fehlt die historische Währungsumrechnung.</p>}
    {summary.sample.length > 0 && <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-muted"><tr>{["Datum", "Wertpapier", "Buchung", "Stück", "Kurs"].map(label => <th className="p-2 font-medium" key={label}>{label}</th>)}</tr></thead>
        <tbody>{summary.sample.map((trade, index) => <tr key={index} className="border-t border-border">
          <td className="whitespace-nowrap p-2">{showDate(trade.date)}</td><td className="p-2">{trade.name || trade.ticker}</td><td className="p-2">{trade.side === "buy" ? "Kauf" : "Verkauf"}</td>
          <td className="p-2 tabular-nums">{Number(trade.quantity).toLocaleString("de-DE", { maximumFractionDigits: 6 })}</td>
          <td className="whitespace-nowrap p-2 tabular-nums">{Number(trade.price).toLocaleString("de-DE", { maximumFractionDigits: 6 })} {trade.currency}</td>
        </tr>)}</tbody>
      </table>
      {summary.total > summary.sample.length && <p className="mt-2 text-xs text-muted">Erste {summary.sample.length} Buchungen angezeigt</p>}
    </div>}
  </div>;
}

function Feedback({ state }: { state: IntakeState }) {
  return state.message ? <p role={state.error ? "alert" : "status"} className={`mt-3 text-sm ${state.error ? "text-amber-200" : "text-muted"}`}>{state.message}</p> : null;
}
