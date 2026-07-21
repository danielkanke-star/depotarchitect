import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Required environment variable is missing: ${name}`);
  return value;
}

function requestedEmail() {
  const index = process.argv.indexOf("--email");
  const email = index >= 0 ? process.argv[index + 1]?.trim().toLowerCase() : undefined;
  if (!email || !email.includes("@")) {
    throw new Error("Usage: npm run grant-admin -- --email user@example.com");
  }
  return email;
}

async function main() {
  const email = requestedEmail();
  const supabase = createClient<Database>(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SECRET_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let page = 1;
  let userId: string | undefined;
  while (!userId) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error("The Auth user directory could not be read.");
    userId = data.users.find((user) => user.email?.toLowerCase() === email)?.id;
    if (data.users.length < 100) break;
    page += 1;
  }
  if (!userId) throw new Error("No Auth user exists for the supplied email address.");

  const requestId = randomUUID();
  const { data: granted, error: grantError } = await supabase.rpc("bootstrap_grant_admin", {
    target_user: userId,
    audit_request_id: requestId,
  });
  if (grantError) throw new Error("The atomic admin role grant failed.");
  if (!granted) {
    console.info("Admin role was already present; no duplicate role or audit entry was created.");
    return;
  }

  console.info(`Admin role granted. User ID: ${userId}. Audit request ID: ${requestId}.`);
  console.info("The administrator must enroll Supabase TOTP before opening /admin.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Admin provisioning failed.");
  process.exitCode = 1;
});
