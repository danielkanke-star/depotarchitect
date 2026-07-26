import Link from "next/link";
import { PositionForm } from "@/components/position-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { calculatePortfolio } from "@/lib/calculations/portfolio-calculations";
import { positionToCalculationInput } from "@/lib/calculations/position-adapter";
import type { CalculationMetric } from "@/lib/calculations/calculation-types";
import { getPortfolioData } from "@/lib/portfolio";
import { isMarginAccount, remainingQuantity } from "@/lib/portfolio-entry";
import { deletePosition, saveCapitalMovement } from "./actions";

type Params = { q?: string; category?: string; view?: string; edit?: string; add?: string };

export default async function DepotPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { portfolio, settings, categories, positions, fxRates, latestImport, capitalMovements } = await getPortfolioData();
  const activePositions = positions.filter((position) => position.status !== "closed");
  const riskBudget = portfolio.net_liquidity === null || Number(settings.risk_per_trade_pct) <= 0
    ? null
    : Number(portfolio.net_liquidity) * Number(settings.risk_per_trade_pct) / 100;
  const calculation = calculatePortfolio({
    netLiquidity: portfolio.net_liquidity,
    riskBudget,
    positions: activePositions.map((position) => positionToCalculationInput(position, portfolio, categories, fxRates, riskBudget)),
  });
  const calculatedById = new Map(calculation.positions.map((position) => [position.id, position]));
  const query = (params.q ?? "").toLowerCase();
  const view = params.view ?? "open";
  const filtered = positions.filter((position) => {
    const matchesQuery = !query || position.ticker.toLowerCase().includes(query);
    const matchesCategory = !params.category || position.category_id === params.category;
    const matchesView = view === "all" || (view === "closed" ? position.status === "closed" : position.status !== "closed");
    return matchesQuery && matchesCategory && matchesView;
  });
  const editPosition = positions.find((position) => position.id === params.edit && position.instrument_type !== "cash");
  const showPositionForm = params.add === "position" || Boolean(editPosition);
  const showMovementForm = params.add === "movement";
  const money = new Intl.NumberFormat("de-DE", { style: "currency", currency: portfolio.currency, maximumFractionDigits: 2 });

  return <>
    <PageHeader
      eyebrow="Depotverwaltung"
      title="Depot"
      description="Positionen sowie Ein- und Auszahlungen einfach erfassen. DepotArchitect berechnet die Kennzahlen zentral."
      action={<div className="flex flex-wrap justify-end gap-2"><Link href="/depot?add=movement#capital-movements" className="rounded-xl border border-border px-4 py-2.5 text-sm">Ein-/Auszahlung</Link><Link href="/depot?add=position" className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-[#062218]">Position hinzufügen</Link></div>}
    />

    {showPositionForm && <Card className="mb-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div><h2 className="font-medium">{editPosition ? `${editPosition.ticker} bearbeiten` : "Neue Position"}</h2><p className="mt-1 text-xs text-muted">Nur die notwendigen fachlichen Angaben werden erfasst.</p></div>
        <Link href="/depot" className="text-xs text-muted">Schließen</Link>
      </div>
      <PositionForm position={editPosition} categories={categories} accountType={portfolio.account_type} baseCurrency={portfolio.currency} />
    </Card>}

    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-medium">Positionen</h2><p className="mt-1 text-xs text-muted">Geschlossene und teilverkaufte Positionen bleiben nachvollziehbar.</p></div>
        <Link href="/import" className="text-xs text-accent">{latestImport ? "CSV-Import und Historie" : "Optionaler CSV-Import"}</Link>
      </div>
      <form className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px_170px_auto]">
        <input name="q" placeholder="Ticker suchen" defaultValue={params.q ?? ""} />
        <select name="category" defaultValue={params.category ?? ""}><option value="">Alle Kategorien</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
        <select name="view" defaultValue={view}><option value="open">Offen</option><option value="closed">Geschlossen</option><option value="all">Alle</option></select>
        <button className="rounded-xl border border-border px-4 py-2 text-sm">Anwenden</button>
      </form>
      {filtered.length === 0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">Keine passenden Positionen vorhanden.</div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-sm">
          <thead className="text-left text-xs text-muted"><tr><th className="pb-3">Position</th><th>Kategorie</th><th>Status</th><th>Menge</th><th>Einstand</th><th>Marktwert</th><th>Risiko bis Stopp</th><th>Margin</th><th></th></tr></thead>
          <tbody>{filtered.map((position) => {
            const result = calculatedById.get(position.id);
            const closed = position.status === "closed";
            const partial = !closed && Number(position.sold_quantity ?? 0) > 0;
            const legacyCash = position.instrument_type === "cash";
            return <tr key={position.id} className="border-t border-border/60 align-top">
              <td className="py-3"><div className="font-medium">{position.ticker}</div><div className="text-xs text-muted">{instrumentLabel(position.instrument_type)} · {position.instrument_currency}</div>{legacyCash && <div className="mt-1 text-[10px] text-amber-300">Legacy-Cash · nur lesbar</div>}</td>
              <td>{categories.find((category) => category.id === position.category_id)?.name ?? "Keine"}</td>
              <td><Badge tone={closed ? "neutral" : partial ? "warn" : "good"}>{closed ? "Geschlossen" : partial ? "Teilverkauft" : "Offen"}</Badge></td>
              <td><div>{Number(position.quantity).toLocaleString("de-DE")}</div>{partial && <div className="text-xs text-muted">{remainingQuantity(Number(position.quantity), position.sold_quantity).toLocaleString("de-DE")} offen</div>}</td>
              <td>{Number(position.entry_price).toLocaleString("de-DE", { maximumFractionDigits: 6 })} {position.instrument_currency}</td>
              <td>{closed || legacyCash ? "–" : <SimpleMetric metric={result?.positionValueBase} format={(value) => money.format(value)} missing="Aktueller Kurs fehlt" />}</td>
              <td>{closed || legacyCash ? "–" : <SimpleMetric metric={result?.stopRisk} format={(value) => money.format(value)} missing="Trading-Stopp oder Kurs fehlt" />}</td>
              <td>{!isMarginAccount(portfolio.account_type) ? "Nicht zutreffend" : closed || legacyCash ? "–" : <SimpleMetric metric={result?.marginRequirement} format={(value) => money.format(value)} missing="Marginangabe fehlt" />}</td>
              <td><div className="flex items-center gap-3">{!legacyCash && <Link href={`/depot?edit=${position.id}`} className="text-xs text-accent">Bearbeiten</Link>}<form action={deletePosition}><input type="hidden" name="id" value={position.id} /><button className="text-xs text-red-300">Löschen</button></form></div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
    </Card>

    <div id="capital-movements" className="mt-4"><Card>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-medium">Ein- und Auszahlungen</h2><p className="mt-1 text-xs text-muted">Externe Kapitalbewegungen werden dem Depot zugeordnet, aber nicht als Cashbestand oder Performance verbucht.</p></div>{!showMovementForm && <Link href="/depot?add=movement#capital-movements" className="text-sm text-accent">Hinzufügen</Link>}</div>
      {showMovementForm && <form action={saveCapitalMovement} className="mt-4 grid gap-3 border-b border-border/60 pb-5 sm:grid-cols-2 xl:grid-cols-5">
        <label>Typ<select name="movement_type" defaultValue="deposit"><option value="deposit">Einzahlung</option><option value="withdrawal">Auszahlung</option></select></label>
        <label>Betrag<input name="amount" required inputMode="decimal" /></label>
        <label>Währung<input name="currency" required maxLength={3} defaultValue={portfolio.currency} /></label>
        <label>Datum<input type="date" name="movement_date" required /></label>
        <label>Kommentar · optional<input name="comment" maxLength={500} /></label>
        <div className="flex gap-3 sm:col-span-2 xl:col-span-5"><button className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-[#062218]">Speichern</button><Link href="/depot#capital-movements" className="px-3 py-2.5 text-sm text-muted">Abbrechen</Link></div>
      </form>}
      {capitalMovements.length === 0 ? <p className="mt-4 text-sm text-muted">Noch keine Ein- oder Auszahlungen erfasst.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead className="text-left text-xs text-muted"><tr><th className="pb-3">Datum</th><th>Typ</th><th>Betrag</th><th>Kommentar</th></tr></thead><tbody>{capitalMovements.map((movement) => <tr key={movement.id} className="border-t border-border/60"><td className="py-3">{formatDate(movement.movement_date)}</td><td>{movement.movement_type === "deposit" ? "Einzahlung" : "Auszahlung"}</td><td>{Number(movement.amount_native).toLocaleString("de-DE", { minimumFractionDigits: 2 })} {movement.currency}</td><td className="text-muted">{movement.comment ?? "–"}</td></tr>)}</tbody></table></div>}
    </Card></div>
  </>;
}

function SimpleMetric({ metric, format, missing }: { metric?: CalculationMetric; format: (value: number) => string; missing: string }) {
  return metric?.value == null ? <span className="text-xs text-muted">{missing}</span> : <span>{format(metric.value)}</span>;
}

function instrumentLabel(value: string) {
  return ({ stock: "Aktie", etf: "ETF", option: "Option", warrant: "Optionsschein", knock_out: "Knock-out", cash: "Cash", other: "Sonstiges" } as Record<string, string>)[value] ?? value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00Z`));
}
