import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Badge, Card, PageHeader } from "@/components/ui";
import { eur, pct } from "@/lib/format";
import { getPortfolioData } from "@/lib/portfolio";

export default async function CockpitPage() {
  const { portfolio, settings, categories, positions, latestImport } = await getPortfolioData();
  const marketValue = positions.reduce((sum, position) => sum + Number(position.market_value), 0);
  const leverage = portfolio.net_liquidity ? marketValue / Number(portfolio.net_liquidity) : null;
  const incompletePositions = positions.filter((position) => position.risk_amount === null || position.margin_requirement === null).length;
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
  const top = positions.slice(0, 6);

  return <>
    <PageHeader eyebrow="Portfolio-Cockpit" title="DepotArchitect" description="Risiko und Depot auf einen Blick – mit klaren Kennzahlen, Warnungen und direktem Zugriff auf die Positionsdetails." action={latestImport ? <div className="text-right"><Badge tone="good">CSV-Import</Badge><div className="mt-1 text-xs text-muted">{formatImportDate(latestImport.imported_at)} · {latestImport.inserted_position_count} Positionen</div><Link href="/import" className="text-xs text-accent">Importhistorie</Link></div> : <Badge>Beispieldaten</Badge>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi label="Nettoliquidität" value={portfolio.net_liquidity === null ? "Daten fehlen" : eur.format(Number(portfolio.net_liquidity))} note={portfolio.net_liquidity === null ? "Nicht im CSV-Snapshot enthalten" : "Kapitalbasis"} />
      <Kpi label="Hebel auf Nettoliquidität" value={leverage === null ? "nicht berechenbar" : `${leverage.toFixed(2).replace(".", ",")}×`} note={`Marktwert ${eur.format(marketValue)}`} />
      <Kpi label="Margin-Auslastung" value={portfolio.margin_used_pct === null ? "nicht berechenbar" : pct(Number(portfolio.margin_used_pct))} note={portfolio.margin_used_pct === null ? `${incompletePositions} unvollständige Positionen` : `Zielgrenze ${pct(Number(settings.max_margin_pct), 0)}`} tone="warn" />
      <Kpi label="Risiko-Budgetauslastung" value={portfolio.risk_budget_used_pct === null ? "nicht berechenbar" : pct(Number(portfolio.risk_budget_used_pct), 0)} note={portfolio.risk_budget_used_pct === null ? "Komplexe Berechnung folgt in Meilenstein 2B" : `${pct(Number(portfolio.risk_budget_used_pct) - 100, 0)} über Budget`} tone="danger" />
    </div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[.9fr_1.6fr]">
      <Card><h2 className="mb-4 font-medium">Handlungsbedarf</h2><div className="space-y-3">
        {portfolio.risk_budget_used_pct === null ? <Alert icon={<AlertTriangle size={17} />} title="Risiko-Budget nicht berechenbar" text="Für die vollständige Berechnung fehlen Daten; fehlende Werte werden nicht als null vorgetäuscht." tone="warn" /> : <Alert icon={<AlertTriangle size={17} />} title="Risiko-Budget überschritten" text="Das Gesamtrisiko liegt über der festgelegten Zielgröße." tone="danger" />}
        {portfolio.margin_used_pct === null ? <Alert icon={<AlertTriangle size={17} />} title="Margin-Auslastung nicht berechenbar" text={`${incompletePositions} Positionen enthalten noch keine vollständigen Risiko- oder Marginangaben.`} tone="warn" /> : <Alert icon={<AlertTriangle size={17} />} title="Margin nahe Zielgrenze" text={`${pct(Number(settings.max_margin_pct) - Number(portfolio.margin_used_pct))} Puffer bis zum Limit.`} tone="warn" />}
        <Alert icon={<CheckCircle2 size={17} />} title="Depotstruktur erkannt" text={`${positions.length} Positionen in ${categories.length} Kategorien.`} tone="good" />
      </div></Card>
      <Card><div className="mb-4 flex items-center justify-between"><h2 className="font-medium">Kompakte Depotübersicht</h2><Link href="/depot" className="flex items-center gap-1 text-xs text-accent">Alle Positionen <ArrowRight size={14} /></Link></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="text-left text-xs text-muted"><tr><th className="pb-3">Ticker</th><th>Kategorie</th><th>Marktwert</th><th>NetLiq-Anteil</th><th>Status</th></tr></thead><tbody>{top.map((position) => <tr key={position.id} className="border-t border-border/60"><td className="py-3 font-medium">{position.ticker}</td><td className="text-muted">{position.category_id ? categoryMap.get(position.category_id) : "–"}</td><td>{eur.format(Number(position.market_value))}</td><td>{pct(Number(position.market_value) / Number(portfolio.net_liquidity) * 100)}</td><td><Badge tone={position.status === "high" ? "warn" : position.status === "danger" ? "danger" : "good"}>{position.status}</Badge></td></tr>)}</tbody></table></div>
      </Card>
    </div>
  </>;
}

function Kpi({ label, value, note, tone = "normal" }: { label: string; value: string; note: string; tone?: "normal" | "warn" | "danger" }) {
  return <Card><div className="text-xs text-muted">{label}</div><div className={`mt-2 text-2xl font-semibold tracking-tight sm:text-3xl ${tone === "warn" ? "text-amber-300" : tone === "danger" ? "text-red-300" : ""}`}>{value}</div><div className="mt-2 text-[11px] text-muted/80">{note}</div></Card>;
}
function Alert({ icon, title, text, tone }: { icon: React.ReactNode; title: string; text: string; tone: "good" | "warn" | "danger" }) {
  const toneClass = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : "text-red-300";
  return <div className="flex gap-3 rounded-xl border border-border/70 bg-background/40 p-3"><div className={toneClass}>{icon}</div><div><div className="text-sm font-medium">{title}</div><div className="mt-1 text-xs text-muted">{text}</div></div></div>;
}

function formatImportDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
