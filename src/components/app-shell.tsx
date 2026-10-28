"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Gauge, Menu, Settings, ShieldCheck, Table2, UserRoundCog, X } from "lucide-react";
import { useState, type ReactNode } from "react";

const items = [
  { href: "/cockpit", label: "Cockpit", icon: Gauge },
  { href: "/depot", label: "Depot", icon: Table2 },
  { href: "/risiko", label: "Positionsgröße", icon: ShieldCheck },
  { href: "/performance", label: "Statistik", icon: BarChart3 },
  { href: "/einstellungen", label: "Einstellungen", icon: Settings },
  { href: "/konto/datenschutz", label: "Konto & Datenschutz", icon: ShieldCheck },
];

export function AppShell({ children, profile, isAdmin = false, accountAction }: { children: ReactNode; profile: string; isAdmin?: boolean; accountAction?: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navigationItems = isAdmin
    ? [...items, { href: "/admin", label: "Administration", icon: UserRoundCog }]
    : items;

  const links = (mobile=false) => <nav aria-label={mobile?"Mobile Hauptnavigation":"Hauptnavigation"}>{navigationItems.map(({href,label,icon:Icon},index)=><div key={href}>{index===0&&<div className="nav-section">Arbeitsbereich</div>}{index===4&&<div className="nav-section">Verwaltung</div>}<Link href={href} onClick={()=>mobile&&setOpen(false)} aria-current={pathname===href?"page":undefined} className="nav-item"><Icon size={16} strokeWidth={1.6}/>{label}</Link></div>)}</nav>;
  const footer = <div className="sidebar-footer"><div className="profile-caption">Trading-Profil</div><div className="profile-value">{profile}</div>{accountAction}</div>;
  return (
    <div className="app-frame min-h-screen text-foreground">
      <aside className="app-sidebar">
        <Brand />
        {links()}{footer}
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/80 bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
          <Brand />
          <button onClick={() => setOpen(true)} className="rounded-lg border border-border p-2" aria-label="Navigation öffnen"><Menu size={19} /></button>
        </header>
        {open && (
          <div className="fixed inset-0 z-50 bg-black/60 lg:hidden" onClick={() => setOpen(false)}>
            <aside className="flex h-full w-72 flex-col bg-sidebar p-5" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between"><Brand /><button aria-label="Navigation schließen" onClick={() => setOpen(false)}><X size={20} /></button></div>
              {links(true)}{footer}
            </aside>
          </div>
        )}
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}

function Brand() {
  return <Link href="/cockpit" className="app-brand"><span className="brand-mark"><BarChart3 size={16} strokeWidth={1.7}/></span><span>Depot<span className="text-accent">Architect</span></span></Link>;
}
