"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminMfa } from "@/lib/auth";
import type { AccountStatus } from "@/lib/database.types";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function adminResult(code: string) {
  return `/admin?result=${encodeURIComponent(code)}`;
}

export async function setAccountStatus(formData: FormData) {
  const targetUser = value(formData, "target_user");
  const status = value(formData, "new_status") as AccountStatus;
  const expectedConfirmation = status === "suspended" ? "SPERREN" : "AKTIVIEREN";
  if (!targetUser || !["active", "suspended"].includes(status) || value(formData, "confirmation") !== expectedConfirmation) {
    redirect(adminResult("confirmation_required"));
  }

  const { supabase } = await requireAdminMfa();
  const { error } = await supabase.rpc("admin_set_account_status", {
    target_user: targetUser,
    new_status: status,
    audit_request_id: randomUUID(),
  });
  if (error) redirect(adminResult("action_failed"));
  revalidatePath("/admin");
  redirect(adminResult("status_updated"));
}

export async function processDeletionRequest(formData: FormData) {
  const deletionRequest = value(formData, "deletion_request");
  if (!deletionRequest || value(formData, "confirmation") !== "BEARBEITUNG STARTEN") {
    redirect(adminResult("confirmation_required"));
  }

  const { supabase } = await requireAdminMfa();
  const { error } = await supabase.rpc("admin_process_deletion_request", {
    deletion_request: deletionRequest,
    audit_request_id: randomUUID(),
  });
  if (error) redirect(adminResult("action_failed"));
  revalidatePath("/admin");
  redirect(adminResult("deletion_processing_started"));
}
