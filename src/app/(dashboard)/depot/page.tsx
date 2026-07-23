import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { calculationExplanation, MARGIN_PROVENANCE_LABELS } from "@/lib/calculations/calculation-provenance";
import { calculatePortfolio } from "@/lib/calculations/portfolio-calculations";
import { positionToCalculationInput } from "@/lib/calculations/position-adapter";
import type { CalculationMetric } from "@/lib/calculations/calculation-types";
import type { PortfolioFxRate } from "@/lib/database.types";
import { pct } from "@/lib/format";
import { calculatePortfolioDataQuality, canonicalMarketDataStatus, latestUsableFxRate } from "@/lib/market-data";
import { getPortfolioData } from "@/lib/portfolio";
import { deleteFxRate, deletePosition, saveCashBalance, saveFxRate, savePosition } from "./actions";

export default async function DepotPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; sort?: string; edit?: string; add?: string }> }) {
  const params = await searchParams;
  const { portfolio, settings, categories, positions, cashBalances, fxRates, latestImport } = await getPortfolioData();
  const riskBudget = portfolio.net_liquidity === null || Number(settings.risk_per_trade_pct) <= 0
    ? null
    : Number(portfolio.net_liquidity) * Number(settings.risk_per_trade_pct) / 100;
  const calculation = calculatePortfolio({
    netLiquidity: portfolio.net_liquidity,
    positions: positions.map((position) => positionToCalculationInput(position, portfolio, categories, fxRates, riskBudget)),
  });
  const dataQuality = calculatePortfolioDataQuality({ portfolio, positions, cashBalances, fxRates });
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
    <PageHeader eyebrow="Positionsverwaltung" title="Depot" description="Ausgangsdaten pflegen; Marktwert, Kurs-G&V zum aktuellen FX, Margin und Stopprisiko berechnet DepotArchitect zentral." action={<div className="flex flex-wrap items-center justify-end gap-3">{latestImport && <div className="text-right text-xs text-muted"><div className="text-emerald-300">Quelle: Benutzerdefinierte CSV</div><div>{formatImportDate(latestImport.imported_at)} · {latestImport.inserted_position_count} Teilpositionen</div><Link href="/import" className="text-accent">Importhistorie</Link></div>}<Link href="/depot?add=1" className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-[#062218]">Position hinzufügen</Link></div>} />
    <Card className="mb-4">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-medium">Datenstatus des Depots</h2><p className="mt-1 text-xs text-muted">Demo-, fehlende und veraltete Werte werden nicht als reale aktuelle Daten ausgegeben.</p></div><div className="text-xs text-muted">Ältester realer Kursstand: {dataQuality.oldestPriceAsOf ? formatImportDate(dataQuality.oldestPriceAsOf) : "nicht vorhanden"}</div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QualityFact label="Aktuelle Kurse" value={`${dataQuality.positionsWithRealPrice} von ${dataQuality.securityPositionCount}`} detail={`${dataQuality.stalePriceCount} veraltet · ${dataQuality.demoPriceCount} Demo`} />
        <QualityFact label="Trading-Stopps" value={`${dataQuality.positionsWithStop} von ${dataQuality.securityPositionCount}`} detail="fehlende Stopps bleiben sichtbar" />
        <QualityFact label="FX-Paare" value={`${dataQuality.completeFxPairCount} von ${dataQuality.requiredFxPairCount}`} detail={`${dataQuality.demoFxCount} Demo-Quellen ausgeschlossen`} />
        <QualityFact label="Belastbare Margin" value={`${dataQuality.positionsWithReliableMargin} von ${dataQuality.securityPositionCount}`} detail="Legacy-untrusted ausgeschlossen" />
      </div>
    </Card>
    {showForm && <Card className="mb-4">
      <div className="mb-4 flex items-center justify-between"><div><h2 className="font-medium">{editPosition ? `${editPosition.ticker} bearbeiten` : "Neue Teilposition"}</h2><p className="mt-1 text-xs text-muted">Nur Quelldaten sind editierbar. Ergebniswerte werden beim Speichern neu berechnet.</p></div><Link href="/depot" className="text-xs text-muted">Schließen</Link></div>
      <form action={savePosition} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <input type="hidden" name="id" value={editPosition?.id ?? ""} />
        <label>Ticker<input name="ticker" required defaultValue={editPosition?.ticker ?? ""} /></label>
        <label>Bezeichnung<input name="instrument_name" defaultValue={editPosition?.instrument_name ?? ""} /></label>
        <label>Kategorie<select name="category_id" defaultValue={editPosition?.category_id ?? ""}><option value="">Keine</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>Strategie<input name="strategy" defaultValue={editPosition?.strategy ?? ""} /></label>
        <label>Richtung<select name="direction" defaultValue={editPosition?.direction ?? "long"}><option value="long">Long</option><option value="short">Short</option><option value="long_put">Long Put</option><option value="long_call">Long Call</option><option value="short_put">Short Put</option><option value="short_call">Short Call</option></select></label>
        {editPosition?.instrument_type === "cash"
          ? <label>Instrument<input value="Cash · Legacy (nicht änderbar)" readOnly aria-readonly="true" /><input type="hidden" name="instrument_type" value="cash" /></label>
          : <label>Instrument<select name="instrument_type" defaultValue={editPosition?.instrument_type ?? "stock"}><option value="stock">Aktie</option><option value="etf">ETF</option><option value="option">Option</option><option value="warrant">Optionsschein</option><option value="knock_out">Knock-out</option><option value="other">Sonstiges</option></select></label>}
        <label>Menge<input name="quantity" required inputMode="decimal" defaultValue={editPosition?.quantity ?? 1} /></label>
        <label>Multiplikator<input name="multiplier" required inputMode="decimal" defaultValue={editPosition?.multiplier ?? 1} /></label>
        <label>Einstandskurs<input name="entry_price" required inputMode="decimal" defaultValue={editPosition?.entry_price ?? 0} /></label>
        <label>Aktueller Kurs · Instrumentwährung<input name="current_price_native" inputMode="decimal" defaultValue={editPosition?.current_price_native ?? editPosition?.current_price ?? ""} /></label>
        <label>Kursquelle<input name="current_price_source" defaultValue={editPosition?.current_price_source ?? ""} placeholder="Manuell oder Datenanbieter" /></label>
        <label>Kursstatus<select name="current_price_status" defaultValue={canonicalMarketDataStatus(editPosition?.current_price_status, editPosition?.source_type, (editPosition?.current_price_native ?? editPosition?.current_price) !== null)}>{marketDataStatusOptions()}</select></label>
        <label>Kurszeitpunkt<input type="datetime-local" name="current_price_as_of" defaultValue={toDateTimeLocal(editPosition?.current_price_as_of ?? editPosition?.data_as_of)} /></label>
        <label>Instrumentwährung<input name="instrument_currency" maxLength={3} defaultValue={editPosition?.instrument_currency ?? portfolio.currency} /></label>
        <label>Entry-FX zur Basis<input name="entry_fx_to_base" inputMode="decimal" defaultValue={editPosition?.entry_fx_to_base ?? ""} /></label>
        <label>Aktueller FX zur Basis<input name="current_fx_to_base" inputMode="decimal" defaultValue={editPosition?.current_fx_to_base ?? editPosition?.fx_to_base ?? ((editPosition?.instrument_currency ?? portfolio.currency) === portfolio.currency ? 1 : "")} /></label>
        <label>FX-Quelle<input name="current_fx_source" defaultValue={editPosition?.current_fx_source === "identity" ? "" : editPosition?.current_fx_source ?? ""} placeholder="Manuell oder Datenanbieter" /></label>
        <label>FX-Status<select name="current_fx_status" defaultValue={canonicalMarketDataStatus(editPosition?.current_fx_status, editPosition?.source_type, (editPosition?.current_fx_to_base ?? editPosition?.fx_to_base) !== null)}>{marketDataStatusOptions()}</select></label>
        <label>FX-Zeitpunkt<input type="datetime-local" name="current_fx_as_of" defaultValue={toDateTimeLocal(editPosition?.current_fx_as_of ?? editPosition?.data_as_of)} /></label>
        <label>Trading-Stopp · Instrumentwährung<input name="stop_price_native" inputMode="decimal" defaultValue={editPosition?.stop_price_native ?? editPosition?.stop_price ?? ""} /></label>
        <label>Stopp aktualisiert<input type="datetime-local" name="stop_updated_at" defaultValue={toDateTimeLocal(editPosition?.stop_updated_at)} /></label>
        <label className="sm:col-span-2">Stopp-Kommentar<input name="stop_comment" maxLength={500} defaultValue={editPosition?.stop_comment ?? ""} /></label>
        <label>Marginquote (%)<input name="margin_rate_percent" inputMode="decimal" defaultValue={editPosition?.margin_rate != null ? editPosition.margin_rate * 100 : editPosition?.margin_percent ?? ""} /></label>
        <label>Direktes Margin Requirement<input name="margin_requirement" inputMode="decimal" defaultValue={["manual_direct", "broker"].includes(editPosition?.margin_source ?? "") ? editPosition?.margin_requirement ?? "" : ""} /></label>
        <label>Marginquelle<select name="margin_source" defaultValue={editPosition?.margin_source === "broker" ? "broker" : "manual_direct"}><option value="manual_direct">Manuell bestätigt</option><option value="broker">Broker</option></select></label>
        <label>Margin-Datenstand<input type="datetime-local" name="margin_as_of" defaultValue={toDateTimeLocal(editPosition?.margin_as_of)} /></label>
        <label>Optionsart<select name="option_type" defaultValue={editPosition?.option_type ?? ""}><option value="">Nicht zutreffend</option><option value="call">Call</option><option value="put">Put</option></select></label>
        <label>Ausübungspreis<input name="strike_price" inputMode="decimal" defaultValue={editPosition?.strike_price ?? ""} /></label>
        <label>Verfallsdatum<input type="date" name="expiration_date" defaultValue={editPosition?.expiration_date ?? ""} /></label>
        <label>Sektor<input name="sector" defaultValue={editPosition?.sector ?? ""} /></label>
        <label>Einstiegsdatum<input type="date" name="entry_date" defaultValue={editPosition?.entry_date ?? ""} /></label>
        <label>Status<select name="status" defaultValue={editPosition?.status ?? "active"}><option value="active">Aktiv</option><option value="watch">Beobachten</option><option value="high">Hoch</option><option value="danger">Gefahr</option></select></label>
        <label className="sm:col-span-2">Kommentar<textarea name="notes" rows={3} defaultValue={editPosition?.notes ?? ""} /></label>
        {editCalculation && <div className="sm:col-span-2 xl:col-span-4 grid gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 sm:grid-cols-2 xl:grid-cols-4">
          <CalculatedFact label="Positionswert" metric={editCalculation.positionValueBase} format={(value) => money.format(value)} />
          <CalculatedFact label="Kurs-G&V zum aktuellen FX" metric={editCalculation.unrealizedPnl} format={(value) => money.format(value)} />
          <CalculatedFact label={`Margin · ${MARGIN_PROVENANCE_LABELS[editCalculation.marginRequirement.provenance]}`} metric={editCalculation.marginRequirement} format={(value) => money.format(value)} />
          <CalculatedFact label="Risiko bis Stopp" metric={editCalculation.stopRisk} format={(value) => money.format(value)} />
          <CalculatedFact label="Anteil am Risikobudget" metric={editCalculation.riskToBudget} format={(value) => pct(value * 100)} />
        </div>}
        <div className="sm:col-span-2 xl:col-span-4"><button className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-[#062218]">Ausgangsdaten speichern und neu berechnen</button></div>
      </form>
    </Card>}
    <Card>
      <form className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px_180px_auto]"><input name="q" placeholder="Ticker oder Name suchen" defaultValue={params.q ?? ""} /><select name="category" defaultValue={params.category ?? ""}><option value="">Alle Kategorien</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><select name="sort" defaultValue={params.sort ?? "market"}><option value="market">Berechneter Marktwert</option><option value="ticker">Ticker</option><option value="risk">Berechnetes Risiko</option></select><button className="rounded-xl border border-border px-4 py-2 text-sm">Anwenden</button></form>
      <div className="overflow-x-auto"><table className="w-full min-w-[1420px] text-sm"><thead className="text-left text-xs text-muted"><tr><th className="pb-3">Instrument</th><th>Kategorie / Strategie</th><th>Richtung</th><th>Positionswert</th><th>NetLiq-Anteil</th><th>Kurs-G&V zum aktuellen FX</th><th>Margin</th><th>Stopprisiko</th><th>Risiko / NetLiq</th><th>Risiko / Budget</th><th>Risikoanteil</th><th></th></tr></thead><tbody>{filtered.map((position) => {
        const result = calculatedById.get(position.id);
        if (!result) return null;
        return <tr key={position.id} className="border-t border-border/60 align-top"><td className="py-3"><div className="font-medium">{position.ticker}</div><div className="text-xs text-muted">{position.instrument_name || "–"} · {position.instrument_currency || "Währung fehlt"}</div><div className="mt-1 text-[10px] text-muted">{marketDataLine(position, fxRates, portfolio.currency)}</div>{position.instrument_type === "cash" && <div className="mt-1 text-[10px] uppercase tracking-wide text-amber-300">Legacy-Cash · nicht in Wertpapieraggregaten</div>}</td><td><div>{result.categoryName ?? "Nicht zugeordnet"}</div><div className="text-xs text-muted">{position.strategy ?? "Keine Strategie"}</div></td><td className="text-muted">{position.direction}</td><td><MetricValue metric={result.positionValueBase} format={(value) => money.format(value)} /></td><td><MetricValue metric={result.netLiquidityShare} format={(value) => pct(value * 100)} /></td><td><MetricValue metric={result.unrealizedPnl} format={(value) => money.format(value)} /></td><td><MetricValue metric={result.marginRequirement} format={(value) => money.format(value)} detail={MARGIN_PROVENANCE_LABELS[result.marginRequirement.provenance]} /></td><td><MetricValue metric={result.stopRisk} format={(value) => money.format(value)} /></td><td><MetricValue metric={result.riskToNetLiquidity} format={(value) => pct(value * 100)} /></td><td><MetricValue metric={result.riskToBudget} format={(value) => pct(value * 100)} /></td><td><MetricValue metric={result.riskShareOfCalculableTotal} format={(value) => pct(value * 100)} /></td><td><div className="flex items-center gap-3"><Link href={`/depot?edit=${position.id}`} className="text-xs text-accent">Bearbeiten</Link><form action={deletePosition}><input type="hidden" name="id" value={position.id} /><button className="text-xs text-red-300">Löschen</button></form></div></td></tr>;
      })}</tbody></table></div>
    </Card>
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <Card><h2 className="font-medium">Reale FX-Paare</h2><p className="mt-1 text-xs text-muted">Eine Einheit der Ausgangswährung in {portfolio.currency}. Historische Einträge bleiben nachvollziehbar.</p>
        <form action={saveFxRate} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label>Ausgangswährung<input name="source_currency" maxLength={3} required placeholder="USD" /></label>
          <label>Zielwährung<input value={portfolio.currency} readOnly aria-readonly="true" /></label>
          <label>Wechselkurs<input name="rate" inputMode="decimal" required placeholder="0,8564" /></label>
          <label>Quelle<input name="source_name" required placeholder="Manuell oder Datenanbieter" /></label>
          <label>Quellentyp<select name="source_type" defaultValue="manual"><option value="manual">Manuell</option><option value="broker">Broker</option><option value="market_data_provider">Marktdatenanbieter</option></select></label>
          <label>Status<select name="status" defaultValue="manually_updated">{realMarketDataStatusOptions()}</select></label>
          <label>Datenstand<input type="datetime-local" name="rate_as_of" required /></label>
          <div className="self-end"><button className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-[#062218]">FX-Kurs speichern</button></div>
        </form>
        <div className="mt-4 space-y-2">{fxRates.map((rate) => <div key={rate.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3 text-xs"><div><div className="font-medium">1 {rate.source_currency} = {Number(rate.rate).toLocaleString("de-DE", { maximumFractionDigits: 8 })} {rate.target_currency}</div><div className="text-muted">{rate.source_name} · {marketDataStatusLabel(rate.status)} · {formatImportDate(rate.rate_as_of)}</div></div><form action={deleteFxRate}><input type="hidden" name="id" value={rate.id} /><button className="text-red-300">Löschen</button></form></div>)}</div>
      </Card>
      <Card><h2 className="font-medium">Währungs-Cashbestand</h2><p className="mt-1 text-xs text-muted">Cash bleibt getrennt von Wertpapiermarktwert und NetLiq-Hebel.</p>
        <form action={saveCashBalance} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label>Währung<input name="currency" maxLength={3} required placeholder="USD" /></label>
          <label>Saldo<input name="balance_native" inputMode="decimal" required /></label>
          <label>Saldo-Datenstand<input type="datetime-local" name="balance_as_of" required /></label>
          <label>FX zur Basis<input name="current_fx_to_base" inputMode="decimal" /></label>
          <label>FX-Quelle<input name="fx_source" placeholder="Manuell oder Datenanbieter" /></label>
          <label>FX-Status<select name="fx_status" defaultValue="manually_updated">{realMarketDataStatusOptions()}</select></label>
          <label>FX-Datenstand<input type="datetime-local" name="fx_as_of" /></label>
          <div className="self-end"><button className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-[#062218]">Cashbestand speichern</button></div>
        </form>
        <div className="mt-4 space-y-2">{cashBalances.map((balance) => <div key={balance.id} className="rounded-lg border border-border/70 p-3 text-xs"><div className="font-medium">{Number(balance.balance_native).toLocaleString("de-DE")} {balance.currency}</div><div className="text-muted">Stand {formatImportDate(balance.balance_as_of)} · FX {balance.current_fx_to_base ?? "fehlt"} · {marketDataStatusLabel(balance.fx_status)}</div></div>)}</div>
      </Card>
    </div>
  </>;
}

function QualityFact({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-border/70 bg-background/40 p-3"><div className="text-xs text-muted">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div><div className="mt-1 text-[11px] text-muted">{detail}</div></div>;
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

function marketDataStatusOptions() {
  return <>
    <option value="missing">Fehlt</option><option value="live">Live</option><option value="delayed">Verzögert</option>
    <option value="end_of_day">Tagesende</option><option value="manually_updated">Manuell aktualisiert</option>
    <option value="stale">Veraltet</option><option value="demo">Demo · nicht real</option>
  </>;
}

function realMarketDataStatusOptions() {
  return <><option value="live">Live</option><option value="delayed">Verzögert</option><option value="end_of_day">Tagesende</option><option value="manually_updated">Manuell aktualisiert</option><option value="stale">Veraltet</option></>;
}

function marketDataStatusLabel(status: string | null | undefined) {
  return ({
    live: "Live", delayed: "Verzögert", end_of_day: "Tagesende", manually_updated: "Manuell aktualisiert",
    stale: "Veraltet", missing: "Fehlt", demo: "Demo · nicht real", closing: "Tagesende",
    imported: "Importiert", manual: "Manuell",
  } as Record<string, string>)[status ?? "missing"] ?? "Fehlt";
}

function marketDataLine(
  position: { source_type: string; instrument_currency: string | null; current_price_source: string | null; current_price_status: string | null; current_price_as_of: string | null; current_fx_source: string | null; current_fx_status: string | null; current_fx_as_of: string | null },
  fxRates: PortfolioFxRate[],
  baseCurrency: string,
) {
  const priceTime = position.current_price_as_of ? formatImportDate(position.current_price_as_of) : "Zeit fehlt";
  const priceStatus = canonicalMarketDataStatus(position.current_price_status, position.source_type, Boolean(position.current_price_source));
  const sharedFx = latestUsableFxRate(fxRates, position.instrument_currency ?? baseCurrency, baseCurrency);
  const fxStatus = sharedFx?.status ?? canonicalMarketDataStatus(position.current_fx_status, position.source_type, Boolean(position.current_fx_source));
  const fxSource = sharedFx?.source ?? position.current_fx_source ?? "Quelle fehlt";
  const fxTime = sharedFx?.asOf ? formatImportDate(sharedFx.asOf) : position.current_fx_as_of ? formatImportDate(position.current_fx_as_of) : "Zeit fehlt";
  return `Kurs: ${position.current_price_source ?? "Quelle fehlt"} · ${marketDataStatusLabel(priceStatus)} · ${priceTime} | FX: ${fxSource} · ${marketDataStatusLabel(fxStatus)} · ${fxTime}`;
}
