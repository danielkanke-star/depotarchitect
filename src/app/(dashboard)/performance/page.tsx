import { PageHeader } from "@/components/ui";
import { TradeStatistics } from "@/components/trade-statistics";
import { getPortfolioData } from "@/lib/portfolio";
import { buildOverview } from "@/lib/depot-overview";

export default async function PerformancePage() {
  const data = await getPortfolioData();
  const overview = buildOverview(data);
  const unresolvedLegacy = data.positions.filter(p=>p.status === "closed" && Number(p.sold_quantity) < Number(p.quantity)).length;
  return <><PageHeader eyebrow="Deine Handelshistorie" title="Auswertung" description="Marginrendite vor Kosten auf Grundlage der beim Einstieg festgehaltenen Margin." />
    {!data.journalAvailable && <p role="status" className="mb-4 rounded-xl border border-amber-500 p-4 text-sm text-amber-200">Die Journalmigration fehlt. Vorhandene Verkaufsreferenzen bleiben sichtbar; historische FX werden nicht durch heutige Kurse ersetzt.</p>}
    {unresolvedLegacy > 0 && <p role="status" className="mb-4 rounded-xl border border-amber-500/40 p-4 text-sm text-amber-200">{unresolvedLegacy} ältere geschlossene Positionen haben keine vollständigen Verkaufsangaben. Sie werden nicht als belegte Abschlüsse gezählt. Die Angaben können im Depot unter „Geschlossen“ im Verkaufsjournal ergänzt werden.</p>}
    <TradeStatistics journal={overview.journal} currency={data.portfolio.currency} categoryNames={Object.fromEntries(data.categories.map(c => [c.id,c.name]))} />
  </>;
}
