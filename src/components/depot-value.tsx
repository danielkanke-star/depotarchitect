"use client";

import { useActionState, useState } from "react";
import { saveDepotValue } from "@/app/(dashboard)/einstellungen/actions";
import type { Portfolio } from "@/lib/database.types";
import { berlinDateTime } from "@/lib/risk-rules";
import { InfoTip } from "./info-tip";

export function DepotValue({ portfolio, inline = false }: { portfolio: Portfolio; inline?: boolean }) {
  const [state, action, pending] = useActionState(saveDepotValue, { message: "", ok: false });
  const [open, setOpen] = useState(false);
  return <div className={inline ? "text-xs" : "rounded-xl border border-border px-4 py-3"}>
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="text-sm font-medium text-accent hover:underline">
      {open ? "Manuelle Eingabe schließen" : portfolio.net_liquidity === null ? "Depotwert erfassen" : "Depotwert manuell erfassen"}
    </button>
    {open && <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="portfolio_id" value={portfolio.id} />
      <div className="flex items-center gap-2 text-xs text-muted">Wert und Zeitpunkt aus deinem Brokerbericht
        <InfoTip label="Nettoliquidität">Der Gesamtwert des Kontos einschließlich Wertpapieren und Cash abzüglich Verbindlichkeiten. Dieser Wert ist die Bezugsgröße für Risikobudget und Positionsgrößen.</InfoTip>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label>Betrag in {portfolio.currency}<input type="number" name="net_liquidity" step="0.01" min="0" inputMode="decimal" required defaultValue={portfolio.net_liquidity ?? ""} /></label>
        <label>Stand (Berlin)<input name="data_as_of" type="datetime-local" required defaultValue={portfolio.net_liquidity_source === "manual" && portfolio.data_as_of ? berlinDateTime(portfolio.data_as_of) : ""} /></label>
      </div>
      <button disabled={pending} className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:border-accent/65 disabled:opacity-50">{pending ? "Wird gespeichert …" : "Depotwert speichern"}</button>
    </form>}
    {state.message && <p role={state.ok ? "status" : "alert"} className={`mt-2 text-xs ${state.ok ? "text-accent" : "text-amber-200"}`}>{state.message}</p>}
  </div>;
}
