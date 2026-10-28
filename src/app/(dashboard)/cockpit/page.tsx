import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { OverviewPanel } from "@/components/overview-panel";
import { getPortfolioData } from "@/lib/portfolio";
import { buildOverview } from "@/lib/depot-overview";
import { formatMoney } from "@/components/risk-indicator";
import { calculateCashPortfolio } from "@/lib/calculations/cash-calculations";
import { latestUsableFxRate, canonicalMarketDataStatus } from "@/lib/market-data";

export default async function CockpitPage() {
  const data = await getPortfolioData();
  const overview = buildOverview(data);
  const cash=calculateCashPortfolio(data.cashBalances.map(b=>({id:b.id,currency:b.currency,baseCurrency:data.portfolio.currency,balanceNative:b.balance_native,
    currentFxToBase:latestUsableFxRate(data.fxRates,b.currency,data.portfolio.currency)?.rate??b.current_fx_to_base,
    currentFxStatus:latestUsableFxRate(data.fxRates,b.currency,data.portfolio.currency)?.status??canonicalMarketDataStatus(b.fx_status,b.source_type,b.current_fx_to_base!==null)})));
  return <><PageHeader eyebrow="Dein Depot im Überblick" title="Cockpit" description="Bestand, Stopprisiko und Konzentrationen – mit deinem Trading-Profil bewertet." action={<Link className="rounded-xl bg-accent px-4 py-2 text-[#062218]" href="/risiko">Neue Position planen</Link>} />
    {!data.journalAvailable && <p role="status" className="mb-4 rounded-xl border border-amber-500 p-4 text-sm text-amber-200">Die Journalmigration fehlt in dieser Umgebung. Verkaufsfunktionen und historische Auswertungen sind noch nicht freigegeben.</p>}
    <OverviewPanel overview={overview} portfolio={data.portfolio} />
    {data.cashBalances.length>0&&<Card className="mt-4"><h2 className="font-medium">Cashbestände</h2><div className="mt-3 flex flex-wrap gap-6">{data.cashBalances.map(balance => <div key={balance.id}><div className="text-xs text-muted">{balance.currency}</div><div className="mt-1 tabular-nums">{formatMoney(Number(balance.balance_native), balance.currency)}</div></div>)}</div><p className="mt-3 text-sm">Gesamt {data.portfolio.currency}: {formatMoney(cash.totalCashBase.value,data.portfolio.currency)}{cash.totalCashBase.status === "incomplete" ? " · Teilsumme" : ""}</p></Card>}
  </>;
}
