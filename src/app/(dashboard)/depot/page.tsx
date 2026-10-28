import Link from "next/link";
import { looksLikeOptionContract } from "@/lib/source-instrument";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { PositionJournalDetails } from "@/components/position-journal-details";
import { depotRiskBudget, stopAge } from "@/lib/risk-rules";
import { PositionRows } from "@/components/position-rows";
import { PositionRiskCell } from "@/components/position-risk-cell";
import { InfoTip } from "@/components/info-tip";
import { PositionForm } from "@/components/position-form";
import { DepotViewPreferences } from "@/components/depot-view-preferences";
import { Card, PageHeader } from "@/components/ui";
import { calculatePortfolio } from "@/lib/calculations/portfolio-calculations";
import { positionToCalculationInput } from "@/lib/calculations/position-adapter";
import type { CalculationMetric } from "@/lib/calculations/calculation-types";
import { getPositionMarketDataMappings } from "@/lib/market-data-mappings";
import { getPortfolioData } from "@/lib/portfolio";
import { isMarginAccount, remainingQuantity } from "@/lib/portfolio-entry";
import { positionPriceSourceLabel, resolvePositionPrice } from "@/lib/price-resolution";
import { deletePosition, refreshPositionPrice, saveCapitalMovement } from "./actions";

type Params = { q?: string; category?: string; view?: string; edit?: string; add?: string; price?: string; sort?:string; page?:string };

