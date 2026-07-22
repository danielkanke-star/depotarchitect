import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { eur, pct } from "@/lib/format";
import { getPortfolioData } from "@/lib/portfolio";
import { deletePosition, savePosition } from "./actions";

export default async function DepotPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; sort?: string; edit?: string; add?: string }> }) {
  const params = await searchParams;
  const { portfolio, categories, positions, latestImport } = await getPortfolioData();
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
  const query = (params.q ?? "").toLowerCase();
  let filtered = positions.filter((position) => (!query || position.ticker.toLowerCase().includes(query) || position.instrument_name?.toLowerCase().includes(query)) && (!params.category || position.category_id === params.category));
  filtered = [...filtered].sort((a, b) => params.sort === "ticker" ? a.ticker.localeCompare(b.ticker) : params.sort === "risk" ? Number(b.risk_amount) - Number(a.risk_amount) : Number(b.market_value) - Number(a.market_value));
  const editPosition = positions.find((position) => position.id === params.edit);
  const showForm = params.add === "1" || Boolean(editPosition);

  return <>
    <PageHeader eyebrow="Positionsverwaltung" title="Depot" description="Positionen suchen, filtern, bearbeiten und dauerhaft in Supabase speichern." action={<div className="flex flex-wrap items-center justify-end gap-3">{latestImport && <div className="text-right text-xs text-muted"><div className="text-emerald-300">Quelle: Benutzerdefinierte CSV</div><div>{formatImportDate(latestImport.imported_at)} · {latestImport.inserted_position_count} Positionen</div><Link href="/import" className="text-accent">Importhistorie</Link></div>}<Link href="/depot?add=1" className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-[#062218]">Position hinzufügen</Link></div>} />
    {showForm && <Card className="mb-4"><div className="mb-4 flex items-center justify-between"><h2 className="font-medium">{editPosition ? `${editPosition.ticker} bearbeiten` : "Neue Position"}</h2><Link href="/depot" className="text-xs text-muted">Schließen</Link></div><form action={savePosition} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <input type="hidden" name="id" value={editPosition?.id ?? ""} />
      <label>Ticker<input name="ticker" required defaultValue={editPosition?.ticker ?? ""} /></label>
      <label>Bezeichnung<input name="instrument_name" defaultValue={editPosition?.instrument_name ?? ""} /></label>
      <label>Kategorie<select name="category_id" defaultValue={editPosition?.category_id ?? ""}><option value="">Keine</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label>Richtung<select name="direction" defaultValue={editPosition?.direction ?? "long"}><option value="long">Long</option><option value="short">Short</option><option value="long_put">Long Put</option><option value="long_call">Long Call</option></select></label>
      <label>Instrument<select name="instrument_type" defaultValue={editPosition?.instrument_type ?? "stock"}><option value="stock">Aktie</option><option value="etf">ETF</option><option value="option">Option</option><option value="other">Sonstiges</option></select></label>
      <label>Menge<input name="quantity" inputMode="decimal" defaultValue={editPosition?.quantity ?? 0} /></label>
      <label>Einstandskurs<input name="entry_price" inputMode="decimal" defaultValue={editPosition?.entry_price ?? 0} /></label>
      <label>Trading-Stop<input name="stop_price" inputMode="decimal" defaultValue={editPosition?.stop_price ?? ""} /></label>
      <label>Marktwert<input name="market_value" inputMode="decimal" defaultValue={editPosition?.market_value ?? 0} /></label>
      <label>Risiko bis Stop<input name="risk_amount" inputMode="decimal" defaultValue={editPosition?.risk_amount ?? 0} /></label>
      <label>Sektor<input name="sector" defaultValue={editPosition?.sector ?? ""} /></label>
      <label>Status<select name="status" defaultValue={editPosition?.status ?? "active"}><option value="active">OK</option><option value="watch">Watch</option><option value="high">Hoch</option><option value="danger">Gefahr</option></select></label>
      <div className="sm:col-span-2 xl:col-span-4"><button className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-[#062218]">Speichern</button></div>
    </form></Card>}
    <Card><form className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px_180px_auto]"><input name="q" placeholder="Ticker oder Name suchen" defaultValue={params.q ?? ""} /><select name="category" defaultValue={params.category ?? ""}><option value="">Alle Kategorien</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><select name="sort" defaultValue={params.sort ?? "market"}><option value="market">Marktwert</option><option value="ticker">Ticker</option><option value="risk">Risiko</option></select><button className="rounded-xl border border-border px-4 py-2 text-sm">Anwenden</button></form>
      <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="text-left text-xs text-muted"><tr><th className="pb-3">Ticker</th><th>Kategorie</th><th>Richtung</th><th>Marktwert</th><th>NetLiq</th><th>Risiko</th><th>Sektor</th><th>Status</th><th></th></tr></thead><tbody>{filtered.map((position) => <tr key={position.id} className="border-t border-border/60"><td className="py-3"><div className="font-medium">{position.ticker}</div><div className="text-xs text-muted">{position.instrument_name}</div></td><td>{position.category_id ? categoryMap.get(position.category_id) : "–"}</td><td className="text-muted">{position.direction}</td><td>{eur.format(Number(position.market_value))}</td><td>{portfolio.net_liquidity === null ? <span className="text-muted">Daten fehlen</span> : pct(Number(position.market_value) / Number(portfolio.net_liquidity) * 100)}</td><td>{position.risk_amount === null ? <span className="text-muted">Daten fehlen</span> : eur.format(Number(position.risk_amount))}</td><td className="text-muted">{position.sector ?? "–"}</td><td><Badge tone={position.status === "danger" ? "danger" : position.status === "high" || position.status === "watch" ? "warn" : "good"}>{position.status}</Badge></td><td><div className="flex items-center gap-3"><Link href={`/depot?edit=${position.id}`} className="text-xs text-accent">Bearbeiten</Link><form action={deletePosition}><input type="hidden" name="id" value={position.id} /><button className="text-xs text-red-300">Löschen</button></form></div></td></tr>)}</tbody></table></div>
    </Card>
  </>;
}

function formatImportDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
