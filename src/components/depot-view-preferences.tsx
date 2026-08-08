"use client";

import { useCallback, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import {
  DEPOT_VIEW_STORAGE_KEY,
  parseDepotViewPreferences,
  toggleDepotViewPreference,
  type DepotOptionalColumn,
} from "@/lib/depot-view-preferences";

const OPTIONS: Array<{ key: DepotOptionalColumn; label: (baseCurrency: string) => string }> = [
  { key: "baseMarketValue", label: (currency) => `Marktwert ${currency}` },
  { key: "risk", label: () => "Risiko" },
  { key: "margin", label: () => "Margin" },
  { key: "priceDetails", label: () => "Kursdetails" },
];

const PREFERENCES_CHANGED_EVENT = "depotarchitect:depot-columns-changed";

function subscribePreferences(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(PREFERENCES_CHANGED_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(PREFERENCES_CHANGED_EVENT, callback);
  };
}

export function DepotViewPreferences({ baseCurrency, children }: { baseCurrency: string; children: ReactNode }) {
  const memorySnapshot = useRef<string | null>(null);
  const getPreferenceSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(DEPOT_VIEW_STORAGE_KEY) ?? memorySnapshot.current;
    } catch {
      return memorySnapshot.current;
    }
  }, []);
  const storedPreferences = useSyncExternalStore(subscribePreferences, getPreferenceSnapshot, () => null);
  const preferences = useMemo(() => parseDepotViewPreferences(storedPreferences), [storedPreferences]);

  const toggle = (column: DepotOptionalColumn) => {
    const next = toggleDepotViewPreference(preferences, column);
    memorySnapshot.current = JSON.stringify(next);
    try {
      window.localStorage.setItem(DEPOT_VIEW_STORAGE_KEY, memorySnapshot.current);
    } catch {
      // The view still works for this session when browser storage is unavailable.
    }
    window.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT));
  };

  return <div
    data-depot-base-market-value={preferences.baseMarketValue}
    data-depot-risk={preferences.risk}
    data-depot-margin={preferences.margin}
    data-depot-price-details={preferences.priceDetails}
  >
    <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Optionale Depotspalten">
      <span className="mr-1 text-xs text-muted">Ansicht:</span>
      {OPTIONS.map((option) => <button
        key={option.key}
        type="button"
        aria-pressed={preferences[option.key]}
        onClick={() => toggle(option.key)}
        className={`rounded-lg border px-3 py-1.5 text-xs transition ${preferences[option.key] ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground"}`}
      >{option.label(baseCurrency)}</button>)}
    </div>
    {children}
  </div>;
}
