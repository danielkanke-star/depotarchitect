import Link from "next/link";
import { requireAdminMfa } from "@/lib/auth";

type AdminSummary = {
  registered_users: number;
  confirmed_users: number;
  active_users: number;
  suspended_users: number;
  open_deletion_requests: number;
};

const resultMessages: Record<string, string> = {
  status_updated: "Der Kontostatus wurde geändert und protokolliert.",
  deletion_processing_started: "Die manuelle Bearbeitung wurde markiert und protokolliert. Es wurden keine Daten gelöscht.",
  confirmation_required: "Die Sicherheitsbestätigung stimmt nicht.",
  action_failed: "Die Aktion wurde serverseitig abgelehnt.",
};

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "–";
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { supabase } = await requireAdminMfa();
  const [{ data: rawSummary, error: summaryError }, { data: users, error: usersError }, params] = await Promise.all([
    supabase.rpc("get_admin_summary"),
    supabase.rpc("get_admin_user_directory"),
    searchParams,
  ]);
  if (summaryError || usersError) throw new Error("Die Adminübersicht konnte nicht geladen werden.");
  const summary = rawSummary as unknown as AdminSummary;
  const cards = [
    ["Registriert", summary.registered_users],
    ["E-Mail bestätigt", summary.confirmed_users],
    ["Aktiv", summary.active_users],
    ["Gesperrt", summary.suspended_users],
    ["Offene Löschanfragen", summary.open_deletion_requests],
  ];

  return <>
    <div className="mb-6"><h1 className="text-3xl font-semibold">Benutzerverwaltung</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Bewusst begrenzte Metadatenansicht. Depotpositionen, Instrumente, Marktwerte, Liquidität und Risikodaten werden hier weder abgefragt noch angezeigt.</p></div>
    {params.result && <div className="mb-6 rounded-xl border border-border bg-panel p-4 text-sm">{resultMessages[params.result] ?? "Aktion abgeschlossen."}</div>}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{cards.map(([label, count]) => <div key={String(label)} className="rounded-2xl border border-border bg-panel p-5"><div className="text-3xl font-semibold">{count}</div><div className="mt-2 text-xs text-muted">{label}</div></div>)}</section>
    <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-panel">
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="border-b border-border text-xs text-muted"><tr>{["E-Mail", "Registriert", "Bestätigt", "Letzter Login", "Status", "Tarif", "Portfolios", "Positionen", "Letzter Import", ""].map((heading) => <th key={heading} className="px-4 py-3 font-medium">{heading}</th>)}</tr></thead><tbody>{users?.map((user) => <tr key={user.user_id} className="border-b border-border/60 last:border-0"><td className="px-4 py-3">{user.email}</td><td className="px-4 py-3 text-muted">{date(user.registered_at)}</td><td className="px-4 py-3">{user.email_confirmed ? "Ja" : "Nein"}</td><td className="px-4 py-3 text-muted">{date(user.last_login_at)}</td><td className="px-4 py-3">{user.account_status}</td><td className="px-4 py-3">{user.plan}</td><td className="px-4 py-3">{user.portfolio_count}</td><td className="px-4 py-3">{user.position_count}</td><td className="px-4 py-3 text-muted">{date(user.last_import_at)}</td><td className="px-4 py-3"><Link href={`/admin/users/${user.user_id}`} className="text-accent">Öffnen</Link></td></tr>)}</tbody></table></div>
    </section>
  </>;
}
