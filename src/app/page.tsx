import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Gauge,
  Layers3,
  LockKeyhole,
  ShieldCheck,
  Target,
} from "lucide-react";
import { PublicPage } from "@/components/public-shell";
import { getRegistrationConfig } from "@/lib/config/registration";

const features = [
  [Layers3, "Depotübersicht", "Struktur, Kategorien und neutrale Kennzahlen auf einen Blick."],
  [BarChart3, "Hebel auf Nettoliquidität", "Marktwert und Kapitalbasis transparent gegenüberstellen."],
  [Gauge, "Margin-Auslastung", "Auslastung mit selbst gewählten Grenzwerten vergleichen."],
  [Target, "Risiko-Budget", "Gesamtrisiko und verfügbares Budget sachlich einordnen."],
  [ShieldCheck, "Positionsrisiko", "Risiko bis zum eingetragenen Trading-Stop berechnen."],
  [AlertTriangle, "Warnsystem", "Objektive Schwellenüberschreitungen sichtbar machen."],
] as const;

export default function Home() {
  const registration = getRegistrationConfig();
  const registrationLabel = registration.effectiveMode === "open"
    ? "Registrieren"
    : registration.effectiveMode === "invite"
      ? "Mit Einladung registrieren"
      : "Zugang anfragen";

  return (
    <PublicPage>
      <main>
        <section className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.02fr_.98fr] lg:items-center lg:px-8 lg:py-24">
          <div>
            <div className="inline-flex rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-accent">
              Depot-, Margin- und Risikomanagement
            </div>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-[-.035em] sm:text-6xl">
              Risiken erkennen, bevor sie das Depot bestimmen.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
              DepotArchitect bündelt Depotstruktur, Hebel, Margin und selbst definierte Risikogrenzen in einem ruhigen Cockpit – ohne automatische Anlageentscheidungen.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="rounded-xl bg-accent px-5 py-3 font-medium text-[#062218]">
                Anmelden
              </Link>
              <Link href="/login#registrierung" className="rounded-xl border border-border px-5 py-3 text-sm font-medium">
                {registrationLabel}
              </Link>
            </div>
            {registration.effectiveMode === "closed" && (
              <p className="mt-4 text-sm text-amber-200">Registrierung derzeit geschlossen. Bestehende Testkonten können sich weiterhin anmelden.</p>
            )}
          </div>

          <CockpitPreview />
        </section>

        <section className="border-y border-border/70 bg-sidebar/40">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <div className="text-xs font-semibold uppercase tracking-[.2em] text-accent">Das Problem</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">Viele Positionen, mehrere Grenzen, zu wenig gemeinsamer Kontext.</h2>
              <p className="mt-4 leading-7 text-muted">
                Einzelne Marktwerte sagen wenig über Konzentration, Margin und Stop-Risiko. DepotArchitect stellt diese Größen neutral zusammen und warnt, wenn objektive oder selbst festgelegte Schwellen überschritten werden.
              </p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {features.map(([Icon, title, text]) => (
                <article key={title} className="rounded-2xl border border-border bg-panel/80 p-5">
                  <Icon className="text-accent" size={22} />
                  <h3 className="mt-4 font-medium">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-6 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8">
          <article className="rounded-3xl border border-border bg-panel/80 p-7">
            <LockKeyhole className="text-accent" />
            <h2 className="mt-5 text-2xl font-semibold">Getrennte, geschützte Benutzerkonten</h2>
            <p className="mt-3 leading-7 text-muted">
              Supabase Auth und Row Level Security trennen Depotdaten auf Datenbankebene. Nutzer sehen und exportieren ausschließlich die Daten ihres eigenen Kontos.
            </p>
          </article>
          <article className="rounded-3xl border border-border bg-panel/80 p-7">
            <ShieldCheck className="text-accent" />
            <h2 className="mt-5 text-2xl font-semibold">Analyse statt Empfehlung</h2>
            <p className="mt-3 leading-7 text-muted">
              DepotArchitect berechnet Depotkennzahlen und prüft benutzerdefinierte Grenzen. Es gibt keine individuellen Kauf-, Verkaufs- oder Umschichtungsempfehlungen und ersetzt keine Anlageberatung.
            </p>
            <Link href="/risikohinweis" className="mt-5 inline-flex items-center gap-2 text-sm text-accent">
              Risikohinweis lesen <ArrowRight size={15} />
            </Link>
          </article>
        </section>
      </main>
    </PublicPage>
  );
}

function CockpitPreview() {
  const metrics = [
    ["Nettoliquidität", "Beispielwert"],
    ["Hebel", "1,24×"],
    ["Margin", "38 %"],
    ["Risiko-Budget", "72 %"],
  ] as const;

  return (
    <div className="relative rounded-[2rem] border border-border bg-[#091511] p-4 shadow-[0_35px_100px_rgba(0,0,0,.35)] sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[.18em] text-accent">Cockpit-Vorschau</div>
          <div className="mt-1 text-sm text-muted">Reine Beispieldarstellung, keine Benutzerdaten</div>
        </div>
        <span className="rounded-full border border-border px-2 py-1 text-[10px] text-muted">DEMO</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {metrics.map(([label, metric]) => (
          <div key={label} className="rounded-2xl border border-border/80 bg-panel p-4">
            <div className="text-[11px] text-muted">{label}</div>
            <div className="mt-2 text-xl font-semibold">{metric}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex items-center gap-2 text-sm text-amber-200"><AlertTriangle size={16} /> Beispielwarnung</div>
        <p className="mt-2 text-xs leading-5 text-muted">Ein selbst festgelegter Grenzwert wurde überschritten. Keine Handlungsempfehlung.</p>
      </div>
    </div>
  );
}
