"use client";

import { useEffect, useRef } from "react";
import { refreshActiveMarketData } from "@/app/(dashboard)/depot/actions";

const ACTIVE_REFRESH_TICK_MS = 12_000;

export function MarketDataHeartbeat() {
  const pendingRef = useRef(false);
  const stoppedRef = useRef(false);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible" || pendingRef.current || stoppedRef.current) return;
      pendingRef.current = true;
      void refreshActiveMarketData().then((result) => {
        if (["schema-pending", "provider-disabled", "budget", "rate-limited"].includes(result.status)) stoppedRef.current = true;
      }).finally(() => { pendingRef.current = false; });
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

  return null;
}
