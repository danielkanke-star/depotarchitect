import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { calculationExplanation, MARGIN_PROVENANCE_LABELS } from "@/lib/calculations/calculation-provenance";
import { calculatePortfolio } from "@/lib/calculations/portfolio-calculations";
import { positionToCalculationInput } from "@/lib/calculations/position-adapter";
import type { CalculationMetric } from "@/lib/calculations/calculation-types";
import { pct } from "@/lib/format";
import { getPortfolioData } from "@/lib/portfolio";
import { deletePosition, savePosition } from "./actions";

export default async function DepotPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; sort?: string; edit?: string; add?: string }> }) {
  const params = await searchParams;
  const { portfolio, categories, positions, latestImport } = await getPortfolioData();
  const calculation = calculatePortfolio({
    netLiquidity: portfolio.net_liquidity,
    positions: positions.map((position) => positionToCalculationInput(position, portfolio, categories)),
  });
  const calculatedById = new Map(calculation.positions.map((position) => [position.id, position]));
  const query = (params.q ?? "").toLowerCase();
  let filtered = positions.filter((position) => (!query || position.ticker.toLowerCase().includes(query) || position.instrument_name?.toLowerCase().includes(query)) && (!params.category || position.category_id === params.category));
  filtered = [...filtered].sort((a, b) => {
    if (params.sort === "ticker") return a.ticker.localeCompare(b.ticker);
    const aCalculation = calculatedById.get(a.id);
    const bCalculation = calculatedById.get(b.id);
    return params.sort === "risk"
      ? (bCalculation?.stopRisk.value ?? -1) - (aCalculation?.stopRisk.value ?? -1)
      : (bCalculation?.positionValueBase.value ?? -1) - (aCalculation?.positionValueBase.value ?? -1);
  });
  const editPosition = positions.find((position) => position.id === params.edit);
  const editCalculation = editPosition ? calculatedById.get(editPosition.id) : null;
  const showForm = params.add === "1" || Boolean(editPosition);
  const money = new Intl.NumberFormat("de-DE", { style: "currency", currency: portfolio.currency, maximumFractionDigits: 2 });

  return <>
    <PageHeader eyebrow="Positionsverwaltung" title="Depot" description="Ausgangsdaten pflegen; Marktwert, Ergebnis, Margin und Stopprisiko berechnet DepotArchitect zentral." action={<div className="flex flex-wrap items-center justify-end gap-3">{latestImport && <div className="text-right text-xs text-muted"><div className="text-emerald-300">Quelle: Benutzerdefinierte CSV</div><div>{formatImportDate(latestImport.imported_at)} · {latestImport.inserted_position_count} Teilpositionen</div><Link href="/import" className="text-accent">Importhistorie</Link></div>}<Link href="/depot?add=1" className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-[#062218]">Position hinzufügen</Link></div>} />
    {showForm && <Card className="mb-4">
      <div className="mb-4 flex items-center justify-between"><div><h2 className="font-medium">{editPosition ? `${editPosition.ticker} bearbeiten` : "Neue Teilposition"}</h2><p className="mt-1 text-xs text-muted">Nur Quelldaten sind editierbar. Ergebniswerte werden beim Speichern neu berechnet.</p></div><Link href="/depot" className="text-xs text-muted">Schließen</Link></div>
      <form action={savePosition} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <input type="hidden" name="id" value={editPosition?.id ?? ""} />
        <label>Ticker<input name="ticker" required defaultValue={editPosition?.ticker ?? ""} /></label>
        <label>Bezeichnung<input name="instrument_name" defaultValue={editPosition?.instrument_name ?? ""} /></label>
        <label>Kategorie<select name="category_id" defaultValue={editPosition?.category_id ?? ""}><option value="">Keine</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>Strategie<input name="strategy" defaultValue={editPosition?.strategy ?? ""} /></label>
        <label>Richtung<select name="direction" defaultValue={editPosition?.direction ?? "long"}><option value="long">Long</option><option value="short">Short</option><option value="long_put">Long Put</option><option value="long_call">Long Call</option><option value="short_put">Short Put</option><option value="short_call">Short Call</option></select></label>
        <label>Instrument<select name="instrument_type" defaultValue={editPosition?.instrument_type ?? "stock"}><option value="stock">Aktie</option><option value="etf">ETF</option><option value="option">Option</option><option value="cash">Cash</option><option value="other">Sonstiges</option></select></label>
        <label>Menge<input name="quantity" required inputMode="decimal" defaultValue={editPosition?.quantity ?? 1} /></label>
        <label>Multiplikator<input name="multiplier" required inputMode="decimal" defaultValue={editPosition?.multiplier ?? 1} /></label>
        <label>Einstandskurs<input name="entry_price" required inputMode="decimal" defaultValue={editPosition?.entry_price ?? 0} /></label>
        <label>Aktueller Kurs<input name="current_price" inputMode="decimal" defaultValue={editPosition?.current_price ?? ""} /></label>
        <label>Instrumentwährung<input name="instrument_currency" maxLength={3} defaultValue={editPosition?.instrument_currency ?? portfolio.currency} /></label>
        <label>FX zur Basiswährung<input name="fx_to_base" inputMode="decimal" defaultValue={editPosition?.fx_to_base ?? ((editPosition?.instrument_currency ?? portfolio.currency) === portfolio.currency ? 1 : "")} /></label>
        <label>Manueller Stopp<input name="stop_price" inputMode="decimal" defaultValue={editPosition?.stop_price ?? ""} /></label>
        <label>Margin-Prozentsatz<input name="margin_percent" inputMode="decimal" defaultValue={editPosition?.margin_percent ?? ""} /></label>
        <label>Direktes Margin Requirement<input name="margin_requirement" inputMode="decimal" defaultValue={editPosition?.margin_requirement ?? ""} /></label>
        <label>Optionsart<select name="option_type" defaultValue={editPosition?.option_type ?? ""}><option value="">Nicht zutreffend</option><option value="call">Call</option><option value="put">Put</option></select></label>
        <label>Ausübungspreis<input name="strike_price" inputMode="decimal" defaultValue={editPosition?.strike_price ?? ""} /></label>
        <label>Verfallsdatum<input type="date" name="expiration_date" defaultValue={editPosition?.expiration_date ?? ""} /></label>
        <label>Sektor<input name="sector" defaultValue={editPosition?.sector ?? ""} /></label>
        <label>Einstiegsdatum<input type="date" name="entry_date" defaultValue={editPosition?.entry_date ?? ""} /></label>
        <label>Datenzeitpunkt<input type="datetime-local" name="data_as_of" defaultValue={toDateTimeLocal(editPosition?.data_as_of)} /></label>
        <label>Status<select name="status" defaultValue={editPosition?.status ?? "active"}><option value="active">Aktiv</option><option value="watch">Beobachten</option><option value="high">Hoch</option><option value="danger">Gefahr</option></select></label>
        <label className="sm:col-span-2">Kommentar<textarea name="notes" rows={3} defaultValue={editPosition?.notes ?? ""} /></label>
        {editCalculation && <div className="sm:col-span-2 xl:col-span-4 grid gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 sm:grid-cols-2 xl:grid-cols-4">
          <CalculatedFact label="Positionswert" metric={editCalculation.positionValueBase} format={(value) => money.format(value)} />
          <CalculatedFact label="Unrealisiertes Ergebnis" metric={editCalculation.unrealizedPnl} format={(value) => money.format(value)} />
          <CalculatedFact label={`Margin · ${MARGIN_PROVENANCE_LABELS[editCalculation.marginRequirement.provenance]}`} metric={editCalculation.marginRequirement} format={(value) => money.format(value)} />
          <CalculatedFact label="Risiko bis Stopp" metric={editCalculation.stopRisk} format={(value) => money.format(value)} />
        </div>}
        <div className="sm:col-span-2 xl:col-span-4"><button className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-[#062218]">Ausgangsdaten speichern und neu berechnen</button></div>
      </form>
    </Card>}
    <Card>
      <form className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px_180px_auto]"><input name="q" placeholder="Ticker oder Name suchen" defaultValue={params.q ?? ""} /><select name="category" defaultValue={params.category ?? ""}><option value="">Alle Kategorien</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><select name="sort" defaultValue={params.sort ?? "market"}><option value="market">Berechneter Marktwert</option><option value="ticker">Ticker</option><option value="risk">Berechnetes Risiko</option></select><button className="rounded-xl border border-border px-4 py-2 text-sm">Anwenden</button></form>
      <div className="overflow-x-auto"><table className="w-full min-w-[1320px] text-sm"><thead className="text-left text-xs text-muted"><tr><th className="pb-3">Instrument</th><th>Kategorie / Strategie</th><th>Richtung</th><th>Positionswert</th><th>NetLiq-Anteil</th><th>Ergebnis</th><th>Margin</th><th>Stopprisiko</th><th>Risiko / NetLiq</th><th>Risikoanteil</th><th></th></tr></thead><tbody>{filtered.map((position) => {
        const result = calculatedById.get(position.id);
        if (!result) return null;
        return <tr key={position.id} className="border-t border-border/60 align-top"><td className="py-3"><div className="font-medium">{position.ticker}</div><div className="text-xs text-muted">{position.instrument_name || "–"} · {position.instrument_currency || "Währung fehlt"}</div></td><td><div>{result.categoryName ?? "Nicht zugeordnet"}</div><div className="text-xs text-muted">{position.strategy ?? "Keine Strategie"}</div></td><td className="text-muted">{position.direction}</td><td><MetricValue metric={result.positionValueBase} format={(value) => money.format(value)} /></td><td><MetricValue metric={result.netLiquidityShare} format={(value) => pct(value * 100)} /></td><td><MetricValue metric={result.unrealizedPnl} format={(value) => money.format(value)} /></td><td><MetricValue metric={result.marginRequirement} format={(value) => money.format(value)} detail={MARGIN_PROVENANCE_LABELS[result.marginRequirement.provenance]} /></td><td><MetricValue metric={result.stopRisk} format={(value) => money.format(value)} /></td><td><MetricValue metric={result.riskToNetLiquidity} format={(value) => pct(value * 100)} /></td><td><MetricValue metric={result.riskShareOfCalculableTotal} format={(value) => pct(value * 100)} /></td><td><div className="flex items-center gap-3"><Link href={`/depot?edit=${position.id}`} className="text-xs text-accent">Bearbeiten</Link><form action={deletePosition}><input type="hidden" name="id" value={position.id} /><button className="text-xs text-red-300">Löschen</button></form></div></td></tr>;
      })}</tbody></table></div>
    </Card>
  </>;
}

function MetricValue({ metric, format, detail }: { metric: CalculationMetric; format: (value: number) => string; detail?: string }) {
  if (metric.value === null) return <span className="text-xs text-muted" title={calculationExplanation(metric.status, metric.reasons)}>{calculationExplanation(metric.status, metric.reasons)}</span>;
  return <div title={calculationExplanation(metric.status, metric.reasons)}><div>{format(metric.value)}</div><div className="text-[10px] uppercase tracking-wide text-emerald-300">Berechnet{detail ? ` · ${detail}` : ""}</div>{metric.status === "source_fallback" && <div className="text-[10px] text-amber-300">Legacy-Fallback</div>}</div>;
}

function CalculatedFact({ label, metric, format }: { label: string; metric: CalculationMetric; format: (value: number) => string }) {
  return <div><div className="text-[10px] uppercase tracking-wide text-emerald-300">Berechnet · {label}</div><div className="mt-1 text-sm">{metric.value === null ? calculationExplanation(metric.status, metric.reasons) : format(metric.value)}</div></div>;
}

function formatImportDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
