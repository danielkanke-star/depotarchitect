"use client";

import Image from "next/image";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function MfaSetupForm() {
  const [factorId, setFactorId] = useState<string>();
  const [qrCode, setQrCode] = useState<string>();
  const [secret, setSecret] = useState<string>();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function enroll() {
    setBusy(true);
    setError(undefined);
    const supabase = createClient();
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "DepotArchitect Admin",
    });
    setBusy(false);
    if (enrollError) {
      setError("Die MFA-Einrichtung konnte nicht gestartet werden.");
      return;
    }
    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId || code.length !== 6) return;
    setBusy(true);
    setError(undefined);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (verifyError) {
      setError("Der Bestätigungscode ist ungültig oder abgelaufen.");
      return;
    }
    window.location.assign("/admin");
  }

  if (!factorId) {
    return (
      <button disabled={busy} onClick={enroll} className="mt-6 rounded-xl bg-accent px-5 py-3 font-medium text-[#062218] disabled:opacity-60">
        {busy ? "Einrichtung wird vorbereitet …" : "Authenticator einrichten"}
      </button>
    );
  }

  return (
    <form onSubmit={verify} className="mt-6 space-y-5">
      {qrCode && <Image unoptimized src={qrCode} alt="QR-Code für die Authenticator-App" width={220} height={220} className="rounded-xl bg-white p-3" />}
      <div className="rounded-xl border border-border bg-background/50 p-4 text-sm text-muted">
        <p>QR-Code mit einer TOTP-Authenticator-App scannen. Falls das nicht möglich ist:</p>
        <code className="mt-2 block break-all text-xs text-foreground">{secret}</code>
      </div>
      <label>Sechsstelliger Code<input inputMode="numeric" pattern="[0-9]{6}" value={code} onChange={(event) => setCode(event.target.value)} required autoComplete="one-time-code" /></label>
      {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-accent px-5 py-3 font-medium text-[#062218] disabled:opacity-60">
        {busy ? "Wird geprüft …" : "MFA aktivieren und Adminbereich öffnen"}
      </button>
    </form>
  );
}
