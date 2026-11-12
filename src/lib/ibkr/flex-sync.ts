import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { fetchFlexReport, type FlexCredentials } from "./flex-client";
import { FlexReportError, parseFlexReport } from "./flex-report";
import { completeTradeConversions } from "@/lib/trade-conversions";

export function flexConfiguration() {
  const configured = process.env.IBKR_FLEX_SECRET;
  if (!configured || !/^[a-f0-9]{64}$/i.test(configured)) return null;
  const root = Buffer.from(configured, "hex");
  return {
    encryptionKey: createHash("sha256").update(root).update("encryption:v1").digest(),
    workerKey: createHash("sha256").update(root).update("worker:v1").digest("hex"),
  };
}

export function brokerAccountHash(source: string, account: string) {
  // Include the environment-independent provider namespace so file and report sync share their ledger.
  return createHash("sha256").update(source).update(":").update(account).digest("hex");
}

export function sealFlex(portfolio: string, credentials: FlexCredentials, key: Buffer) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(portfolio));
  const content = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), content]).toString("base64url");
}

function openFlex(portfolio: string, sealed: string, key: Buffer): FlexCredentials {
  const value = Buffer.from(sealed, "base64url");
  const cipher = createDecipheriv("aes-256-gcm", key, value.subarray(0, 12));
  cipher.setAAD(Buffer.from(portfolio));
  cipher.setAuthTag(value.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString("utf8"));
}

type FlexJob = { portfolio: string; lease: string; credentials: string; account: string; currency: string };
export type FlexStatus = { account: string; expires: string; lastSuccess: string; lastError: string | null };
export type ImportOutcome = { opened: number; closed: number; skipped: number };
export type SyncOutcome = Partial<ImportOutcome> & { error: string | null; message?: string };

export function createFlexWorker() {
  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function runFlexSync(supabase: SupabaseClient<Database>, target?: string): Promise<SyncOutcome | null> {
  const config = flexConfiguration();
  if (!config) return null;
  const { data, error } = await supabase.rpc("ibkr_flex_claim", {
    worker_key: config.workerKey, ...(target ? { target_portfolio: target } : {}),
  });
  if (error) return { error: "unavailable" };
  if (!data) return null;
  const job = data as unknown as FlexJob;
  let entries: Json = [];
  let reportAccount: string | null = null;
  let valuation: Json = {};
  let failure: string | null = null;
  try {
    const credentials = openFlex(job.portfolio, job.credentials, config.encryptionKey);
    const xml = await fetchFlexReport(credentials);
    const report = parseFlexReport(xml, job.currency);
    reportAccount = brokerAccountHash("ibkr", report.account);
    if (reportAccount === job.account) {
      entries = await completeTradeConversions(report.trades, job.currency) as unknown as Json;
      valuation = report.valuation as unknown as Json;
    }
  } catch (error) {
    failure = error instanceof FlexReportError ? error.status : "credentials";
  }
  const result = await supabase.rpc("ibkr_flex_finish", {
    worker_key: config.workerKey, job_lease: job.lease, report_account: reportAccount, entries, valuation, failure,
  });
  return result.error || !result.data ? { error: "unavailable" } : result.data as unknown as SyncOutcome;
}
