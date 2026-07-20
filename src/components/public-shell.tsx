import Link from "next/link";

export function PublicHeader() {
  return (
    <header className="border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Depot<span className="text-accent">Architect</span>
        </Link>
        <Link
          href="/login"
          className="rounded-xl border border-border px-4 py-2 text-sm text-foreground transition hover:border-accent/60"
        >
          Anmelden
        </Link>
      </div>
    </header>
  );
}

export function PublicFooter() {
  const links = [
    ["Impressum", "/impressum"],
    ["Datenschutz", "/datenschutz"],
    ["Nutzungsbedingungen", "/nutzungsbedingungen"],
    ["Risikohinweis", "/risikohinweis"],
    ["Anmeldung", "/login"],
  ] as const;

  return (
    <footer className="border-t border-border/70 bg-sidebar/60">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 text-xs text-muted sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <p>DepotArchitect – Analyse- und Risikomanagementwerkzeug, keine Anlageberatung.</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-3" aria-label="Rechtliche Navigation">
          {links.map(([label, href]) => (
            <Link key={href} href={href} className="hover:text-foreground">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

export function PublicPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_75%_0%,#14352a_0,transparent_30%)]">
      <PublicHeader />
      {children}
      <PublicFooter />
    </div>
  );
}
