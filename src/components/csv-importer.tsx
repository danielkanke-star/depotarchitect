"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, ShieldCheck, Upload } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import {
  analyzeImport,
  CSV_FIELDS,
  MAX_FILE_SIZE_BYTES,
  parseCsvText,
  type CategoryResolution,
  type ColumnMapping,
  type CsvField,
  type ParsedCsv,
} from "@/lib/csv-import";
import { replacePortfolioSnapshot, type SnapshotImportResult } from "@/app/(dashboard)/import/actions";
import type { PortfolioImport } from "@/lib/database.types";

type Props = {
  currentPositionCount: number;
  categoryNames: string[];
  imports: PortfolioImport[];
};

export function CsvImporter({ currentPositionCount, categoryNames, imports }: Props) {
  const router = useRouter();
  const [filename, setFilename] = useState("");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [categoryResolutions, setCategoryResolutions] = useState<Record<string, CategoryResolution>>({});
  const [confirmationChecked, setConfirmationChecked] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [fileError, setFileError] = useState("");
  const [result, setResult] = useState<SnapshotImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  const analysis = useMemo(
    () => parsed ? analyzeImport(parsed, mapping, categoryNames, categoryResolutions) : null,
    [parsed, mapping, categoryNames, categoryResolutions],
  );
  const unresolvedCategories = analysis?.unknownCategories.filter((category) => !categoryResolutions[category]) ?? [];
  const ready = Boolean(
    parsed
    && analysis
    && analysis.validRows > 0
    && unresolvedCategories.length === 0
    && confirmationChecked
    && confirmationText === "DEPOT ERSETZEN",
  );

  async function selectFile(file: File | undefined) {
    setResult(null);
    setFileError("");
    setParsed(null);
    setCategoryResolutions({});
    setConfirmationChecked(false);
    setConfirmationText("");
    if (!file) return;
    setFilename(file.name);

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError("Die Datei ist größer als 2 MB. Bitte den Snapshot vor dem Import auf maximal 2.000 Datenzeilen begrenzen.");
      return;
    }

    try {
      const bytes = await file.arrayBuffer();
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const nextParsed = parseCsvText(text);
      setParsed(nextParsed);
      setMapping(nextParsed.mapping);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Die Datei ist keine gültige UTF-8-CSV-Datei.");
    }
  }

  function changeMapping(columnIndex: number, field: CsvField | "ignore") {
    setMapping((current) => {
      const next = { ...current };
      if (field !== "ignore") {
        for (const [index, mappedField] of Object.entries(next)) {
          if (mappedField === field) next[Number(index)] = "ignore";
        }
      }
      next[columnIndex] = field;
      return next;
    });
  }

  function resolveCategory(category: string, value: string) {
    setCategoryResolutions((current) => {
      const next = { ...current };
      if (!value) delete next[category];
      else if (value === "unassigned") next[category] = { mode: "unassigned" };
      else if (value === "new") next[category] = { mode: "new", target: category };
      else next[category] = { mode: "existing", target: value };
      return next;
    });
  }

  function runImport() {
    if (!ready || !parsed || !analysis) return;
    setResult(null);
    startTransition(async () => {
      const response = await replacePortfolioSnapshot({
        filename,
        positions: analysis.normalizedPositions,
        newCategories: analysis.newCategories,
        totalRows: analysis.rows.length,
        warningRows: analysis.warningRows,
        rejectedRows: analysis.errorRows,
        delimiter: parsed.delimiterLabel,
        encoding: parsed.encoding,
        headerDetected: parsed.headerDetected,
        confirmationChecked,
        confirmationText,
      });
      setResult(response);
      if (response.ok) {
        setConfirmationChecked(false);
        setConfirmationText("");
        router.refresh();
      }
    });
  }

  return <div className="space-y-4">
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-medium"><FileSpreadsheet size={18} className="text-accent" />Benutzerdefinierte CSV auswählen</div>
          <p className="mt-2 max-w-3xl text-sm text-muted">Optionaler manueller Dateiimport. Die spätere automatische Brokeranbindung ist hiervon getrennt. Die Rohdatei wird ausschließlich in diesem Browser eingelesen und nicht dauerhaft gespeichert.</p>
        </div>
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-medium text-[#062218]">
          <Upload size={17} /> Benutzerdefinierte CSV auswählen
          <input className="sr-only" type="file" accept=".csv,text/csv,text/tab-separated-values" onChange={(event) => void selectFile(event.target.files?.[0])} />
        </label>
      </div>
      {fileError && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-200">{fileError}</div>}
    </Card>

    {parsed && analysis && <>
      <Card>
        <h2 className="font-medium">Automatische Erkennung</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Fact label="Dateiname" value={filename} />
          <Fact label="Trennzeichen" value={parsed.delimiterLabel} />
          <Fact label="Kodierung" value={parsed.encoding} />
          <Fact label="Kopfzeile" value={parsed.headerDetected ? "Erkannt" : "Nicht erkannt"} />
          <Fact label="Datenzeilen" value={String(analysis.rows.length)} />
          <Fact label="Gültige Positionen" value={String(analysis.validRows)} tone="good" />
          <Fact label="Zeilen mit Warnungen" value={String(analysis.warningRows)} tone="warn" />
          <Fact label="Fehlerhafte Zeilen" value={String(analysis.errorRows)} tone="danger" />
        </div>
      </Card>

      <Card>
        <h2 className="font-medium">Spaltenzuordnung</h2>
        <p className="mt-1 text-sm text-muted">Jede automatische Zuordnung kann geändert werden. Depotweite Felder wie NetLiq werden bewusst nicht als Positionsmarktwert interpretiert.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted"><tr><th className="pb-3">Erkannte CSV-Spalte</th><th>Beispielwert</th><th>DepotArchitect-Feld</th></tr></thead>
            <tbody>{parsed.headers.map((header, index) => <tr key={`${header}-${index}`} className="border-t border-border/60">
              <td className="py-3 font-medium">{header}</td>
              <td className="max-w-[260px] truncate text-muted">{parsed.rows[0]?.[index] || "–"}</td>
              <td className="w-[280px]"><select value={mapping[index] ?? "ignore"} onChange={(event) => changeMapping(index, event.target.value as CsvField | "ignore")}>{CSV_FIELDS.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}</select></td>
            </tr>)}</tbody>
          </table>
        </div>
      </Card>

      {analysis.unknownCategories.length > 0 && <Card>
        <h2 className="font-medium">Unbekannte Kategorien zuordnen</h2>
        <p className="mt-1 text-sm text-muted">Jede unbekannte Kategorie muss vor dem Import ausdrücklich zugeordnet, neu angelegt oder verworfen werden.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">{analysis.unknownCategories.map((category) => <label key={category}>{category}<select value={resolutionValue(categoryResolutions[category])} onChange={(event) => resolveCategory(category, event.target.value)}><option value="">Bitte auswählen</option>{categoryNames.map((existing) => <option key={existing} value={existing}>Bestehend: {existing}</option>)}<option value="new">Neue Kategorie anlegen: {category}</option><option value="unassigned">Als Nicht zugeordnet importieren</option></select></label>)}</div>
      </Card>}

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-medium">Vorschau der ersten 50 Zeilen</h2><p className="mt-1 text-sm text-muted">Mehrere Positionen desselben Tickers sind erlaubt. Nur in allen wesentlichen Merkmalen wahrscheinlich identische Zeilen werden gewarnt.</p></div><div className="flex flex-wrap gap-2"><Badge tone="good">{analysis.validRows} importierbar</Badge><Badge tone="warn">{analysis.warningRows} Warnungen</Badge><Badge tone="danger">{analysis.errorRows} abgelehnt</Badge></div></div>
        {(analysis.unknownInstrumentTypes.length > 0 || analysis.probableDuplicateRows.length > 0 || analysis.missingRequiredRows.length > 0) && <div className="mt-4 grid gap-2 text-xs text-muted sm:grid-cols-3">
          <div>Unbekannte Instrumenttypen: {analysis.unknownInstrumentTypes.join(", ") || "keine"}</div>
          <div>Wahrscheinlich identische Zeilen: {analysis.probableDuplicateRows.join(", ") || "keine"}</div>
          <div>Fehlende Mindestwerte: {analysis.missingRequiredRows.join(", ") || "keine"}</div>
        </div>}
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="text-left text-xs text-muted"><tr><th className="pb-3">Zeile</th><th>Status</th><th>Ticker</th><th>Bezeichnung</th><th>Menge</th><th>Kategorie</th><th>Hinweise</th></tr></thead><tbody>{analysis.rows.slice(0, 50).map((row) => <tr key={row.rowNumber} className="border-t border-border/60 align-top"><td className="py-3">{row.rowNumber}</td><td><Badge tone={row.status === "valid" ? "good" : row.status === "warning" ? "warn" : "danger"}>{row.status === "valid" ? "gültig" : row.status === "warning" ? "Warnung" : "Fehler"}</Badge></td><td className="font-medium">{row.position?.ticker || mappedCell(row.raw, mapping, "ticker") || "–"}</td><td>{row.position?.instrument_name || mappedCell(row.raw, mapping, "instrument_name") || "–"}</td><td>{row.position?.quantity ?? (mappedCell(row.raw, mapping, "quantity") || "–")}</td><td>{row.position?.category_name || mappedCell(row.raw, mapping, "category_name") || "Nicht zugeordnet"}</td><td className="max-w-[420px] text-xs"><div className="space-y-1 text-red-200">{row.errors.map((message) => <div key={message}>{message}</div>)}</div><div className="space-y-1 text-amber-200">{row.warnings.map((message) => <div key={message}>{message}</div>)}</div></td></tr>)}</tbody></table></div>
      </Card>

      <Card className="border-amber-500/30">
        <div className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-amber-300" size={20} /><div><h2 className="font-medium">Aktuellen aktiven Depotbestand ersetzen</h2><p className="mt-2 text-sm text-muted">Derzeit sind {currentPositionCount} aktive Positionen vorhanden. Nach Bestätigung werden sie transaktional durch {analysis.validRows} gültige Positionen ersetzt. {analysis.errorRows} fehlerhafte Zeilen werden nicht übernommen. Scheitert irgendein Datenbankschritt, bleibt der bisherige Bestand vollständig erhalten.</p></div></div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="flex grid-cols-none items-start gap-3 rounded-xl border border-border p-3 text-sm text-foreground"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={confirmationChecked} onChange={(event) => setConfirmationChecked(event.target.checked)} /><span>Ich habe die Vorschau geprüft und bestätige, dass der aktuelle aktive Depotbestand ersetzt werden soll.</span></label>
          <label>Zur Bestätigung exakt <span className="font-mono text-foreground">DEPOT ERSETZEN</span> eingeben<input value={confirmationText} onChange={(event) => setConfirmationText(event.target.value)} autoComplete="off" /></label>
        </div>
        {unresolvedCategories.length > 0 && <div className="mt-3 text-sm text-amber-200">Noch nicht zugeordnete Kategorien: {unresolvedCategories.join(", ")}</div>}
        <button type="button" disabled={!ready || pending} onClick={runImport} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-[#062218] disabled:cursor-not-allowed disabled:opacity-40"><ShieldCheck size={17} />{pending ? "Snapshot wird transaktional übernommen …" : "Snapshot jetzt übernehmen"}</button>
        {result && <div className={`mt-4 rounded-xl border p-3 text-sm ${result.ok ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200" : "border-red-500/30 bg-red-500/5 text-red-200"}`}><div className="flex items-start gap-2">{result.ok ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}<div><div>{result.message}</div>{result.ok && <div className="mt-1 text-xs">Ersetzt: {result.replacedPositionCount ?? 0} · Eingefügt: {result.insertedPositionCount ?? 0} · Abgeleitete Marktwerte: {result.derivedMarketValueCount ?? 0}</div>}</div></div></div>}
      </Card>
    </>}

    <Card>
      <h2 className="font-medium">Importhistorie</h2>
      <p className="mt-1 text-sm text-muted">Gespeichert werden nur Metadaten und Zähler, keine CSV-Rohzeilen.</p>
      {imports.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">Noch kein benutzerdefinierter CSV-Import vorhanden.</div> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="text-left text-xs text-muted"><tr><th className="pb-3">Datum</th><th>Dateiname</th><th>Quelle</th><th>Zeilen</th><th>Gültig</th><th>Warnungen</th><th>Abgelehnt</th><th>Status</th></tr></thead><tbody>{imports.map((entry) => <tr key={entry.id} className="border-t border-border/60"><td className="py-3">{new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.imported_at))}</td><td>{entry.original_filename}</td><td>Benutzerdefinierte CSV</td><td>{entry.total_rows}</td><td>{entry.valid_rows}</td><td>{entry.warning_rows}</td><td>{entry.rejected_rows}</td><td><Badge tone={entry.import_status === "completed" ? "good" : entry.import_status === "failed" ? "danger" : "warn"}>{entry.import_status}</Badge></td></tr>)}</tbody></table></div>}
    </Card>
  </div>;
}

function Fact({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "warn" | "danger" }) {
  const valueClass = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "danger" ? "text-red-300" : "text-foreground";
  return <div className="rounded-xl border border-border/70 bg-background/30 p-3"><div className="text-xs text-muted">{label}</div><div className={`mt-1 truncate font-medium ${valueClass}`} title={value}>{value}</div></div>;
}

function resolutionValue(resolution: CategoryResolution | undefined) {
  if (!resolution) return "";
  if (resolution.mode === "unassigned") return "unassigned";
  if (resolution.mode === "new") return "new";
  return resolution.target ?? "";
}

function mappedCell(raw: string[], mapping: ColumnMapping, field: CsvField) {
  const entry = Object.entries(mapping).find(([, mappedField]) => mappedField === field);
  return entry ? raw[Number(entry[0])]?.trim() : "";
}
