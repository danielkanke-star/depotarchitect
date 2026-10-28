"use client";
import { useActionState } from "react";
import { saveSettingsWithFeedback } from "@/app/(dashboard)/einstellungen/actions";
import type { Portfolio, PortfolioSettings } from "@/lib/database.types";
import { TRADING_PROFILES, depotRiskBudget, berlinDateTime } from "@/lib/risk-rules";
import { formatMoney } from "./risk-indicator";

export function SettingsForm({ portfolio, settings, locked }: { portfolio: Portfolio; settings: PortfolioSettings; locked: boolean }) {
  const [state, action, pending] = useActionState(saveSettingsWithFeedback, { message: "", ok: false });
  return <form action={action} className="grid gap-3 sm:grid-cols-2">
    <label>Nettoliquidität<input name="net_liquidity" inputMode="decimal" defaultValue={portfolio.net_liquidity ?? ""} /></label>
    <label>Kontomodell<select name="account_type" defaultValue={portfolio.account_type}><option value="cash_account">Cash-Konto</option><option value="margin_account">Margin-Konto</option><option value="portfolio_margin_account">Portfolio-Margin-Konto</option><option value="other">Sonstiges</option></select></label>
    <label>Basiswährung<input name="currency" maxLength={3} defaultValue={portfolio.currency} readOnly={locked} /></label>
    <label>Datenzeitpunkt · Berlin<input type="datetime-local" name="data_as_of" defaultValue={portfolio.data_as_of ? berlinDateTime(portfolio.data_as_of) : ""} /></label>
    <label>Trading-Profil<select name="risk_profile" defaultValue={portfolio.risk_profile}>{Object.keys(TRADING_PROFILES).map(p => <option key={p}>{p}</option>)}</select></label>
    <label>Standardrisiko je neuem Trade (%)<input name="risk_per_trade_pct" type="number" min="0.001" max="100" step="any" defaultValue={settings.risk_per_trade_pct} required /></label>
    <label>Hinweisgrenze Margin / NetLiq (%)<input name="max_margin_pct" type="number" min="0.01" max="100" step="any" defaultValue={settings.max_margin_pct} required /></label>
    <label>Basisgrenze Wertpapier / NetLiq (%)<input name="max_position_pct" type="number" min="0.01" max="100" step="any" defaultValue={settings.max_position_pct} required /></label>
    <div className="sm:col-span-2 rounded-xl border border-border p-3 text-sm">Depotrisikobudget aktuell: {formatMoney(depotRiskBudget(portfolio.net_liquidity, portfolio.risk_profile), portfolio.currency)}<p className="mt-1 text-xs text-muted">NetLiq × 33 % × Profilfaktor. Die Konzentrationsgrenze wird ebenfalls mit dem Profilfaktor gewichtet. Das Standardrisiko je Trade ist eine eigene Eingabe im Positionsgrößenrechner.</p></div>
    {locked && <p className="sm:col-span-2 text-xs text-muted">Die Basiswährung ist bei vorhandenen Positionen oder Cashbeständen festgelegt.</p>}
    <button disabled={pending} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-[#062218] disabled:opacity-50">{pending ? "Wird gespeichert …" : "Einstellungen speichern"}</button>
    {state.message && <p role="status" className="self-center text-sm text-amber-200">{state.message}</p>}
  </form>;
}
