"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function MfaVerifyForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const supabase = createClient();
    const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp.find((item) => item.status === "verified");
    if (factorError || !factor) {
      setBusy(false);
      setError("Kein bestätigter Authenticator gefunden.");
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    setBusy(false);
    if (verifyError) {
      setError("Der Bestätigungscode ist ungültig oder abgelaufen.");
      return;
    }
    window.location.assign("/admin");
  }

  return (
    <form onSubmit={verify} className="mt-6 space-y-4">
      <label>Sechsstelliger Authenticator-Code<input inputMode="numeric" pattern="[0-9]{6}" value={code} onChange={(event) => setCode(event.target.value)} required autoComplete="one-time-code" autoFocus /></label>
      {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-accent px-5 py-3 font-medium text-[#062218] disabled:opacity-60">
        {busy ? "Wird geprüft …" : "Adminzugriff bestätigen"}
      </button>
    </form>
  );
}
