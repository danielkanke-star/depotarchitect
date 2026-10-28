import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, chmod, realpath, open, unlink } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Database, Json } from "../src/lib/database.types";
import { IbkrGateway } from "../src/lib/ibkr/gateway";
import { validateIbkrQuote, type IbkrQuote } from "../src/lib/ibkr/core";

const configFile = resolve(".local/ibkr-bridge/device.json");
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
type Config = { supabaseUrl: string; publishableKey: string; deviceToken: string; gatewayUrl: string };
type Job = { id: string; query: string; conid: number | null; lease: string };

function client(config: Pick<Config, "supabaseUrl" | "publishableKey">) {
  const url = new URL(config.supabaseUrl);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co") || url.username || url.password) throw new Error("Ungültiges Supabase-Ziel.");
  return createClient<Database>(url.origin, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function pair() {
  loadEnvConfig(process.cwd());
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) throw new Error("Die öffentliche Supabase-Konfiguration fehlt in .env.local.");
  let code: string;
  if (process.argv[3] === "--code-file" && process.argv[4]) {
    const source = await realpath(resolve(process.argv[4]));
    if (!source.startsWith(await realpath(resolve(".local")) + "/")) throw new Error("Die private Kopplungsdatei muss unter .local liegen.");
    code = (await readFile(source, "utf8")).trim();
  } else {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try { code = (await prompt.question("Kopplungscode aus DepotArchitect → Einstellungen → IBKR: ")).trim(); }
    finally { prompt.close(); }
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) throw new Error("Der Kopplungscode ist ungültig.");
  const deviceToken = randomBytes(32).toString("base64url");
  const config: Config = { supabaseUrl, publishableKey, deviceToken, gatewayUrl: "https://127.0.0.1:5055/v1/api" };
  const { error } = await client(config).rpc("ibkr_bridge_pair", { pairing_code: code, device_token: deviceToken });
  if (error) throw new Error("Kopplung fehlgeschlagen. Bitte einen neuen Code in der App erzeugen.");
  await mkdir(resolve(".local/ibkr-bridge"), { recursive: true, mode: 0o700 });
  await writeFile(configFile, JSON.stringify(config), { mode: 0o600 });
  await chmod(configFile, 0o600);
  console.log("Gerät gekoppelt. Lesenden Kursdienst starten: npm run ibkr:bridge");
}

async function run() {
  let config: Config;
  try { config = JSON.parse(await readFile(configFile, "utf8")); }
  catch { throw new Error("Gerätekonfiguration fehlt oder ist ungültig. Bitte den Mac in der App neu koppeln."); }
  if (!/^[A-Za-z0-9_-]{43}$/.test(config.deviceToken)) throw new Error("Gerät muss neu gekoppelt werden.");
  const supabase = client(config), gateway = new IbkrGateway(config.gatewayUrl);
  let running = true, nextPortfolio = 0, nextAuth = 0, lastTickle = 0, active = true, previousStatus = "";
  let state = { authenticated: false, connected: false, competing: false };
  let errorCode: string | null = null;
  let pendingQuotes: IbkrQuote[] = [];
  process.once("SIGINT", () => { running = false; });
  process.once("SIGTERM", () => { running = false; });
  console.log("IBKR-Kursdienst gestartet: ausschließlich lesend; keine Bestellungen von Marktdaten.");
  while (running) {
    let quotes: IbkrQuote[] = pendingQuotes;
    pendingQuotes = [];
    try {
      if (Date.now() >= nextAuth) {
        try {
          state = await gateway.status();
          errorCode = state.competing ? "session_competing" : state.authenticated && state.connected ? null : "login_required";
          if (state.authenticated && Date.now() - lastTickle > 60_000) { await gateway.keepAlive(); lastTickle = Date.now(); }
        } catch { state = { authenticated: false, connected: false, competing: false }; errorCode = "gateway_offline"; }
        nextAuth = Date.now() + 20_000;
      }
      if (state.authenticated && !state.competing && Date.now() >= nextPortfolio && active) {
        try { quotes = [...quotes, ...await gateway.portfolioQuotes()]; errorCode = null; }
        catch (e) { errorCode = e instanceof Error && e.message === "account_selection_required" ? e.message : "broker_error"; }
        nextPortfolio = Date.now() + 60_000;
      }
      const { data, error } = await supabase.rpc("ibkr_bridge_poll", { device_token: config.deviceToken,
        gateway_ok: state.authenticated, brokerage_ok: state.connected && !state.competing, error_code: errorCode, quotes: quotes as unknown as Json });
      if (error) {
        if (/Device expired or revoked|Invalid device/.test(error.message)) throw new Error("Gerätekopplung abgelaufen oder widerrufen. Bitte in der App neu koppeln.");
        console.log("App vorübergehend nicht erreichbar. Neuer Versuch in 30 Sekunden."); await sleep(30_000); continue;
      }
      const response = data as { jobs?: Job[]; active?: boolean; waitSeconds?: number };
      active = response.active === true;
      const status = errorCode ?? "connected";
      if (status !== previousStatus || quotes.length > 0) {
        console.log(status === "connected" ? `Verbunden${quotes.length ? ` · ${quotes.length} Instrumentkurse übertragen` : ""}.` : `Verbindung benötigt Aufmerksamkeit: ${status}.`);
        previousStatus = status;
      }
      for (const job of response.jobs ?? []) {
        let result: unknown = { status: "login_required" };
        if (state.authenticated && !state.competing) {
          try { result = await gateway.lookup(job.query, job.conid); }
          catch { result = { status: "broker_error" }; }
        }
        const quote = result && typeof result === "object" && "quote" in result ? validateIbkrQuote(result.quote) : null;
        if (quote) pendingQuotes.push(quote);
        await supabase.rpc("ibkr_bridge_complete", { device_token: config.deviceToken, request_id: job.id, request_lease: job.lease, response: result as Json });
      }
      await sleep(Math.min(10, Math.max(2, response.waitSeconds ?? 10)) * 1000);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Gerätekopplung")) throw e;
      console.log("Kursdienst wartet auf die Verbindung. Neuer Versuch in 30 Sekunden.");
      await sleep(30_000);
    }
  }
}

async function claimLock() {
  const path = resolve(".local/ibkr-bridge/worker.pid");
  await mkdir(resolve(".local/ibkr-bridge"), { recursive: true, mode: 0o700 });
  try {
    const pid = Number((await readFile(path, "utf8")).trim());
    if (Number.isSafeInteger(pid) && pid > 0) {
      let alive = true;
      try { process.kill(pid, 0); } catch (e) { alive = (e as NodeJS.ErrnoException).code !== "ESRCH"; }
      if (alive) throw new Error("Der IBKR-Kursdienst läuft bereits.");
    }
    await unlink(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const file = await open(path, "wx", 0o600);
  await file.writeFile(String(process.pid));
  await file.close();
  return async () => { if ((await readFile(path, "utf8").catch(() => "")) === String(process.pid)) await unlink(path); };
}

async function main() {
  const mode = process.argv[2] ?? "start";
  if (mode === "pair") return pair();
  if (mode === "check") {
    const gateway = new IbkrGateway();
    const status = await gateway.status();
    console.log({ authenticated: status.authenticated, competing: status.competing });
    if (status.authenticated) {
      const quotes = await gateway.portfolioQuotes();
      await mkdir(resolve(".local/ibkr-bridge"), { recursive: true, mode: 0o700 });
      await writeFile(resolve(".local/ibkr-bridge/local-check.json"), JSON.stringify(quotes), { mode: 0o600 });
      console.log({ quoteCount: quotes.length, qualities: quotes.reduce<Record<string, number>>((a, q) => ({ ...a, [q.quality]: (a[q.quality] ?? 0) + 1 }), {}) });
    }
    return;
  }
  if (mode !== "start") throw new Error("Verwendung: ibkr-bridge.ts [pair|start|check]");
  const release = await claimLock();
  try { await run(); } finally { await release(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : "IBKR-Kursdienst konnte nicht gestartet werden."); process.exitCode = 1; });
}
