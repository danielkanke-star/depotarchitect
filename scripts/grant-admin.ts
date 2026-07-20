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

  const { error: roleError } = await supabase.from("user_roles").upsert(
    { user_id: userId, role: "admin" },
    { onConflict: "user_id,role", ignoreDuplicates: true },
  );
  if (roleError) throw new Error("The admin role could not be granted.");

  const requestId = randomUUID();
  const { error: auditError } = await supabase.from("admin_audit_log").insert({
    admin_user_id: userId,
    action: "role.grant.bootstrap",
    target_user_id: userId,
    target_type: "user_role",
    request_id: requestId,
    metadata: { role: "admin", source: "scripts/grant-admin.ts" },
  });
  if (auditError) throw new Error("The role was granted, but the audit entry failed. Inspect the database before retrying.");

  console.info(`Admin role granted. User ID: ${userId}. Audit request ID: ${requestId}.`);
  console.info("The administrator must enroll Supabase TOTP before opening /admin.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Admin provisioning failed.");
  process.exitCode = 1;
});
