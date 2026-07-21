import "server-only";

import { redirect } from "next/navigation";
import type { AccountStatus, AppRole } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

const usableAccountStatuses: AccountStatus[] = ["active", "invited", "deletion_requested"];

export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: accountStatus, error } = await supabase.rpc("get_my_account_status");
  if (error || !accountStatus || !usableAccountStatuses.includes(accountStatus)) {
    await supabase.auth.signOut();
    redirect("/login?error=account_unavailable");
  }

  await supabase.rpc("touch_user_profile");

  return { supabase, userId, accountStatus };
}

export async function getCurrentRole(): Promise<AppRole> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("get_my_role");
  if (error) return "user";
  return data;
}

export async function requireAdminIdentity() {
  const identity = await requireUser();
  const { data: role, error } = await identity.supabase.rpc("get_my_role");
  if (error || role !== "admin") redirect("/cockpit");
  return identity;
}

export async function requireAdminMfa() {
  const identity = await requireAdminIdentity();
  const { data: assurance, error: assuranceError } =
    await identity.supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (!assuranceError && assurance?.currentLevel === "aal2") return identity;

  const { data: factors } = await identity.supabase.auth.mfa.listFactors();
  const hasVerifiedTotp = factors?.totp.some((factor) => factor.status === "verified") ?? false;
  redirect(hasVerifiedTotp ? "/mfa/verify" : "/mfa/setup");
}
