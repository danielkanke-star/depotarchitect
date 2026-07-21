import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminMfa } from "@/lib/auth";
import type { AccountStatus, DeletionRequestStatus } from "@/lib/database.types";
import { processDeletionRequest, setAccountStatus } from "../../actions";

type UserDetail = {
  user_id: string; email: string; registered_at: string; email_confirmed: boolean;
  last_login_at: string | null; last_seen_at: string | null; account_status: AccountStatus;
  plan: string; portfolio_count: number; position_count: number; last_import_at: string | null;
  deletion_requests: Array<{ id: string; requested_at: string; status: DeletionRequestStatus; processed_at: string | null }>;
};

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "–";
}

export default async function AdminUserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const { supabase } = await requireAdminMfa();
  const { data, error } = await supabase.rpc("get_admin_user_detail", { target_user: userId, audit_request_id: randomUUID() });
  if (error || !data) notFound();
  const user = data as unknown as UserDetail;
  const newStatus = user.account_status === "suspended" ? "active" : "suspended";
  const confirmation = newStatus === "suspended" ? "SPERREN" : "AKTIVIEREN";

  return <>
    <Link href="/admin" className="text-sm text-accent">← Benutzerübersicht</Link>
    <div className="mt-5"><h1 className="text-3xl font-semibold">Benutzerkonto</h1><p className="mt-2 text-sm text-muted">Das Öffnen dieser Metadatenansicht wurde im Admin-Auditprotokoll erfasst.</p></div>
    <section className="mt-7 grid gap-3 rounded-2xl border border-border bg-panel p-6 sm:grid-cols-2 lg:grid-cols-4">
      <Info label="E-Mail" value={user.email} /><Info label="Registriert" value={date(user.registered_at)} /><Info label="E-Mail bestätigt" value={user.email_confirmed ? "Ja" : "Nein"} /><Info label="Letzter Login" value={date(user.last_login_at)} />
      <Info label="Kontostatus" value={user.account_status} /><Info label="Tarif" value={user.plan} /><Info label="Portfolios" value={String(user.portfolio_count)} /><Info label="Positionen" value={String(user.position_count)} />
    </section>
    <div className="mt-7 grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-border bg-panel p-6"><h2 className="text-xl font-semibold">Kontostatus ändern</h2><p className="mt-2 text-sm leading-6 text-muted">Die Aktion prüft Adminrolle und MFA erneut und wird protokolliert. Zur Bestätigung exakt <strong className="text-foreground">{confirmation}</strong> eingeben.</p><form action={setAccountStatus} className="mt-5 space-y-4"><input type="hidden" name="target_user" value={user.user_id} /><input type="hidden" name="new_status" value={newStatus} /><label>Sicherheitsbestätigung<input name="confirmation" required autoComplete="off" /></label><button className="rounded-xl border border-amber-400/50 px-4 py-2.5 text-sm text-amber-100">Konto {newStatus === "suspended" ? "sperren" : "aktivieren"}</button></form></section>
      <section className="rounded-2xl border border-border bg-panel p-6"><h2 className="text-xl font-semibold">Löschanfragen</h2>{user.deletion_requests.length === 0 ? <p className="mt-3 text-sm text-muted">Keine Löschanfrage vorhanden.</p> : <div className="mt-4 space-y-4">{user.deletion_requests.map((request) => <div key={request.id} className="rounded-xl border border-border p-4"><p className="text-sm">Status: {request.status}</p><p className="mt-1 text-xs text-muted">Angefragt: {date(request.requested_at)}</p>{["pending", "confirmed"].includes(request.status) && <form action={processDeletionRequest} className="mt-4 space-y-3"><input type="hidden" name="deletion_request" value={request.id} /><label>Zur Bestätigung „BEARBEITUNG STARTEN“ eingeben<input name="confirmation" required autoComplete="off" /></label><button className="rounded-xl border border-border px-4 py-2 text-sm">Als in Bearbeitung markieren</button></form>}</div>)}</div>}<p className="mt-4 text-xs leading-5 text-muted">Es erfolgt ausdrücklich keine automatische Löschung. Eine vollständige Löschung benötigt eine separate manuelle Prüfung.</p></section>
    </div>
  </>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-muted">{label}</div><div className="mt-1 break-words text-sm">{value}</div></div>;
}
