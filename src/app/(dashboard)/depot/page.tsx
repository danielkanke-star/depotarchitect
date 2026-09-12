import Link from "next/link";
import { PositionForm } from "@/components/position-form";
import { DepotViewPreferences } from "@/components/depot-view-preferences";
import { Badge, Card, PageHeader } from "@/components/ui";
import { calculatePortfolio } from "@/lib/calculations/portfolio-calculations";
import { positionToCalculationInput } from "@/lib/calculations/position-adapter";
import type { CalculationMetric } from "@/lib/calculations/calculation-types";
import { getPositionMarketDataMappings } from "@/lib/market-data-mappings";
import { getPortfolioData } from "@/lib/portfolio";
import { isMarginAccount, remainingQuantity } from "@/lib/portfolio-entry";
import { positionPriceSourceLabel, resolvePositionPrice } from "@/lib/price-resolution";
import { deletePosition, refreshPositionPrice, saveCapitalMovement } from "./actions";

type Params = { q?: string; category?: string; view?: string; edit?: string; add?: string; price?: string };

export default async function DepotPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { portfolio, settings, categories, positions, fxRates, priceObservations, latestImport, capitalMovements } = await getPortfolioData();
  const marketDataMappings = await getPositionMarketDataMappings(portfolio.id);
  const mappingByPositionId = new Map(marketDataMappings.map((mapping) => [mapping.position_id, mapping]));
  const activePositions = positions.filter((position) => position.status !== "closed");
  const riskBudget = portfolio.net_liquidity === null || Number(settings.risk_per_trade_pct) <= 0
    ? null
    : Number(portfolio.net_liquidity) * Number(settings.risk_per_trade_pct) / 100;
  const calculation = calculatePortfolio({
    netLiquidity: portfolio.net_liquidity,
    riskBudget,
    positions: activePositions.map((position) => positionToCalculationInput(position, portfolio, categories, fxRates, riskBudget, priceObservations)),
  });
  const calculatedById = new Map(calculation.positions.map((position) => [position.id, position]));
  const pricesByPositionId = new Map(positions.map((position) => [
    position.id,
    resolvePositionPrice(position, priceObservations),
  ]));
  const query = (params.q ?? "").toLowerCase();
  const view = params.view ?? "open";
  const filtered = positions.filter((position) => {
    const matchesQuery = !query
      || position.ticker.toLowerCase().includes(query)
      || position.instrument_name?.toLowerCase().includes(query);
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
      <PositionForm
        position={editPosition}
        categories={categories}
        accountType={portfolio.account_type}
        baseCurrency={portfolio.currency}
        currentPrice={editPosition ? pricesByPositionId.get(editPosition.id)?.price ?? null : null}
        currentPriceSource={editPosition ? priceSourceDescription(pricesByPositionId.get(editPosition.id) ?? null) : null}
        marketDataMapping={editPosition ? mappingByPositionId.get(editPosition.id) ?? null : null}
      />
    </Card>}

    {priceNotice(params.price)}

    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-medium">Positionen</h2><p className="mt-1 text-xs text-muted">Geschlossene und teilverkaufte Positionen bleiben nachvollziehbar.</p></div>
        <Link href="/import" className="text-xs text-accent">{latestImport ? "CSV-Import und Historie" : "Optionaler CSV-Import"}</Link>
      </div>
      <form className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px_170px_auto]">
        <input name="q" placeholder="Ticker oder Unternehmen suchen" defaultValue={params.q ?? ""} />
        <select name="category" defaultValue={params.category ?? ""}><option value="">Alle Kategorien</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
        <select name="view" defaultValue={view}><option value="open">Offen</option><option value="closed">Geschlossen</option><option value="all">Alle</option></select>
        <button className="rounded-xl border border-border px-4 py-2 text-sm">Anwenden</button>
      </form>
      {filtered.length === 0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">Keine passenden Positionen vorhanden.</div> : <DepotViewPreferences baseCurrency={portfolio.currency}><div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-xs text-muted"><tr><th className="pb-3">Position</th><th>Kategorie</th><th>Status</th><th>Menge</th><th>Einstiegskurs</th><th>Aktueller Kurs</th><th>Marktwert</th><th className="depot-column-base-market-value">Marktwert {portfolio.currency}</th><th className="depot-column-risk">Risiko</th><th className="depot-column-margin">Margin</th><th className="depot-column-price-details">Kursdetails</th><th>Aktionen</th></tr></thead>
          <tbody>{filtered.map((position) => {
            const result = calculatedById.get(position.id);
            const closed = position.status === "closed";
            const partial = !closed && Number(position.sold_quantity ?? 0) > 0;
            const legacyCash = position.instrument_type === "cash";
            const resolvedPrice = pricesByPositionId.get(position.id) ?? null;
            return <tr key={position.id} className="border-t border-border/60 align-top">
              <td className="py-3"><div className="font-medium">{position.ticker}</div>{position.instrument_name && <div className="text-xs text-foreground/80">{position.instrument_name}</div>}<div className="text-xs text-muted">{instrumentLabel(position.instrument_type)} · {position.instrument_currency}</div>{legacyCash && <div className="mt-1 text-[10px] text-amber-300">Legacy-Cash · nur lesbar</div>}</td>
              <td>{categories.find((category) => category.id === position.category_id)?.name ?? "Keine"}</td>
              <td><Badge tone={closed ? "neutral" : partial ? "warn" : "good"}>{closed ? "Geschlossen" : partial ? "Teilverkauft" : "Offen"}</Badge></td>
              <td><div>{Number(position.quantity).toLocaleString("de-DE")}</div>{partial && <div className="text-xs text-muted">{remainingQuantity(Number(position.quantity), position.sold_quantity).toLocaleString("de-DE")} offen</div>}</td>
              <td>{Number(position.entry_price).toLocaleString("de-DE", { maximumFractionDigits: 6 })} {position.instrument_currency}</td>
              <td>{closed || legacyCash || !resolvedPrice ? "–" : <div>{resolvedPrice.price.toLocaleString("de-DE", { maximumFractionDigits: 6 })} {resolvedPrice.currency}</div>}</td>
              <td>{closed || legacyCash ? "–" : <SimpleMetric metric={result?.positionValueInstrument} format={(value) => formatInstrumentMoney(value, position.instrument_currency)} missing="Aktueller Kurs fehlt" />}</td>
              <td className="depot-column-base-market-value">{closed || legacyCash ? "–" : <SimpleMetric metric={result?.positionValueBase} format={(value) => money.format(value)} missing={result?.positionValueInstrument.value == null ? "Aktueller Kurs fehlt" : "FX fehlt"} />}</td>
              <td className="depot-column-risk">{closed || legacyCash ? "–" : (position.stop_price_native ?? position.stop_price) == null ? <span className="text-xs text-muted">Kein Stop</span> : <SimpleMetric metric={result?.stopRisk} format={(value) => money.format(value)} missing="Risiko nicht berechenbar" />}</td>
              <td className="depot-column-margin">{!isMarginAccount(portfolio.account_type) ? "Nicht zutreffend" : closed || legacyCash ? "–" : <SimpleMetric metric={result?.marginRequirement} format={(value) => money.format(value)} missing="Noch nicht hinterlegt" />}</td>
              <td className="depot-column-price-details">{closed || legacyCash || !resolvedPrice ? "–" : <PriceDetails price={resolvedPrice} exchange={mappingByPositionId.get(position.id)?.exchange ?? null} micCode={mappingByPositionId.get(position.id)?.mic_code ?? null} />}</td>
              <td><div className="flex flex-wrap items-center gap-3">{!legacyCash && !closed && <form action={refreshPositionPrice}><input type="hidden" name="id" value={position.id} /><button className="text-xs text-accent">Kurs aktualisieren</button></form>}{!legacyCash && <Link href={`/depot?edit=${position.id}`} className="text-xs text-accent">Bearbeiten</Link>}<form action={deletePosition}><input type="hidden" name="id" value={position.id} /><button className="text-xs text-red-300">Löschen</button></form></div></td>
            </tr>;
          })}</tbody>
        </table>
      </div></DepotViewPreferences>}
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