export default async function DepotPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { portfolio, categories, positions, fxRates, priceObservations, latestImport, capitalMovements, sales, journalAvailable, journalReferences } = await getPortfolioData();
  const marketDataMappings = await getPositionMarketDataMappings(portfolio.id);
  const mappingByPositionId = new Map(marketDataMappings.map((mapping) => [mapping.position_id, mapping]));
  const activePositions = positions.filter((position) => position.status !== "closed");
  const riskBudget = depotRiskBudget(portfolio.net_liquidity, portfolio.risk_profile);
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
  if(params.sort==="risk") filtered.sort((a,b)=>(calculatedById.get(b.id)?.stopRisk.value??-1)-(calculatedById.get(a.id)?.stopRisk.value??-1));
  if(params.sort==="stop-age") filtered.sort((a,b)=>(stopAge(b.stop_updated_at).days??Infinity)-(stopAge(a.stop_updated_at).days??Infinity));
  if(params.sort==="name") filtered.sort((a,b)=>a.ticker.localeCompare(b.ticker));
  const pages=Math.max(1,Math.ceil(filtered.length/50));
  const page=Math.max(1,Math.min(pages,Math.floor(Number(params.page)||1)));
  const visible=filtered.slice((page-1)*50,page*50);
  const pageLink=(target:number)=>"/depot?"+new URLSearchParams({q:params.q??"",category:params.category??"",view,sort:params.sort??"source",page:String(target)}).toString();
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
    {!journalAvailable && <p className="mb-4 rounded-xl border border-amber-500 p-4 text-sm text-amber-200">Die Journalmigration fehlt. Die vorhandenen Positionen bleiben lesbar; neue Funktionen müssen zuerst freigeschaltet werden.</p>}

    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><h2 className="font-medium">Positionen</h2><InfoTip label="Positionsjournal">Geschlossene und teilverkaufte Positionen bleiben im Journal erhalten. Öffne eine Zeile für Details und Verkäufe.</InfoTip></div>
        <Link href="/import" className="text-xs text-accent">{latestImport ? "CSV-Import und Historie" : "Optionaler CSV-Import"}</Link>
      </div>
      <form className="table-toolbar">
        <div className="relative min-w-[200px] flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-3 text-muted"/><input name="q" aria-label="Positionen suchen" placeholder="Ticker oder Unternehmen suchen" defaultValue={params.q??""} className="pl-9"/></div>
        <select name="category" aria-label="Kategorie" defaultValue={params.category??""}><option value="">Alle Kategorien</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="view" aria-label="Positionsstatus" defaultValue={view}><option value="open">Offene Positionen</option><option value="closed">Geschlossene Positionen</option><option value="all">Alle Positionen</option></select>
        <select name="sort" aria-label="Positionen sortieren" defaultValue={params.sort??"source"}><option value="source">Meine Reihenfolge</option><option value="risk">Höchstes Risiko</option><option value="stop-age">Älteste Stopps</option><option value="name">Ticker A–Z</option></select>
        <button className="toolbar-button">Anwenden</button>
      </form>
      {filtered.length===0?<div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted">Keine passenden Positionen.</div>:<DepotViewPreferences baseCurrency={portfolio.currency}><div className="-mx-2 overflow-x-auto">
        <table className="financial-table min-w-[960px]"><thead><tr><th>Position</th><th className="number">Bestand</th><th className="number">Einstieg</th><th className="number">Aktueller Kurs</th><th className="depot-column-risk"><span className="inline-flex items-center gap-1">Stopp & Risiko <InfoTip label="Stopp und Risiko">Risiko ab dem aktuellen Kurs bis zur hinterlegten Stopporder, in der Handelswährung. Darunter die Euro-Umrechnung und der NetLiq-Anteil. Ein Stopp ist keine garantierte Verlustobergrenze. Das Alter bezieht sich auf die letzte tatsächliche Stoppänderung.</InfoTip></span></th><th className="number">Positionswert</th><th className="number depot-column-margin">Margin</th><th className="depot-column-price-details">Kursquelle</th><th><span className="sr-only">Aktionen</span></th></tr></thead>
          <tbody>{visible.map(position=>{
            const result=calculatedById.get(position.id),closed=position.status==="closed",partial=!closed&&Number(position.sold_quantity??0)>0,legacyCash=position.instrument_type==="cash";
            const resolvedPrice=pricesByPositionId.get(position.id)??null;
            const category=categories.find(c=>c.id===position.category_id)?.name??"Ohne Kategorie";
            return <PositionRows key={position.id} id={position.id} ticker={position.ticker} colSpan={9}
              identity={<><strong>{position.ticker}</strong>{position.instrument_name&&<div className="secondary max-w-[200px] truncate" title={position.instrument_name}>{position.instrument_name}</div>}<div className="mt-1.5 flex flex-wrap gap-1"><span className="table-kind">{category}</span><span className="table-kind">{instrumentLabel(position.instrument_type,position.ticker)}</span>{closed&&<span className="table-kind">Geschlossen</span>}{partial&&<span className="table-kind text-amber-200">Teilverkauft</span>}</div></>}
              cells={<>
                <td className="number"><span className="font-medium">{(closed?Number(position.quantity):remainingQuantity(Number(position.quantity),position.sold_quantity)).toLocaleString("de-DE",{maximumFractionDigits:6})}</span>{position.instrument_type==="option"&&<div className="secondary">Kontrakt · ×{position.multiplier}</div>}{partial&&<div className="secondary">von {Number(position.quantity).toLocaleString("de-DE")}</div>}</td>
                <td className="number">{formatInstrumentPrice(Number(position.entry_price),position.instrument_currency)}<div className="secondary">{position.entry_date?formatDate(position.entry_date):"Datum offen"}</div></td>
                <td className="number">{closed||legacyCash||!resolvedPrice?"—":<><span className="font-medium">{formatInstrumentPrice(resolvedPrice.price,resolvedPrice.currency)}</span>{["google_sheets","custom_csv"].includes(resolvedPrice.sourceType)&&<div className="secondary">Tabellenreferenz</div>}</>}</td>
                <td className="depot-column-risk risk-cell">{closed||legacyCash?"—":<PositionRiskCell position={position} result={result} baseCurrency={portfolio.currency} profile={portfolio.risk_profile}/>}</td>
                <td className="number">{closed||legacyCash?"—":<><SimpleMetric metric={result?.positionValueInstrument} format={v=>formatInstrumentMoney(v,position.instrument_currency)} missing="Kurs offen"/>{position.instrument_currency!==portfolio.currency&&<div className="secondary depot-column-base-market-value"><SimpleMetric metric={result?.positionValueBase} format={v=>money.format(v)} missing="Umrechnung offen"/></div>}</>}</td>
                <td className="number depot-column-margin">{!isMarginAccount(portfolio.account_type)||closed||legacyCash?"—":<SimpleMetric metric={result?.marginRequirement} format={v=>money.format(v)} missing="Margin offen"/>}</td>
                <td className="depot-column-price-details">{closed||legacyCash||!resolvedPrice?"—":<PriceDetails price={resolvedPrice} exchange={mappingByPositionId.get(position.id)?.exchange??null} micCode={mappingByPositionId.get(position.id)?.mic_code??null}/>}</td>
                <td><InfoTip menu label={"Aktionen für "+position.ticker}>{!legacyCash&&!closed&&<form action={refreshPositionPrice}><input type="hidden" name="id" value={position.id}/><button>Kurs aktualisieren</button></form>}{!legacyCash&&<Link href={"/depot?edit="+position.id}>Position bearbeiten</Link>}{Number(position.sold_quantity??0)===0&&<form action={deletePosition}><input type="hidden" name="id" value={position.id}/><button className="text-red-300">Position löschen</button></form>}</InfoTip></td>
              </>}
              details={legacyCash?null:<PositionJournalDetails bare position={position} result={result} sales={sales} baseCurrency={portfolio.currency} profile={portfolio.risk_profile} available={journalAvailable} references={journalReferences}/>}
            />;
          })}</tbody></table>
      </div></DepotViewPreferences>}
      <div className="table-pagination"><span>{filtered.length} {filtered.length===1?"Teilposition":"Teilpositionen"}{filtered.length>50?" · "+((page-1)*50+1)+"–"+Math.min(page*50,filtered.length):""}</span>{pages>1&&<div className="flex items-center gap-3">{page>1?<Link aria-label="Vorherige Positionen" href={pageLink(page-1)} className="rounded-lg border border-border p-2"><ChevronLeft size={15}/></Link>:<span className="p-2 opacity-30"><ChevronLeft size={15}/></span>}<span>{page} / {pages}</span>{page<pages?<Link aria-label="Nächste Positionen" href={pageLink(page+1)} className="rounded-lg border border-border p-2"><ChevronRight size={15}/></Link>:<span className="p-2 opacity-30"><ChevronRight size={15}/></span>}</div>}</div>

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

