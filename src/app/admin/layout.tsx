import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminMfa } from "@/lib/auth";

export const metadata: Metadata = { title: "Administration", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminMfa();
  return <main className="min-h-screen bg-[radial-gradient(circle_at_80%_0%,#14352a_0,transparent_30%)] px-4 py-8">
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div><Link href="/" className="text-lg font-semibold">Depot<span className="text-accent">Architect</span></Link><p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">Administration · MFA geschützt</p></div>
        <nav className="flex gap-4 text-sm"><Link href="/admin" className="text-accent">Benutzerübersicht</Link><Link href="/cockpit" className="text-muted hover:text-foreground">Zur Anwendung</Link></nav>
      </header>
      {children}
    </div>
  </main>;
}
