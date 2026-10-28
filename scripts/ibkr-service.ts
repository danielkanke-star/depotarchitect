import { spawn } from "node:child_process";
import { mkdir, open, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { IbkrGateway } from "../src/lib/ibkr/gateway";

// Explicit local start, without a login item or a system-wide service.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(root, ".local/ibkr-bridge");
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function start(script: string, logName: string) {
  const log = await open(resolve(directory, logName), "a", 0o600);
  await log.chmod(0o600);
  try {
    const child = spawn(process.execPath, ["--import", "tsx", resolve(root, "scripts", script)], {
      cwd: root, detached: true, stdio: ["ignore", log.fd, log.fd],
    });
    await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    child.unref();
  } finally { await log.close(); }
}

async function main() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const gateway = new IbkrGateway();
  let state = await gateway.status().catch(() => null);
  if (!state) {
    await start("ibkr-gateway.ts", "gateway.log");
    for (let attempt = 0; attempt < 30 && !state; attempt++) {
      await sleep(1000); state = await gateway.status().catch(() => null);
    }
    if (!state) throw new Error("Gateway konnte nicht gestartet werden. Bitte Java und die offizielle Gateway-Installation prüfen.");
  }
  console.log(state.authenticated ? "IBKR-Gateway ist angemeldet." : "Bitte im normalen Browser unter https://localhost:5055 bei IBKR anmelden.");
  if (!await stat(resolve(directory, "device.json")).catch(() => null)) {
    console.log("Der Mac muss noch über die App-Einstellungen und npm run ibkr:pair gekoppelt werden.");
    return;
  }
  const workerAlive = async () => {
    const pid = Number(await readFile(resolve(directory, "worker.pid"), "utf8").catch(() => "0"));
    if (!Number.isSafeInteger(pid) || pid <= 0) return false;
    try { process.kill(pid, 0); return true; } catch { return false; }
  };
  if (!await workerAlive()) {
    await start("ibkr-bridge.ts", "bridge.log");
    for (let attempt = 0; attempt < 15 && !await workerAlive(); attempt++) await sleep(1000);
    if (!await workerAlive()) throw new Error("Kursdienst konnte nicht gestartet werden. Bitte die Gerätekopplung prüfen.");
  }
  console.log("Kursdienst läuft im Hintergrund. Das Terminal darf geschlossen werden; der Mac muss eingeschaltet bleiben.");
}

main().catch(() => { console.error("IBKR-Start nicht vollständig. Anleitung: docs/operations/ibkr-connection.md; private Diagnose unter .local/ibkr-bridge/."); process.exitCode = 1; });
