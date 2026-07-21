import Link from "next/link";
import type { Metadata } from "next";
import { signIn, signUp } from "./actions";
import { getRegistrationConfig } from "@/lib/config/registration";

export const metadata: Metadata = { title: "Anmelden", robots: { index: false, follow: false } };

const errors: Record<string, string> = {
  missing_credentials: "Bitte E-Mail-Adresse und Passwort eingeben.",
  invalid_credentials: "Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen.",
  account_unavailable: "Dieses Konto ist derzeit nicht verfügbar.",
  registration_closed: "Die Registrierung ist derzeit geschlossen.",
  invalid_registration: "Bitte eine gültige E-Mail-Adresse und mindestens acht Passwortzeichen verwenden.",
  invalid_invitation: "Die Einladung ist ungültig, abgelaufen oder wurde bereits verwendet.",
  legal_acknowledgements_required: "Für die Registrierung sind alle drei getrennten Bestätigungen erforderlich.",
  registration_unavailable: "Die Registrierung konnte nicht abgeschlossen werden.",
  confirmation_failed: "Die E-Mail-Bestätigung ist ungültig oder abgelaufen.",
};

const messages: Record<string, string> = {
  confirmation_sent: "Der Bestätigungslink wurde versendet. Bitte den Posteingang prüfen.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const registration = getRegistrationConfig();
  const canRegister = registration.effectiveMode !== "closed";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_70%_10%,#16382d_0,transparent_35%)] px-4 py-12">
      <div className={`mx-auto grid w-full gap-6 ${canRegister ? "max-w-5xl lg:grid-cols-2" : "max-w-md"}`}>
        <section className="rounded-3xl border border-border bg-panel/95 p-6 shadow-2xl sm:p-8">
          <Link href="/" className="text-xl font-semibold">Depot<span className="text-accent">Architect</span></Link>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight">Anmelden</h1>
          <p className="mt-2 text-sm text-muted">Geschützte Benutzerkonten mit Supabase Auth und Row Level Security.</p>
          {params.error && (
            <div role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {errors[params.error] ?? "Die Aktion konnte nicht abgeschlossen werden."}
            </div>
          )}
          {params.message && (
            <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              {messages[params.message] ?? "Die Aktion wurde abgeschlossen."}
            </div>
          )}
          <form action={signIn} className="mt-6 space-y-4">
            <label>E-Mail<input name="email" type="email" required autoComplete="email" /></label>
            <label>Passwort<input name="password" type="password" required autoComplete="current-password" /></label>
            <button className="w-full rounded-xl bg-accent px-4 py-3 font-medium text-[#062218]">Anmelden</button>
          </form>
          {!canRegister && (
            <div className="mt-6 rounded-xl border border-border bg-background/40 p-4 text-sm text-muted">
              <p className="font-medium text-foreground">Registrierung derzeit geschlossen</p>
              <p className="mt-1">Neue Kundenkonten werden noch nicht öffentlich eröffnet.</p>
              <span className="mt-3 inline-block text-accent">Zugang anfragen – Kontakt wird rechtlich ergänzt</span>
            </div>
          )}
        </section>

        {canRegister && (
          <section id="registrierung" className="rounded-3xl border border-border bg-panel/95 p-6 shadow-2xl sm:p-8">
            <h2 className="text-2xl font-semibold">{registration.effectiveMode === "invite" ? "Mit Einladung registrieren" : "Konto registrieren"}</h2>
            <p className="mt-2 text-sm text-muted">Die Bestätigungen werden getrennt und mit der jeweiligen Dokumentversion protokolliert.</p>
            <form action={signUp} className="mt-6 space-y-4">
              <label>E-Mail<input name="registration_email" type="email" required autoComplete="email" /></label>
              <label>Passwort<input name="registration_password" type="password" required minLength={8} autoComplete="new-password" /></label>
              {registration.effectiveMode === "invite" && (
                <label>Einladungscode<input name="invitation_token" required autoComplete="off" /></label>
              )}
              <label className="grid grid-cols-[auto_1fr] items-start gap-3 text-sm">
                <input className="mt-1 h-4 w-4" type="checkbox" name="privacy_notice_acknowledged" required />
                <span>Ich habe die <Link className="text-accent underline" href="/datenschutz">Datenschutzinformationen</Link> zur Kenntnis genommen.</span>
              </label>
              <label className="grid grid-cols-[auto_1fr] items-start gap-3 text-sm">
                <input className="mt-1 h-4 w-4" type="checkbox" name="terms_of_use_accepted" required />
                <span>Ich akzeptiere die <Link className="text-accent underline" href="/nutzungsbedingungen">Nutzungsbedingungen</Link>.</span>
              </label>
              <label className="grid grid-cols-[auto_1fr] items-start gap-3 text-sm">
                <input className="mt-1 h-4 w-4" type="checkbox" name="risk_notice_acknowledged" required />
                <span>Ich habe den <Link className="text-accent underline" href="/risikohinweis">Risikohinweis</Link> zur Kenntnis genommen.</span>
              </label>
              <button className="w-full rounded-xl border border-accent px-4 py-3 font-medium text-accent">Registrieren</button>
            </form>
            <p className="mt-5 text-xs leading-5 text-muted">Keine Marketingeinwilligung. DepotArchitect stellt neutrale Kennzahlen und benutzerdefinierte Warnschwellen dar; es erteilt keine Anlageberatung.</p>
          </section>
        )}
      </div>
    </main>
  );
}
