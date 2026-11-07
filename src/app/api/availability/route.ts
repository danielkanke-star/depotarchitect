import { timingSafeEqual } from "node:crypto";

export const maxDuration = 10;

const checks = [
  { name: "auth", path: "/auth/v1/health" },
  { name: "portfolio", path: "/rest/v1/rpc/check_application_storage?section=portfolio" },
  { name: "journal", path: "/rest/v1/rpc/check_application_storage?section=journal" },
  { name: "market_data", path: "/rest/v1/rpc/check_application_storage?section=market_data" },
];

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) {
    return new Response(null, { status: 401 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl || !apiKey) {
    console.error("Availability check is missing its Supabase configuration");
    return new Response(null, { status: 503 });
  }

  const results = await Promise.allSettled(checks.map(async ({ name, path }) => {
    const response = await fetch(new URL(path, baseUrl), {
      headers: { apikey: apiKey },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return name === "auth" ? typeof result?.version === "string" : result === true;
  }));

  const failed = checks.filter((_, index) => {
    const result = results[index];
    return result.status !== "fulfilled" || !result.value;
  });
  if (failed.length > 0) {
    console.error("Availability check failed", failed.map(({ name }) => name));
    return new Response(null, { status: 503 });
  }

  return new Response(null, { status: 204 });
}
