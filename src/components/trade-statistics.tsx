"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Card, MetricCard } from "./ui";
import { InfoTip } from "./info-tip";
import { formatMoney, formatRatio } from "./risk-indicator";
import type { calculateJournal } from "@/lib/journal";

const date=(v:string|null)=>v?new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(v+"T12:00:00Z")):"—";
export function TradeStatistics({journal,currency,categoryNames={}}:{journal:ReturnType<typeof calculateJournal>;currency:string;categoryNames?:Record<string,string>}) {
  const [query,setQuery]=useState(""),[status,setStatus]=useState("all"),[sort,setSort]=useState("recent"),[page,setPage]=useState(0);
  const all=journal.trades.filter(t=>t.closed||t.hasSales);
  const filtered=all.filter(t=>(!query||t.ticker.toLowerCase().includes(query.toLowerCase())||(categoryNames[t.categoryId??""]??t.categoryName??"").toLowerCase().includes(query.toLowerCase()))
    &&(status==="all"||status==="closed"&&t.closed||status==="partial"&&!t.closed));
  filtered.sort((a,b)=>sort==="profit"?(b.pnl??-Infinity)-(a.pnl??-Infinity):sort==="loss"?(a.pnl??Infinity)-(b.pnl??Infinity):sort==="return"?(b.marginReturn??-Infinity)-(a.marginReturn??-Infinity):(b.closeDate??b.entryDate??"").localeCompare(a.closeDate??a.entryDate??""));
  const pages=Math.max(1,Math.ceil(filtered.length/25)),current=Math.min(page,pages-1),visible=filtered.slice(current*25,(current+1)*25);
  const sourceHelp="Historische Ausführungsdaten haben Vorrang. Ergänzend werden die belegten Angaben deiner Tabelle als feste Referenz verwendet. Deren Wechselkurs und Marginquote gelten für den übernommenen Tabellenstand und sind keine historischen IBKR-Marginbeträge. Spätere Kurs- oder Marginänderungen verändern diese Referenz nicht. Gebühren, Finanzierung und Steuern sind nicht enthalten.";
  if(!all.length)return <Card><h2 className="font-medium">Dein Handelsjournal beginnt mit dem ersten Verkauf.</h2><p className="mt-2 text-sm text-muted">Teil- und Schlussverkäufe aus dem Depot erscheinen anschließend hier.</p></Card>;
  return <div className="space-y-5">
    <div className="metric-grid">
      <MetricCard label="Realisierter Gewinn / Verlust" value={formatMoney(journal.realized,currency)} tone={journal.realized>=0?"positive-number":"negative-number"} help={sourceHelp} note={journal.realizedComplete?"Alle erfassten Verkäufe · vor Kosten":"Erfasste Ergebnisse · Quellenprüfung offen"}/>
      <MetricCard label="Marginrendite" value={formatRatio(journal.marginReturn)} help={"Summe Ergebnis geteilt durch Summe der festgehaltenen Marginreferenzen. Zähler und Nenner enthalten dieselben abgeschlossenen Trades. "+sourceHelp} note={journal.marginCoveredCount+" abgeschlossene Trades mit Marginreferenz"}/>
      <MetricCard label="Trefferquote" value={formatRatio(journal.hitRate)} help="Gewinntrades geteilt durch alle bewerteten abgeschlossenen Trades. Nullergebnisse zählen im Nenner. Teilverkäufe zählen erst nach vollständigem Abschluss der Gruppe." note={<><span>{journal.wins} Gewinne <span className="mx-1 opacity-40">/</span> {journal.losses} Verluste</span><div className="mt-2 flex h-1 overflow-hidden rounded-full bg-border"><span className="bg-[#87b89b]" style={{width:(journal.hitRate??0)*100+"%"}}/><span className="flex-1 bg-[#bd7d75]"/></div></>}/>
      <MetricCard label="Abgeschlossene Trades" value={journal.closedCount} help="Gleiches Wertpapier, gleiche Richtung, Kategorie und Einstiegstag bilden einen Trade. Andere Kategorien oder Einstiegstage zählen separat." note={all.filter(t=>!t.closed).length+" Tradegruppen mit Restposition"}/>
    </div>
    <div className="flex flex-wrap items-center gap-x-7 gap-y-3 rounded-xl border border-border px-5 py-4">
      {journal.averageWin!==null&&<SmallMetric label="Ø Gewinn" value={formatMoney(journal.averageWin,currency)} tone="positive-number"/>}
      {journal.averageLoss!==null&&<SmallMetric label="Ø Verlust" value={formatMoney(journal.averageLoss,currency)} tone="negative-number"/>}
      {journal.averageDays!==null&&<SmallMetric label="Ø Haltedauer" value={journal.averageDays.toLocaleString("de-DE",{maximumFractionDigits:1})+" Tage"} help={journal.datedClosedCount+" Abschlüsse mit belegtem Verkaufstag; Einstieg bis letztem Verkauf."}/>}
      {journal.rollingComplete&&<SmallMetric label="Realisiert · letzte 12 Monate" value={formatMoney(journal.rollingRealized,currency)} help={date(journal.cutoff)+" bis "+date(journal.today)+". Keine annualisierte Depotperformance."}/>}
    </div>
    <Card>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><h2 className="font-medium">Handelsjournal</h2><InfoTip label="Datenbasis">{sourceHelp}{journal.referenceAsOf&&<p className="mt-2">Tabellenstand: {new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(journal.referenceAsOf))}.</p>}</InfoTip></div><span className="compact-note">{all.length} Tradegruppen{journal.referenceCount>0?" · Tabellenreferenzen ergänzt":""}</span></div>
      <div className="table-toolbar"><div className="relative min-w-[200px] flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-3 text-muted"/><input aria-label="Trades suchen" placeholder="Ticker oder Kategorie suchen" className="pl-9" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></div>
        <select aria-label="Trade-Status" value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="all">Alle Verkäufe</option><option value="closed">Abgeschlossen</option><option value="partial">Teilverkauft</option></select>
        <select aria-label="Trades sortieren" value={sort} onChange={e=>{setSort(e.target.value);setPage(0);}}><option value="recent">Neueste zuerst</option><option value="profit">Höchster Gewinn</option><option value="loss">Größter Verlust</option><option value="return">Höchste Marginrendite</option></select>
      </div>
      <div className="overflow-x-auto"><table className="financial-table min-w-[780px]"><thead><tr><th>Trade</th><th>Zeitraum</th><th className="number">Ergebnis {currency}</th><th className="number">Marginbasis {currency}</th><th className="number">Marginrendite</th><th className="number">Haltedauer</th></tr></thead>
        <tbody>{visible.map(t=><tr key={t.key} className="data-row"><td><strong className="font-semibold">{t.ticker}</strong><div className="secondary">{categoryNames[t.categoryId??""]??t.categoryName??"Ohne Kategorie"}{!t.closed&&<span className="ml-2 text-amber-200">Teilverkauft</span>}</div></td>
          <td className="text-xs"><div>{date(t.entryDate)}</div><div className="secondary">{t.closeDate?"bis "+date(t.closeDate):t.closed?<span className="inline-flex items-center gap-1">Verkaufstag offen <InfoTip label="Verkaufstag">Die Quelle führt den Eintrag als verkauft. Ein belegter Verkaufstag fehlt. Er wird keinem Zwölfmonatszeitraum zugeordnet; eine Haltedauer wird dafür nicht erfunden.</InfoTip></span>:"Restposition offen"}</div></td>
          <td className={"number font-medium "+(t.pnl!==null&&t.pnl>=0?"positive-number":"negative-number")}>{formatMoney(t.pnl,currency)}</td>
          <td className="number">{formatMoney(t.margin,currency)}</td><td className="number font-medium">{t.closed?formatRatio(t.marginReturn):<span className="text-xs text-muted">nach Abschluss</span>}</td><td className="number text-muted">{t.days!==null?t.days+(t.closed?" Tage":" Tage bisher"):"—"}</td></tr>)}</tbody></table></div>
      {!visible.length&&<p className="py-10 text-center text-sm text-muted">Keine Trades für diese Auswahl.</p>}
      <div className="table-pagination"><span>{filtered.length?current*25+1:0}–{Math.min((current+1)*25,filtered.length)} von {filtered.length}</span><div className="flex items-center gap-3"><button aria-label="Vorherige Trades" disabled={current===0} onClick={()=>setPage(current-1)}><ChevronLeft size={15} className="mx-auto"/></button><span>{current+1} / {pages}</span><button aria-label="Nächste Trades" disabled={current>=pages-1} onClick={()=>setPage(current+1)}><ChevronRight size={15} className="mx-auto"/></button></div></div>
      {(journal.undatedSalesCount>0||journal.incompleteClosedCount>0)&&<details className="mt-4 border-t border-border pt-4 text-xs text-muted"><summary className="cursor-pointer">Quellenprüfung · {journal.undatedSalesCount} {journal.undatedSalesCount===1?"Verkaufstag offen":"Verkaufstage offen"}{journal.incompleteClosedCount?" · "+journal.incompleteClosedCount+" Ergebnisse offen":""}</summary><p className="mt-2 leading-6">Die belegten Ergebnisangaben bleiben erhalten. Für Einträge ohne Verkaufstag gibt es keine zeitliche Zuordnung und keine erfundene Haltedauer.</p></details>}
      {all.some(t=>t.annualized!==null)&&<details className="mt-4 border-t border-border pt-4 text-xs text-muted"><summary className="cursor-pointer">Rechnerische p.a.-Hochrechnung</summary><div className="mt-3 flex items-center gap-2">Optionaler Vergleich <InfoTip label="p.a.-Hochrechnung">(1 + Marginrendite) hoch (365 / Haltedauer) minus 1. Nur bei einem Verkaufstag und positiver Haltedauer. Keine gemessene Depotjahresrendite; kurze gehebelte Trades können extreme Werte ergeben.</InfoTip></div><div className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">{visible.filter(t=>t.annualized!==null).map(t=><div key={t.key} className="flex justify-between gap-3"><span>{t.ticker}</span><span className="tabular-nums">{Math.abs(t.annualized!)>1000?(t.annualized!*100).toExponential(2)+" %":formatRatio(t.annualized)}</span></div>)}</div></details>}
    </Card>
  </div>;
}
function SmallMetric({label,value,tone="",help}:{label:string;value:string;tone?:string;help?:string}) {
  return <div className="min-w-[130px]"><div className="flex items-center gap-1.5 text-[11px] text-muted">{label}{help&&<InfoTip label={label}>{help}</InfoTip>}</div><div className={"mt-1 text-sm font-medium tabular-nums "+tone}>{value}</div></div>;
}
