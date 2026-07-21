import { requireUser } from "@/lib/auth";
import { requestDeletion } from "./actions";

const resultMessages: Record<string, string> = {
  request_recorded: "Die Löschanfrage wurde erfasst. Es wurden noch keine Daten gelöscht.",
  confirmation_required: "Bitte beide Sicherheitsbestätigungen vollständig ausfüllen.",
  request_failed: "Die Löschanfrage konnte nicht erfasst werden.",
};

function date(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function AccountPrivacyPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { supabase, userId } = await requireUser();
  const [{ data: requests }, params] = await Promise.all([
    supabase.from("account_deletion_requests").select("id, requested_at, status, processed_at").eq("user_id", userId).order("requested_at", { ascending: false }),
    searchParams,
  ]);
  const openRequest = requests?.find((request) => ["pending", "confirmed", "processing"].includes(request.status));

  return <div className="space-y-7">
    <div><p className="text-xs uppercase tracking-[.2em] text-accent">Eigenes Konto</p><h1 className="mt-2 text-3xl font-semibold">Datenschutz und Datenrechte</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Exportiere ausschließlich deine eigenen gespeicherten Anwendungsdaten oder stelle eine Löschanfrage zur manuellen Prüfung.</p></div>
    {params.result && <div role="status" className="rounded-xl border border-border bg-panel p-4 text-sm">{resultMessages[params.result] ?? "Aktion abgeschlossen."}</div>}
    <section className="rounded-2xl border border-border bg-panel p-6"><h2 className="text-xl font-semibold">Eigene Daten exportieren</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Der JSON-Export enthält dein Benutzerprofil, Portfolios, Kategorien, Positionen, Einstellungen, rechtliche Kenntnisnahmen und – soweit vorhanden – Importhistorie. Die Abfragen werden zusätzlich durch RLS auf dein Benutzerkonto begrenzt.</p><a href="/konto/datenschutz/export" className="mt-5 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-[#062218]">JSON-Export herunterladen</a></section>
    <section className="rounded-2xl border border-red-400/30 bg-panel p-6"><h2 className="text-xl font-semibold">Kontolöschung beantragen</h2>{openRequest ? <div className="mt-4 rounded-xl border border-border bg-background/40 p-4 text-sm"><p>Offene Anfrage: <strong>{openRequest.status}</strong></p><p className="mt-1 text-muted">Eingereicht am {date(openRequest.requested_at)}</p><p className="mt-3 text-xs leading-5 text-muted">Die Anfrage wird manuell geprüft. Eine automatische Löschkaskade ist in Production nicht aktiviert.</p></div> : <><div className="mt-3 space-y-2 text-sm leading-6 text-muted"><p>Nach bestätigter manueller Prüfung sollen Konto- und Depotdaten gelöscht oder – soweit gesetzlich erforderlich – eingeschränkt aufbewahrt werden.</p><p><strong className="text-foreground">AUFBEWAHRUNGSFRIST VOR KUNDENSTART FESTZULEGEN.</strong> Dieser Antrag löscht nichts sofort und kann vor Abschluss geprüft werden.</p></div><form action={requestDeletion} className="mt-5 max-w-xl space-y-4"><label className="grid grid-cols-[auto_1fr] items-start gap-3 text-sm"><input className="mt-1 h-4 w-4" type="checkbox" name="understood" required /><span>Ich habe verstanden, dass eine bearbeitete Löschung den Zugang und die gespeicherten Anwendungsdaten dauerhaft entfernen kann.</span></label><label>Zur Bestätigung „KONTO LÖSCHEN BEANTRAGEN“ eingeben<input name="confirmation" required autoComplete="off" /></label><button className="rounded-xl border border-red-400/50 px-4 py-2.5 text-sm text-red-100">Löschung beantragen</button></form></>}</section>
  </div>;
}
