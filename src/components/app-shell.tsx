"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FileUp, Gauge, Menu, Settings, ShieldCheck, Table2, UserRoundCog, X } from "lucide-react";
import { useState } from "react";

const items = [
  { href: "/cockpit", label: "Cockpit", icon: Gauge },
  { href: "/depot", label: "Depot", icon: Table2 },
  { href: "/import", label: "Datenimport", icon: FileUp },
  { href: "/risiko", label: "Risiko", icon: ShieldCheck },
  { href: "/performance", label: "Performance", icon: BarChart3 },
  { href: "/einstellungen", label: "Einstellungen", icon: Settings },
  { href: "/konto/datenschutz", label: "Konto & Datenschutz", icon: ShieldCheck },
];

export function AppShell({ children, profile, isAdmin = false }: { children: React.ReactNode; profile: string; isAdmin?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navigationItems = isAdmin
    ? [...items, { href: "/admin", label: "Administration", icon: UserRoundCog }]
    : items;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_75%_0%,#14352a_0,transparent_30%)] bg-background text-foreground lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden min-h-screen border-r border-border/80 bg-sidebar/80 p-5 lg:block">
        <Brand />
        <nav className="mt-10 space-y-1.5">
          {navigationItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${pathname === href ? "border border-border bg-panel text-foreground" : "text-muted hover:bg-panel/50 hover:text-foreground"}`}>
              <Icon size={17} />{label}
            </Link>
          ))}
        </nav>
        <div className="mt-10 rounded-xl border border-border bg-panel/60 p-3 text-xs text-muted">
          <div className="mb-1 text-foreground">Aktives Profil</div>
          {profile}
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/80 bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
          <Brand />
          <button onClick={() => setOpen(true)} className="rounded-lg border border-border p-2" aria-label="Navigation öffnen"><Menu size={19} /></button>
        </header>
        {open && (
          <div className="fixed inset-0 z-50 bg-black/60 lg:hidden" onClick={() => setOpen(false)}>
            <aside className="h-full w-72 bg-sidebar p-5" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between"><Brand /><button onClick={() => setOpen(false)}><X size={20} /></button></div>
              <nav className="mt-8 space-y-2">
                {navigationItems.map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${pathname === href ? "bg-panel text-foreground" : "text-muted"}`}><Icon size={17} />{label}</Link>
                ))}
              </nav>
            </aside>
          </div>
        )}
        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

function Brand() {
  return <Link href="/cockpit" className="text-lg font-semibold tracking-tight">Depot<span className="text-accent">Architect</span></Link>;
}
