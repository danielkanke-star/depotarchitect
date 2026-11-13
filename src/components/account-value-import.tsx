"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { importAccountFile, type AccountImportState } from "@/app/(dashboard)/import/intake-actions";
import { accountBalanceLabels } from "@/lib/account-balances";
import { MAX_REPORT_BYTES } from "@/lib/trade-import";
import { Card } from "./ui";
import { formatMoney } from "./risk-indicator";

const initial: AccountImportState = { message: "" };
const previewDate = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" });

export function AccountValueImport({ portfolio }: { portfolio: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState(initial);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || pending || state.saved) return;
    const format = file.name.toLowerCase().split(".").at(-1) ?? "";
    if (!["xml", "csv"].includes(format) || file.size === 0 || file.size > MAX_REPORT_BYTES) {
      setState({ error: true, message: "Eine IBKR-Flex-XML oder Kontowerte-CSV bis 3 MB auswählen." });
      return;
    }
    setPending(true);
    try {
      const bytes = await file.arrayBuffer();
      let payload: string;
      try { payload = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { payload = new TextDecoder("windows-1252").decode(bytes); }
      const form = new FormData();
      form.set("portfolio", portfolio);
      form.set("format", format);
      form.set("file_data", payload);
      form.set("mode", state.values ? "save" : "preview");
      setState(await importAccountFile(initial, form));
    } catch {
      setState({ error: true, message: "Der Import konnte nicht erreicht werden. Bitte erneut versuchen." });
    } finally {
      setPending(false);
    }
  }

  return <Card className="max-w-3xl space-y-4">
    <form onSubmit={submit} className="space-y-4">
      <label>Kontowerte-Datei
        <input type="file" accept=".csv,.xml" required disabled={pending} onChange={event => {
          setFile(event.target.files?.[0] ?? null);
          setState(initial);
        }} />
      </label>
      {state.values && <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-border text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">Kontowert</th>
            <th scope="col" className="px-3 text-right font-medium">Betrag</th>
            <th scope="col" className="pl-3 font-medium">Stand</th>
          </tr></thead>
          <tbody>{state.values.map(row => <tr className="border-b border-border/60" key={row.kind + row.currency}>
            <th scope="row" className="py-2 pr-3 font-normal">{accountBalanceLabels[row.kind]}</th>
            <td className="px-3 text-right tabular-nums">{formatMoney(Number(row.amount), row.currency)}</td>
            <td className="whitespace-nowrap pl-3"><time dateTime={row.observedAt}>{previewDate.format(new Date(row.observedAt))}</time></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {state.message && <p role={state.error ? "alert" : "status"} className={state.error ? "text-sm text-amber-200" : "text-sm text-accent"}>{state.message}</p>}
      <div className="flex flex-wrap items-center gap-4">
        {state.saved ? <Link className="text-sm font-medium text-accent hover:underline" href="/cockpit">Im Cockpit ansehen</Link>
          : <button type="submit" disabled={!file || pending} className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#062218] disabled:opacity-45">
            {pending ? "Wird geprüft …" : state.values ? "Kontowerte übernehmen" : "Datei prüfen"}
          </button>}
        <a href="/kontowerte.csv" download className="text-sm text-accent hover:underline">CSV-Vorlage herunterladen</a>
      </div>
    </form>
    <details className="border-t border-border pt-3 text-sm text-muted">
      <summary className="cursor-pointer">Welche Werte kann ich übernehmen?</summary>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>IBKR-Flex-XML mit „Account Information“, „Net Asset Value Summary in Base“ und „Cash Report“. Handelsbuchungen werden in diesem Schritt übersprungen.</li>
        <li>Für die CSV die Art „Depotwert“, „Cash gesamt“, „Cash je Währung“ oder „Auszahlbar ohne Kredit“ verwenden. Die Werte mit Währung und Datum (JJJJ-MM-TT) aus dem Brokerbericht oder der Brokeransicht übernehmen.</li>
        <li>Beim Auszahlungsbetrag die Angabe des Brokers ohne Kredit verwenden. Die App führt keine Auszahlung aus.</li>
      </ul>
    </details>
  </Card>;
}
