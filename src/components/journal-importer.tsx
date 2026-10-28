"use client";
import { useActionState, useState } from "react";
import { importJournal } from "@/app/(dashboard)/import/journal-actions";
import { analyzeJournalCsv, JOURNAL_TEMPLATE, type JournalImportPreview } from "@/lib/journal-import";
import { MAX_FILE_SIZE_BYTES } from "@/lib/csv-import";
import { Card } from "./ui";

export function JournalImporter({ baseCurrency, available, currentCount }: { baseCurrency: string; available: boolean; currentCount: number }) {
  const [preview, setPreview] = useState<JournalImportPreview | null>(null), [csv, setCsv] = useState("");
  const [error, setError] = useState(""), [reading, setReading] = useState(false);
  const [state, action, pending] = useActionState(importJournal, { ok: false, message: "" });
  async function read(file?: File) {
    setPreview(null); setCsv(""); setError(""); if (!file) return;
    if (file.size > MAX_FILE_SIZE_BYTES) { setError("Die Datei darf höchstens 2 MB groß sein."); return; }
    setReading(true);
    try { const text = await file.text(); const result = await analyzeJournalCsv(text, baseCurrency); setCsv(text); setPreview(result); }
    catch (e) { setError(e instanceof Error ? e.message : "Datei nicht lesbar."); }
    finally { setReading(false); }
  }
  function download() { const url = URL.createObjectURL(new Blob(["\uFEFF", JOURNAL_TEMPLATE], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "depotarchitect-journal-vorlage.csv"; link.click(); URL.revokeObjectURL(url); }
  return <Card><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-medium">Depotjournal aus Google Sheets übernehmen</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Im Blatt „aktuelle Positionen“ alle gekauften und verkauften Zeilen einblenden und als CSV herunterladen. Die fünf Kopfzeilen und die Spalten deiner Tabelle werden erkannt. Die Quelldatei wird nicht verändert.</p></div><button onClick={download} className="rounded-xl border border-border px-3 py-2 text-sm">CSV-Vorlage</button></div>
    <p className="mt-3 text-xs leading-5 text-muted">Einmalige Erstübernahme in ein leeres Depot; identische Wiederholungen erzeugen keine zusätzlichen Positionen. Anschließend Käufe und Verkäufe in DepotArchitect erfassen. {currentCount > 0 ? `Hier sind bereits ${currentCount} Positionen gespeichert.` : "Das Depot enthält noch keine echten Positionen."} Der bestehende Snapshotimport kann keine Verkaufshistorie ersetzen.</p>
    {!available && <p className="mt-3 text-sm text-amber-200">Vor dem Speichern muss die Journalmigration angewendet werden.</p>}
    <label className="mt-5 block max-w-xl">Journaldatei · CSV<input type="file" accept=".csv,text/csv" disabled={reading || pending} onChange={e => void read(e.target.files?.[0])} /></label>
    {reading && <p role="status" className="mt-3 text-sm">Datei wird geprüft …</p>}{error && <p role="alert" className="mt-3 text-sm text-amber-200">{error}</p>}
    {preview && <div className="mt-5 space-y-4"><p className="text-sm">{preview.format} · {preview.entries.length} gültige Zeilen · {preview.errors} Fehlerzeilen · {preview.warnings} Zeilen mit Hinweisen · {preview.skipped} Leerzeilen ohne Ticker</p>
      <div className="rounded-xl border border-amber-500/40 p-3 text-sm leading-6 text-amber-100">Die aktuelle Tabelle enthält keine verlässliche historische Einstiegsmargin und keinen historischen Verkaufs-FX. Diese Werte bleiben unbekannt, sofern sie nicht über die entsprechenden Vorlagenspalten ergänzt werden. Die heutige Marginquote und der heutige FX werden nicht rückwirkend eingesetzt. Ein Währungspaar EURUSD wird korrekt in USD → EUR umgekehrt.</div>
      <div className="max-h-[28rem] overflow-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead><tr><th>Zeile</th><th>Ticker</th><th>Übernahme</th><th>Prüfung</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.row} className="border-t border-border align-top"><td className="py-2">{row.row}</td><td>{row.ticker}</td><td>{row.entry ? `${row.entry.quantity} · ${row.entry.sales.length ? "mit Verkauf" : "offen"} · ${row.entry.instrument_currency}` : "Fehler"}</td><td className="max-w-xl py-2">{row.errors.map((m,i) => <div key={`e${i}`} className="text-red-300">{m}</div>)}{row.warnings.map((m,i) => <div key={`w${i}`} className="text-amber-200">{m}</div>)}{!row.errors.length && !row.warnings.length && "Geprüft"}</td></tr>)}</tbody></table></div>
      <form key={csv} action={action} className="space-y-3"><input type="hidden" name="csv" value={csv} /><label className="flex items-start gap-3 text-sm"><input name="reviewed" type="checkbox" value="yes" required className="mt-1 !w-auto" /><span>Ich habe Zeilen, Kategorien, Währungen und Datenlücken geprüft. Fehlende historische Referenzen bleiben als unvollständig erkennbar.</span></label><button disabled={!available || pending || preview.errors > 0 || state.ok} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-[#062218] disabled:opacity-40">{pending ? "Wird atomar übernommen …" : "Geprüftes Journal übernehmen"}</button></form>
    </div>}
    {state.message && <p role="status" className="mt-4 text-sm text-amber-100">{state.message}</p>}
  </Card>;
}
