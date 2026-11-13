"use client";

import { useActionState, useState } from "react";
import { saveSettingsWithFeedback } from "@/app/(dashboard)/einstellungen/actions";
import type { Portfolio, PortfolioSettings } from "@/lib/database.types";
import { isMarginAccount } from "@/lib/portfolio-entry";
import { TRADING_PROFILES, depotRiskBudget, normalizeTradingProfile, riskReviewLimits } from "@/lib/risk-rules";
import { InfoTip } from "./info-tip";
import { formatMoney, formatRatio } from "./risk-indicator";

export function SettingsForm({ portfolio, settings, locked }: { portfolio: Portfolio; settings: PortfolioSettings; locked: boolean }) {
  const [state, action, pending] = useActionState(saveSettingsWithFeedback, { message: "", ok: false });
  const [accountType, setAccountType] = useState(portfolio.account_type);
  const [profile, setProfile] = useState(portfolio.risk_profile_configured ? normalizeTradingProfile(portfolio.risk_profile) ?? "" : "");
  const [budgetPct, setBudgetPct] = useState(String(settings.risk_budget_pct ?? ""));
  const [concentrationBasis, setConcentrationBasis] = useState(String(settings.max_position_pct));
  const limits = riskReviewLimits(profile, Number(concentrationBasis));
  const budget = depotRiskBudget(portfolio.net_liquidity, budgetPct ? Number(budgetPct) : null);

  return <form action={action} className="space-y-5" id="trading-profil">
    <input type="hidden" name="portfolio_id" value={portfolio.id} />
    <div className="grid gap-3 sm:grid-cols-2">
      <label>Kontoart<select name="account_type" value={accountType} onChange={e => setAccountType(e.target.value as Portfolio["account_type"])}>
        <option value="other">Nicht festgelegt</option><option value="cash_account">Cash-Konto</option><option value="margin_account">Margin-Konto</option><option value="portfolio_margin_account">Portfolio-Margin-Konto</option>
      </select></label>
      <label>Depotwährung<input name="currency" maxLength={3} minLength={3} required defaultValue={portfolio.currency} readOnly={locked} /></label>
    </div>
    <fieldset className="border-t border-border pt-4">
      <legend className="sr-only">Trading-Profil</legend>
      <div className="mb-1 flex items-center gap-2">
        <h2 className="font-semibold">Trading-Profil</h2>
        <InfoTip label="Trading-Profil">Das Profil legt fest, ab wann Stopprisiko und große Einzelpositionen auffallen. Wähle die Einstellung passend zu deinem Anlageziel und dazu, welche Verluste du tragen kannst.</InfoTip>
      </div>
      <p className="mb-3 text-sm text-muted">Wie früh möchtest du auf erhöhte Risiken hingewiesen werden?</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {Object.keys(TRADING_PROFILES).map(name => <label key={name} className="cursor-pointer">
          <input className="peer sr-only" type="radio" name="risk_profile" value={name} checked={profile === name} onChange={() => setProfile(name)} required />
          <span className="flex h-full min-h-10 items-center justify-center rounded-lg border border-border px-2 py-2 text-center text-xs font-medium peer-checked:border-accent/65 peer-checked:bg-accent/10 peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent">{name}</span>
        </label>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-background/50 px-3 py-2.5 text-xs text-muted">
        {limits ? <>
          <span>Stopprisiko ab <strong className="font-semibold text-foreground">{formatRatio(limits.watch)}</strong></span>
          {concentrationBasis && Number(concentrationBasis) > 0 && <span>Einzelwert ab <strong className="font-semibold text-foreground">{formatRatio(limits.concentration)}</strong></span>}
          <InfoTip label="Hinweisgrenzen">Die Prozente beziehen sich auf die Nettoliquidität. Der Hinweis für einen großen Einzelwert bleibt auch bei kleinem Stopprisiko sichtbar. Stopps können bei Kurslücken schlechter ausgeführt werden.</InfoTip>
        </> : "Profil wählen, um die Hinweisgrenzen zu sehen."}
      </div>
    </fieldset>
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label>Risiko je neuem Trade (%)<input name="risk_per_trade_pct" type="number" min="0.001" max="100" step="0.001" defaultValue={settings.risk_per_trade_pct} required /></label>
        <p className="mt-1 text-xs text-muted">Startwert im Positionsgrößenrechner</p>
      </div>
      <div>
        <label>Budget für offenes Stopprisiko (%)<input name="risk_budget_pct" type="number" min="0.01" max="100" step="0.01" value={budgetPct} onChange={e => setBudgetPct(e.target.value)} placeholder="Optional" /></label>
        <p className="mt-1 text-xs text-muted">{budget !== null ? `${formatMoney(budget, portfolio.currency)} für offene Positionen` : "Anteil am Depotwert für offene Positionen"}</p>
      </div>
    </div>
    <details className="rounded-lg border border-border px-3 py-2.5">
      <summary className="cursor-pointer text-sm font-medium">Weitere Hinweisgrenzen</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>Basisgrenze Einzelwert (%)<input name="max_position_pct" type="number" min="0.01" max="100" step="0.01" value={concentrationBasis} onChange={e => setConcentrationBasis(e.target.value)} required /></label>
        {isMarginAccount(accountType) && <label>Margin-Warnschwelle (%)<input key={accountType} name="max_margin_pct" type="number" min="0.01" max="100" step="0.01" defaultValue={settings.max_margin_pct} required /></label>}
      </div>
      {isMarginAccount(accountType) && <p className="mt-2 text-xs text-muted">Persönlicher Hinweis zur Margin-Auslastung. Die Brokeranforderung kommt vom Broker.</p>}
    </details>
    <div className="flex flex-wrap items-center gap-3">
      <button disabled={pending} className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#062218] disabled:opacity-50">{pending ? "Wird gespeichert …" : "Einstellungen speichern"}</button>
      {state.message && <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-accent" : "text-amber-200"}`}>{state.message}</p>}
    </div>
  </form>;
}
