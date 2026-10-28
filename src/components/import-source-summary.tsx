import type { Json, PortfolioImport } from "@/lib/database.types";
import { Card } from "./ui";

const object = (value: Json | undefined) => value && typeof value === "object" && !Array.isArray(value) ? value : null;

export function ImportSourceSummary({ imported }: { imported: PortfolioImport | null }) {
  const metadata = object(imported?.metadata);
  const source = object(metadata?.source_document);
  if (!metadata || !source) return null;
  const documentId = typeof source.id === "string" && /^[A-Za-z0-9_-]{20,100}$/.test(source.id) ? source.id : null;
  const rows = Array.isArray(metadata.unresolved_rows) ? metadata.unresolved_rows.flatMap(value => {
    const row = object(value);
    return row && typeof row.row === "number" && Number.isInteger(row.row) && row.row > 0 && typeof row.ticker === "string" && typeof row.reason === "string"
      ? [{ row: row.row, ticker: row.ticker.slice(0, 80), reason: row.reason.slice(0, 1000) }] : [];
  }) : [];
  const sourceCount = typeof metadata.source_count === "number" ? metadata.source_count : imported?.total_rows;
  const accepted = typeof metadata.accepted_count === "number" ? metadata.accepted_count : imported?.inserted_position_count;
  const active = typeof metadata.active_count === "number" ? metadata.active_count : null;
  const reviews = Array.isArray(metadata.review_required) ? metadata.review_required.flatMap(value => {
    const row = object(value);
    return row && typeof row.reason === "string" ? [row.reason.slice(0, 1000)] : [];
  }) : [];
  return <Card className="mb-6">
    <h2 className="font-medium">Übernommener Tabellenstand</h2>
    <p className="mt-2 text-sm text-muted">{accepted} von {sourceCount} Einträgen übernommen{active !== null ? ` · ${active} offene Teilpositionen beim Import` : ""}. Die übrigen übernommenen Einträge gehören zur Handelshistorie.</p>
    {documentId && <a className="mt-3 inline-block text-sm text-accent underline underline-offset-4" href={`https://docs.google.com/spreadsheets/d/${documentId}/edit`} target="_blank" rel="noreferrer">Originaltabelle öffnen</a>}
    {reviews.length > 0 && <div role="status" className="mt-4 rounded-xl border border-amber-500/40 p-3 text-sm text-amber-100">
      <p className="font-medium">Angaben aus der Quelle noch abgleichen</p>
      <ul className="mt-2 space-y-2">{reviews.map((reason, i) => <li key={i}>{reason}</li>)}</ul>
      <p className="mt-3 text-xs leading-5">Die betroffenen Positionen verwenden bis zur Klärung die ursprünglich eingetragenen Mengen, Kurse und Währungen. Die daraus berechneten Depotwerte sind vorläufig.</p>
    </div>}
    {rows.length > 0 && <div role="status" className="mt-4 rounded-xl border border-amber-500/40 p-3 text-sm text-amber-100">
      <p className="font-medium">Zur Klärung aufbewahrt: {rows.length} {rows.length === 1 ? "Eintrag" : "Einträge"}</p>
      <ul className="mt-2 space-y-2">{rows.map((row, i) => <li key={`${row.row}:${i}`}>Quellzeile {row.row} · {row.ticker} · {row.reason}</li>)}</ul>
      <p className="mt-3 text-xs leading-5">Die Originalwerte bleiben im Importprotokoll erhalten. Diese Zeilen zählen bis zur Klärung nicht zu den ausgewerteten Trades. Die Übernahme der vollständigen Einträge wird dadurch nicht blockiert.</p>
    </div>}
    <p className="mt-3 text-xs leading-5 text-muted">Historische Einstiegsmargin und Verkaufsumrechnung werden nur aus belegten Referenzen berechnet. Die Quelldatei und ihre ursprünglichen Werte bleiben erhalten.</p>
  </Card>;
}
