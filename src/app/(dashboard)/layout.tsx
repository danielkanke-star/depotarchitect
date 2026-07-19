import { AppShell } from "@/components/app-shell";
import { getOrCreatePortfolio } from "@/lib/portfolio";
import { signOut } from "./actions";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const portfolio = await getOrCreatePortfolio();
  return <AppShell profile={portfolio.risk_profile}>
    <div className="mb-4 flex justify-end"><form action={signOut}><button className="text-xs text-muted hover:text-foreground">Abmelden</button></form></div>
    {children}
  </AppShell>;
}
