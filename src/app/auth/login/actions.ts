"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: value(formData, "email"), password: value(formData, "password") });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/cockpit");
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const email = value(formData, "email");
  const { error } = await supabase.auth.signUp({
    email,
    password: value(formData, "password"),
    options: { emailRedirectTo: `${value(formData, "origin")}/auth/confirm` },
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect(`/login?message=${encodeURIComponent(`Bestätigungslink wurde an ${email} gesendet.`)}`);
}
