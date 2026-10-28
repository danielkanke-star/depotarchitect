import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, join } from "node:path";

const directory = resolve(".local/ibkr-gateway");
if (!existsSync(join(directory, "bin/run.sh"))) {
  console.error("Bitte den offiziellen IBKR Client Portal Gateway von https://download2.interactivebrokers.com/portal/clientportal.gw.zip nach .local/ibkr-gateway entpacken. Anleitung: docs/operations/ibkr-connection.md");
  process.exit(1);
}
let java = process.env.IBKR_JAVA_HOME ? join(process.env.IBKR_JAVA_HOME, "bin/java") : null;
for (const root of [join(homedir(), "Applications"), "/Applications"]) {
  if (java || !existsSync(root)) continue;
  for (const entry of readdirSync(root).filter(n => /trading|trader|ibkr|gateway/i.test(n))) {
    const candidate = join(root, entry, ".install4j/jre.bundle/Contents/Home/bin/java");
    if (existsSync(candidate)) { java = candidate; break; }
  }
}
const configPath = join(directory, "root/conf.yaml");
const config = readFileSync(configPath, "utf8").replace(/listenPort: \d+/, "listenPort: 5055")
  .replace(/origin.allowed: .*/, 'origin.allowed: "https://localhost:5055"')
  .replace(/    ips:[\s\S]*$/, '    ips:\n      allow:\n        - 127.0.0.1\n      deny: []\n');
writeFileSync(configPath, config);
console.log("Offizieller IBKR-Gateway · Login unter https://localhost:5055 · Zugriff nur vom eigenen Rechner.");
const child = spawn(java ?? "java", ["-server", "-Dvertx.disableDnsResolver=true", "-Djava.net.preferIPv4Stack=true",
  "-cp", "root:dist/ibgroup.web.core.iblink.router.clientportal.gw.jar:build/lib/runtime/*",
  "ibgroup.web.core.clientportal.gw.GatewayStart", "--conf", "../root/conf.yaml"], { cwd: directory, stdio: "inherit" });
child.on("error", () => { console.error("Java fehlt. Bitte IBKR_JAVA_HOME auf die lokale Java-Installation setzen."); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
process.once("SIGINT", () => child.kill("SIGINT"));
process.once("SIGTERM", () => child.kill("SIGTERM"));
