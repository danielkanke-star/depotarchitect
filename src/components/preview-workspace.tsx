"use client";
import { useState } from "react";
import Decimal from "decimal.js";
import type { OverviewData } from "@/lib/depot-overview";
import { buildOverview } from "@/lib/depot-overview";
import { TRADING_PROFILES, berlinDate } from "@/lib/risk-rules";
import { OverviewPanel } from "./overview-panel";
import { RiskCalculator } from "./risk-calculator";
import { TradeStatistics } from "./trade-statistics";
import { JournalImporter } from "./journal-importer";
import { formatMoney } from "./risk-indicator";
import { Card, PageHeader } from "./ui";

export function PreviewWorkspace({ initial }: { initial: OverviewData }) {
  const [data, setData] = useState(initial), [tab, setTab] = useState("Cockpit"), [closed, setClosed] = useState(false), [notice,setNotice] = useState("");
  const overview = buildOverview(data);
  function sell(form: FormData) {
    const id = String(form.get("id")), p = data.positions.find(p=>p.id===id);
    const q = Number(form.get("quantity")), price = Number(form.get("price"));
    if (!p || !Number.isFinite(q) || q <= 0 || q > p.quantity-p.sold_quantity || !Number.isFinite(price) || price<0) { setNotice("Bitte Menge und Kurs prüfen. Es wurde nichts geändert."); return; }
    const total = new Decimal(p.sold_quantity).plus(q).toNumber();
    const weighted = new Decimal(p.sale_price ?? 0).mul(p.sold_quantity).plus(new Decimal(price).mul(q)).div(total).toNumber();
    setData(d=>({...d, positions:d.positions.map(p=>p.id===id?{...p,sold_quantity:total,sale_price:weighted,sale_date:berlinDate(),status:total===p.quantity?"closed":"active"}:p),
      sales:[...d.sales,{id:crypto.randomUUID(),position_id:id,portfolio_id:p.portfolio_id,user_id:p.user_id,quantity:q,price,sale_date:berlinDate(),fx_to_base:p.current_fx_to_base,fx_source:"synthetic",source:"manual",request_id:crypto.randomUUID(),created_at:new Date().toISOString()}]}));
    setNotice(`${q} ${p.ticker} im Beispiel verkauft. ${p.quantity-total} Stück bleiben offen.`);
  }
  return <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[220px_1fr]">
    <aside className="border-r border-border bg-sidebar p-5"><div className="text-xl font-semibold">Depot<span className="text-accent">Architect</span></div><div className="mt-1 text-xs text-muted">Erster brauchbarer Stand</div><nav aria-label="Vorschau" className="mt-8 flex flex-wrap gap-2 lg:flex-col">{["Cockpit","Depot","Positionsgröße","Statistik","Import"].map(t=><button key={t} onClick={()=>setTab(t)} aria-current={tab===t?"page":undefined} className={`rounded-xl px-3 py-3 text-left text-sm ${tab===t?"border border-border bg-panel":"text-muted hover:text-foreground"}`}>{t}</button>)}</nav><label className="mt-8 block">Trading-Profil<select value={data.portfolio.risk_profile} onChange={e=>setData(d=>({...d,portfolio:{...d.portfolio,risk_profile:e.target.value}}))}>{Object.keys(TRADING_PROFILES).map(p=><option key={p}>{p}</option>)}</select></label><button onClick={()=>{setData(initial);setNotice("Beispiel zurückgesetzt.");}} className="mt-5 text-xs text-muted underline">Beispiel zurücksetzen</button></aside>
    <main className="min-w-0 px-4 py-6 sm:px-7 lg:px-8"><div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-amber-100">Lokale Entwicklungsvorschau mit erfundenen Daten. Änderungen gelten nur bis zum Neuladen. Die Berechnungen und Ansichten stammen aus der Anwendung; Anmeldung, echte Kurse und das Speichern im Depot benötigen die aktive Datenbank. Diese Vorschau ist im Produktionsbetrieb gesperrt.</div>
      <PageHeader eyebrow="DepotArchitect" title={tab} description={tab==="Cockpit"?"Risiko erkennen, Teilpositionen überblicken und gezielt prüfen.":tab==="Positionsgröße"?"Einstieg und Stopp festlegen und die passende Stückzahl berechnen.":tab==="Statistik"?"Realisierte Ergebnisse und Marginrendite vor Kosten.":tab==="Depot"?"Offene Positionen und Verkaufshistorie.":"Bestehende Tabellen vor der Übernahme prüfen."} />
      {notice && <p role="status" className="mb-4 text-sm text-accent">{notice}</p>}
      {tab==="Cockpit" && <OverviewPanel overview={overview} portfolio={data.portfolio} />}
      {tab==="Positionsgröße" && <RiskCalculator initialNetLiquidity={data.portfolio.net_liquidity} initialRiskPct={1.2} existingRisk={overview.calculation.totalCalculableStopRisk.value} riskComplete={overview.calculation.riskIsComplete} profile={data.portfolio.risk_profile} baseCurrency="EUR" demo />}
      {tab==="Statistik" && <TradeStatistics journal={overview.journal} currency="EUR" categoryNames={Object.fromEntries(data.categories.map(c=>[c.id,c.name]))} />}
      {tab==="Import" && <JournalImporter baseCurrency="EUR" available={false} currentCount={0} />}
      {tab==="Depot" && <Card><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="font-medium">{closed?"Abgeschlossene Positionen":"Offene Teilpositionen"}</h2><button className="text-sm text-accent" onClick={()=>setClosed(!closed)}>{closed?"Offene anzeigen":"Geschlossene anzeigen"}</button></div><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="text-xs text-muted"><tr><th>Ticker / Kategorie</th><th>Einstieg</th><th>Offen / Einstieg</th><th>Marktwert EUR</th><th>Stopprisiko EUR</th><th>Stopp</th></tr></thead><tbody>{data.positions.filter(p=>(p.status==="closed")===closed).map(p=>{const r=overview.byId.get(p.id);return <tr key={p.id} className="border-t border-border"><td className="py-4 font-medium">{p.ticker}<span className="mt-1 block text-xs font-normal text-muted">{data.categories.find(c=>c.id===p.category_id)?.name}</span></td><td>{p.entry_date}</td><td>{p.quantity-p.sold_quantity} / {p.quantity}</td><td>{formatMoney(r?.positionValueBase.value,"EUR")}</td><td>{formatMoney(r?.stopRisk.value,"EUR")}</td><td>{closed?p.stop_price_native:<input aria-label={`Stopp ${p.id}`} type="number" step="any" className="max-w-28" value={p.stop_price_native??""} onChange={e=>{const value=e.target.value===""?null:Number(e.target.value);setData(d=>({...d,positions:d.positions.map(old=>old.id===p.id?{...old,stop_price_native:value,stop_price:value,stop_updated_at:new Date().toISOString()}:old)}));}} />}</td></tr>;})}</tbody></table></div>
        {!closed && <form action={sell} className="mt-6 grid gap-3 border-t border-border pt-5 sm:grid-cols-4"><label>Teilposition<select name="id">{overview.active.map(p=><option key={p.id} value={p.id}>{p.ticker} · {p.entry_date} · {p.quantity-p.sold_quantity} offen</option>)}</select></label><label>Verkaufte Menge<input name="quantity" type="number" min="0.000001" step="any" required /></label><label>Verkaufskurs<input name="price" type="number" min="0" step="any" required /></label><button className="self-end rounded-xl border border-accent px-4 py-2 text-accent">Beispielverkauf erfassen</button></form>}
      </Card>}
    </main>
  </div>;
}
