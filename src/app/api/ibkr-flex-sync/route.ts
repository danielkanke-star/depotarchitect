import { timingSafeEqual } from "node:crypto";
import { createFlexWorker, flexConfiguration, runFlexSync } from "@/lib/ibkr/flex-sync";

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return new Response(null, { status: 401 });
  if (!flexConfiguration()) return new Response(null, { status: 204 });
  const supabase = createFlexWorker();
  const start = Date.now();
  for (let index = 0; index < 10 && Date.now() - start < 25_000; index++) {
    const outcome = await runFlexSync(supabase);
    if (!outcome) break;
    if (outcome.error === "unavailable") break;
  }
  return new Response(null, { status: 204 });
}
