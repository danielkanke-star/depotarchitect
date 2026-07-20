import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MfaSetupForm } from "@/components/mfa-setup-form";
import { requireAdminIdentity } from "@/lib/auth";

export const metadata: Metadata = { title: "Admin-MFA einrichten", robots: { index: false, follow: false } };

export default async function MfaSetupPage() {
  const { supabase } = await requireAdminIdentity();
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.currentLevel === "aal2") redirect("/admin");
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (factors?.totp.some((factor) => factor.status === "verified")) redirect("/mfa/verify");

  return <main className="min-h-screen px-4 py-16"><section className="mx-auto max-w-lg rounded-3xl border border-border bg-panel p-7">
    <Link href="/cockpit" className="text-sm text-accent">← Zur Anwendung</Link>
    <h1 className="mt-5 text-3xl font-semibold">Admin-MFA einrichten</h1>
    <p className="mt-3 text-sm leading-6 text-muted">Für Administratoren ist ein zeitbasierter Einmalcode verpflichtend. Der geheime Schlüssel wird direkt durch Supabase Auth verwaltet.</p>
    <MfaSetupForm />
  </section></main>;
}
