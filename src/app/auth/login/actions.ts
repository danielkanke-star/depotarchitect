"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { LEGAL_VERSIONS } from "@/lib/config/legal-versions";
import { getRegistrationConfig } from "@/lib/config/registration";
import { createClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function loginUrl(parameter: "error" | "message", code: string) {
  return `/login?${parameter}=${encodeURIComponent(code)}`;
}

function confirmationRedirectUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/auth/confirm`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/auth/confirm`;
  return "http://localhost:3000/auth/confirm";
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");

  if (!email || !password) redirect(loginUrl("error", "missing_credentials"));

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(loginUrl("error", "invalid_credentials"));

  const { data: accountStatus } = await supabase.rpc("get_my_account_status");
  if (accountStatus === "suspended" || accountStatus === "deleted") {
    await supabase.auth.signOut();
    redirect(loginUrl("error", "account_unavailable"));
  }

  redirect("/cockpit");
}

export async function signUp(formData: FormData) {
  const registration = getRegistrationConfig();
  if (registration.effectiveMode === "closed") {
    redirect(loginUrl("error", "registration_closed"));
  }

  const email = value(formData, "registration_email").toLowerCase();
  const password = value(formData, "registration_password");
  const invitationToken = value(formData, "invitation_token");

  if (!email || password.length < 8) redirect(loginUrl("error", "invalid_registration"));
  if (
    !checked(formData, "privacy_notice_acknowledged")
    || !checked(formData, "terms_of_use_accepted")
    || !checked(formData, "risk_notice_acknowledged")
  ) {
    redirect(loginUrl("error", "legal_acknowledgements_required"));
  }

  let invitationTokenHash: string | undefined;
  const supabase = await createClient();

  if (registration.effectiveMode === "invite") {
    if (!invitationToken) redirect(loginUrl("error", "invalid_invitation"));
    invitationTokenHash = createHash("sha256").update(invitationToken, "utf8").digest("hex");
    const { data: invitationValid, error: invitationError } = await supabase.rpc(
      "validate_invitation",
      { invited_email: email, candidate_token_hash: invitationTokenHash },
    );
    if (invitationError || !invitationValid) {
      redirect(loginUrl("error", "invalid_invitation"));
    }
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: confirmationRedirectUrl(),
      data: {
        registration_mode: registration.effectiveMode,
        invitation_token_hash: invitationTokenHash,
        privacy_notice_acknowledged: true,
        privacy_notice_version: LEGAL_VERSIONS.privacyNotice,
        terms_of_use_accepted: true,
        terms_of_use_version: LEGAL_VERSIONS.termsOfUse,
        risk_notice_acknowledged: true,
        risk_notice_version: LEGAL_VERSIONS.riskNotice,
      },
    },
  });

  if (error) redirect(loginUrl("error", "registration_unavailable"));
  redirect(loginUrl("message", "confirmation_sent"));
}
