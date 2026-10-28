"use client";

import { useEffect, useState, useTransition } from "react";
import { Card } from "./ui";
import { createIbkrPairing, ibkrConnectionStatus, refreshIbkrMarketData, revokeIbkrConnection } from "@/app/(dashboard)/einstellungen/ibkr-actions";

type Status = Awaited<ReturnType<typeof ibkrConnectionStatus>>;
export function IbkrConnection() {
  const [status, setStatus] = useState<Status>(null);
  const [pairing, setPairing] = useState<Awaited<ReturnType<typeof createIbkrPairing>> | null>(null);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(0);
  const [pending, start] = useTransition();
  useEffect(() => {
    let alive = true;
    const check = () => { if (document.visibilityState === "visible") void ibkrConnectionStatus().then(value => { if (alive) { setStatus(value); setNow(Date.now()); } }).catch(() => { if (alive) setMessage("Verbindungsstatus momentan nicht erreichbar."); }); };
    check(); const interval = window.setInterval(check, 10_000);
    return () => { alive = false; window.clearInterval(interval); };
  }, []);
  const online = status?.state === "paired" && status.lastSeenAt && now - Date.parse(status.lastSeenAt) < 90_000;
  const label = !status || status.state === "revoked" ? "Noch nicht verbunden"
    : status.state === "pending" ? "Wartet auf Gerätekopplung"
    : !online ? "Kursdienst auf dem Mac ist nicht erreichbar"
    : status.attention === "session_competing" ? "Andere IBKR-Sitzung aktiv"
    : !status.gatewayAuthenticated || !status.brokerageAuthenticated ? "Bitte bei IBKR anmelden"
    : status.attention ? "IBKR-Verbindung benötigt Aufmerksamkeit" : "Verbunden · ausschließlich lesend";
  return <Card>
    <h2 className="font-medium">Interactive Brokers / Estably</h2>
    <p role="status" className={`mt-3 text-sm ${online && status?.gatewayAuthenticated && !status.attention ? "text-emerald-300" : "text-amber-200"}`}>{label}</p>
    <p className="mt-3 text-sm leading-6 text-muted">Der lokale Kursdienst übernimmt verfügbare Brokerkurse und Depotbewertungen. Deine Teilpositionen, Kategorien und Stopps bleiben von der Kursversorgung unabhängig. Es werden keine Orders gesendet und keine Datenpakete gebucht.</p>
    {status?.lastSeenAt && <p className="mt-2 text-xs text-muted">Letzte Verbindung: {new Date(status.lastSeenAt).toLocaleString("de-DE")}</p>}
    <div className="mt-4 flex flex-wrap gap-3">
      <button disabled={pending} className="rounded-xl border border-accent/50 px-4 py-2 text-sm text-accent disabled:opacity-50" onClick={() => start(async () => {
        try { setPairing(await createIbkrPairing()); setMessage(""); } catch { setMessage("Kopplung konnte nicht gestartet werden."); }
      })}>Mac koppeln</button>
      {status?.state === "paired" && <>
        <button disabled={pending} className="rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-50" onClick={() => start(async () => {
          try { const r = await refreshIbkrMarketData(); setMessage(`${r.matched} Teilpositionen eindeutig zugeordnet, ${r.updated} Kursbeobachtungen aktualisiert.`); setStatus(await ibkrConnectionStatus()); }
          catch { setMessage("Kursabgleich momentan nicht möglich."); }
        })}>Kurse abgleichen</button>
        <button disabled={pending} className="rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-50" onClick={() => start(async () => {
          try { await revokeIbkrConnection(); setPairing(null); setStatus(await ibkrConnectionStatus()); setMessage("Gerätezugang widerrufen."); }
          catch { setMessage("Verbindung konnte nicht getrennt werden."); }
        })}>Verbindung trennen</button>
      </>}
    </div>
    {pairing && <div className="mt-4 rounded-xl border border-border p-4 text-sm">
      <p>Starte im Projektordner <code>npm run ibkr:pair</code> und gib dort diesen einmaligen Kopplungscode ein:</p>
      <code className="mt-3 block break-all rounded-lg bg-background p-3 select-all">{pairing.code}</code>
      <p className="mt-2 text-xs text-muted">10 Minuten gültig. Danach <code>npm run ibkr:bridge</code> starten. Der Gerätezugang gilt 30 Tage und lässt sich hier jederzeit widerrufen.</p>
    </div>}
    <details className="mt-4 text-sm"><summary className="cursor-pointer text-muted">Anmeldung und Kursqualität</summary>
      <div className="mt-3 space-y-2 text-muted"><p>Der offizielle Gateway läuft auf deinem Mac unter <a className="underline" href="https://localhost:5055" target="_blank" rel="noreferrer">https://localhost:5055</a>. IBKR verlangt eine tägliche Anmeldung. Der Mac und beide lokalen Dienste müssen für neue Abrufe laufen.</p>
        <p>Echtzeit, verzögerte Kurse, Schlusskurse und reine Depotbewertungen werden getrennt gekennzeichnet. Eine Depotbewertung bestätigt keinen aktuellen handelbaren Börsenkurs. Fehlende Kursberechtigungen werden nicht kostenpflichtig ergänzt.</p>
      </div>
    </details>
    {message && <p role="status" className="mt-3 text-sm text-amber-200">{message}</p>}
  </Card>;
}
