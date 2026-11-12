import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { MarketDataHeartbeat } from "@/components/market-data-heartbeat";
import { getCurrentRole, requireUser } from "@/lib/auth";
import { getOrCreatePortfolio } from "@/lib/portfolio";
import { signOut } from "./actions";
import { switchDepot } from "./import/intake-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [portfolio, role] = await Promise.all([getOrCreatePortfolio(), getCurrentRole()]);
  const { supabase, userId } = await requireUser();
  const { data: portfolios } = await supabase.from("portfolios").select("id,name,currency").eq("user_id", userId).order("created_at");
  const depotPicker = <form action={switchDepot} className="flex items-end gap-2">
    <label className="min-w-0 flex-1">Aktives Depot<select key={portfolio.id} name="portfolio" defaultValue={portfolio.id}>
      {(portfolios ?? [portfolio]).map(depot => <option value={depot.id} key={depot.id}>{depot.name} · {depot.currency}</option>)}
    </select></label>
    <button className="rounded-lg border border-border px-2.5 py-2 text-xs">Wechseln</button>
  </form>;
  return <AppShell depotPicker={depotPicker} profile={portfolio.risk_profile} isAdmin={role === "admin"} accountAction={<form action={signOut}><button>Abmelden</button></form>}>
    <MarketDataHeartbeat key={portfolio.id} />
    {children}
  </AppShell>;
}
