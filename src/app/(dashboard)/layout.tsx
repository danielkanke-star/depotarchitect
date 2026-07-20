import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { getCurrentRole } from "@/lib/auth";
import { getOrCreatePortfolio } from "@/lib/portfolio";
import { signOut } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [portfolio, role] = await Promise.all([getOrCreatePortfolio(), getCurrentRole()]);
  return <AppShell profile={portfolio.risk_profile} isAdmin={role === "admin"}>
    <div className="mb-4 flex justify-end"><form action={signOut}><button className="text-xs text-muted hover:text-foreground">Abmelden</button></form></div>
    {children}
  </AppShell>;
}
