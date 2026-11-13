import { AccountBalancesPanel } from "@/components/account-balances-panel";
import { IntakeChoices } from "@/components/depot-intake";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { OverviewPanel } from "@/components/overview-panel";
import { getOrCreatePortfolio, getPortfolioData } from "@/lib/portfolio";
import { buildOverview } from "@/lib/depot-overview";
import { createClient } from "@/lib/supabase/server";

async function getAccountBalances() {
  const [supabase, portfolio] = await Promise.all([createClient(), getOrCreatePortfolio()]);
  return supabase.from("depot_account_balances").select("*").eq("portfolio_id", portfolio.id).order("currency");
}

export default async function CockpitPage() {
  const [data, accountBalances] = await Promise.all([getPortfolioData(), getAccountBalances()]);
  const balances = accountBalances.data ?? [];
  const balancesPanel = <AccountBalancesPanel portfolio={data.portfolio} balances={balances} legacyCash={data.cashBalances} unavailable={Boolean(accountBalances.error)} />;
  const setup = !data.portfolio.risk_profile_configured && <Link className="mb-4 inline-flex rounded-lg border border-accent/40 px-4 py-2.5 text-sm text-accent"
    href="/einstellungen#trading-profil">Trading-Profil einrichten</Link>;
  if (!data.positions.length && !data.cashBalances.length && !balances.length && !data.capitalMovements.length && data.portfolio.net_liquidity === null) {
    return <><PageHeader title={data.portfolio.name} action={<Link href="/import" className="text-sm text-accent">Daten hinzufügen</Link>} />
      {balancesPanel}
      <div className="mb-6"><p className="text-xl font-medium">Wie möchtest du starten?</p></div>
      {setup}
      <IntakeChoices />
    </>;
  }
  const overview = buildOverview(data);
  return <><PageHeader eyebrow="Dein Depot im Überblick" title="Cockpit" description="Bestand, Stopprisiko und Konzentrationen – mit deinem Trading-Profil bewertet." action={<Link className="rounded-xl bg-accent px-4 py-2 text-[#062218]" href="/risiko">Neue Position planen</Link>} />
    {!data.journalAvailable && <p role="status" className="mb-4 rounded-xl border border-amber-500 p-4 text-sm text-amber-200">Die Journalmigration fehlt in dieser Umgebung. Verkaufsfunktionen und historische Auswertungen sind noch nicht freigegeben.</p>}
    {setup}
    {balancesPanel}
    <OverviewPanel overview={overview} portfolio={data.portfolio} />
  </>;
}
