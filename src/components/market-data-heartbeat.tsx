"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { refreshActiveMarketData } from "@/app/(dashboard)/depot/actions";

const ACTIVE_REFRESH_TICK_MS = 12_000;
type RefreshStatus = Awaited<ReturnType<typeof refreshActiveMarketData>>["status"];

export function MarketDataHeartbeat() {
  const pendingRef = useRef(false);
  const stoppedRef = useRef(false);
  const [status, setStatus] = useState<RefreshStatus | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible" || pendingRef.current || stoppedRef.current) return;
      pendingRef.current = true;
      startTransition(() => {
        void refreshActiveMarketData().then((result) => {
          setStatus(result.status);
          if (["schema-pending", "provider-disabled", "budget", "rate-limited"].includes(result.status)) stoppedRef.current = true;
        }).catch(() => {
          setStatus("error");
        }).finally(() => { pendingRef.current = false; });
      });
    };
    refresh();
    const interval = window.setInterval(refresh, ACTIVE_REFRESH_TICK_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const message = marketDataStatusMessage(status);
  return message ? <div role="status" aria-live="polite" className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
    <span className="font-medium">Aktuelle Kurse:</span> {message}
  </div> : null;
}

function marketDataStatusMessage(status: RefreshStatus | null) {
  switch (status) {
    case "provider-disabled":
      return "Twelve Data ist in dieser Umgebung noch nicht serverseitig aktiviert. Bis dahin bleibt der zuletzt gespeicherte manuelle oder importierte Kurs sichtbar.";
    case "schema-pending":
      return "Die additive Kursdatenbank-Migration fehlt in dieser Umgebung. Es werden keine bestehenden Depotdaten verändert.";
    case "mapping-required":
      return "Mindestens eine bestehende Position hat noch keine eindeutige Notierung. Bitte im Depot einmal „Kurs aktualisieren“ oder beim Bearbeiten „Unternehmen & Kurs suchen“ verwenden.";
    case "budget":
      return "Das reservierte kostenlose Tagesbudget ist erreicht. Vorhandene Kurse bleiben sichtbar; es entstehen keine automatischen Zusatzkosten.";
    case "rate-limited":
      return "Der Anbieter begrenzt die Abfragen vorübergehend. Der nächste Versuch erfolgt später; vorhandene Kurse bleiben sichtbar.";
    case "stale":
    case "error":
      return "Die Kursquelle war vorübergehend nicht verfügbar. Vorhandene Kurse bleiben sichtbar und werden beim nächsten sicheren Versuch erneut geprüft.";
    default:
      return null;
  }
}
