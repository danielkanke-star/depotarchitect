"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export async function requestDeletion(formData: FormData) {
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const understood = formData.get("understood") === "on";
  if (!understood || confirmation !== "KONTO LÖSCHEN BEANTRAGEN") {
    redirect("/konto/datenschutz?result=confirmation_required");
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("request_account_deletion");
  if (error) redirect("/konto/datenschutz?result=request_failed");
  revalidatePath("/konto/datenschutz");
  redirect("/konto/datenschutz?result=request_recorded");
}