function formatInstrumentPrice(value:number,currency:string|null) {
  return currency?new Intl.NumberFormat("de-DE",{style:"currency",currency,currencyDisplay:"code",minimumFractionDigits:2,maximumFractionDigits:6}).format(value):"—";
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
    ? new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(price.observedAt))
    : "Zeitpunkt fehlt";
  const source = price.sourceName && price.sourceName !== price.sourceType
    ? price.sourceName
    : positionPriceSourceLabel(price.sourceType);
  const status = price.status === "stale" ? "veraltet" : price.status === "end_of_day" ? "Schlusskurs" : price.status === "delayed" ? "verzögert" : price.status === "live" ? "Echtzeitversorgung" : "Referenzkurs";
  return <div className="max-w-52 text-xs text-muted">
    <div>{source}</div>
    <div>{exchange ?? "Börse nicht benannt"}{micCode ? ` (${micCode})` : ""}</div>
    <div>{status} · {price.sourceType === "ibkr" ? "Abgerufen " : ""}{date} (Berlin)</div>
  </div>;
}

function instrumentLabel(value: string, ticker: string) {
  if (value === "stock" && looksLikeOptionContract(ticker)) return "Option · historische Preiseinheiten";
  return ({ stock: "Aktie", etf: "ETF", option: "Option", warrant: "Optionsschein", knock_out: "Knock-out", cash: "Cash", other: "Sonstiges" } as Record<string, string>)[value] ?? value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00Z`));
}

function priceSourceDescription(price: ReturnType<typeof resolvePositionPrice>) {
  if (!price) return null;
  const date = price.observedAt
    ? new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(price.observedAt))
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
    "manual-contract-price": {
      tone: "border-amber-500/30 bg-amber-500/10 text-amber-100",
      text: "Für diesen Optionskontrakt ist gerade kein aktueller automatischer Kurs verfügbar. Bitte die IBKR-Verbindung prüfen oder den Optionspreis über Bearbeiten pflegen. Ein Aktienkurs wird dafür nicht eingesetzt.",
    },
    updated: {
      tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
      text: "Der verfügbare Kurs wurde gespeichert. Quelle und Kursqualität findest du unter „Kursdetails“.",
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