function formatInstrumentMoney(value: number, currency: string | null) {
  const normalizedCurrency = currency?.trim().toUpperCase();
  if (!normalizedCurrency || !/^[A-Z]{3}$/.test(normalizedCurrency)) {
    return `${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${normalizedCurrency ?? ""}`.trim();
  }
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: normalizedCurrency, currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function PriceDetails({
  price,
  exchange,
  micCode,
}: {
  price: NonNullable<ReturnType<typeof resolvePositionPrice>>;
  exchange: string | null;
  micCode: string | null;
}) {
  const date = price.observedAt
    ? new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(price.observedAt))
    : "Zeitpunkt fehlt";
  const source = price.sourceName && price.sourceName !== price.sourceType
    ? price.sourceName
    : positionPriceSourceLabel(price.sourceType);
  const status = price.status === "stale" ? "veraltet" : price.status === "end_of_day" ? "Schlusskurs" : price.status === "delayed" ? "verzögert" : "aktuell";
  return <div className="max-w-52 text-xs text-muted">
    <div>{source}</div>
    <div>{exchange ?? "Börse nicht benannt"}{micCode ? ` (${micCode})` : ""}</div>
    <div>{status} · {date}</div>
  </div>;
}

function instrumentLabel(value: string) {
  return ({ stock: "Aktie", etf: "ETF", option: "Option", warrant: "Optionsschein", knock_out: "Knock-out", cash: "Cash", other: "Sonstiges" } as Record<string, string>)[value] ?? value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00Z`));
}

function priceSourceDescription(price: ReturnType<typeof resolvePositionPrice>) {
  if (!price) return null;
  const date = price.observedAt
    ? new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(price.observedAt))
    : null;
  const genericLabel = positionPriceSourceLabel(price.sourceType);
  const sourceLabel = price.sourceName && price.sourceName !== price.sourceType
    ? price.sourceName
    : genericLabel;
  return [sourceLabel, price.status === "stale" ? "veraltet" : null, date]
    .filter(Boolean)
    .join(" · ");
}

function priceNotice(status: string | undefined) {
  const messages: Record<string, { tone: string; text: string }> = {
    updated: {
      tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
      text: "Der Twelve-Data-Kurs der gewählten Hauptnotierung wurde gespeichert. Ein späterer gültiger IBKR-Kurs bleibt vorrangig.",
    },
    "provider-disabled": {
      tone: "border-border bg-panel text-muted",
      text: "Twelve Data ist in dieser Umgebung noch nicht aktiviert. Der vorhandene Rückfallkurs bleibt aktiv.",
    },
    "not-found": {
      tone: "border-amber-500/30 bg-amber-500/10 text-amber-100",
      text: "Für Ticker und Währung war bei Twelve Data kein Kurs verfügbar. Der vorhandene Rückfallkurs bleibt aktiv.",
    },
    "provider-error": {
      tone: "border-amber-500/30 bg-amber-500/10 text-amber-100",
      text: "Twelve Data war nicht verfügbar oder das Abfragelimit war erreicht. Der vorhandene Rückfallkurs bleibt aktiv.",
    },
    "higher-priority-active": {
      tone: "border-border bg-panel text-muted",
      text: "Ein höher priorisierter Broker- oder IBKR-Kurs bleibt aktiv.",
    },
  };
  const notice = status ? messages[status] : null;
  return notice
    ? <div className={`mb-4 rounded-xl border p-3 text-sm ${notice.tone}`}>{notice.text}</div>
    : null;
}
