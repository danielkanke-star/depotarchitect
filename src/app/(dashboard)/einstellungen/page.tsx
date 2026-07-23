import { Card, PageHeader } from "@/components/ui";
import { calculateCashPortfolio } from "@/lib/calculations/cash-calculations";
import { calculationExplanation } from "@/lib/calculations/calculation-provenance";
import { getPortfolioData } from "@/lib/portfolio";
import { isBaseCurrencyLocked } from "@/lib/portfolio-write-policy";
import { deleteCashBalance, saveCashBalance, saveSettings } from "./actions";

export default async function EinstellungenPage() {
  const { portfolio, settings, categories, positions, cashBalances } = await getPortfolioData();
  const baseCurrencyLocked = isBaseCurrencyLocked(positions.length, cashBalances.length);
  const money = new Intl.NumberFormat("de-DE", { style: "currency", currency: portfolio.currency, maximumFractionDigits: 2 });
  const cash = calculateCashPortfolio(cashBalances.map((balance) => ({
    id: balance.id,
    currency: balance.currency,
    baseCurrency: portfolio.currency,
    balanceNative: balance.balance_native,
    currentFxToBase: balance.current_fx_to_base,
  })));

  return <>
    <PageHeader eyebrow="Konfiguration" title="Einstellungen" description="Depotweite Quelldaten, Cash nach Währungen und spätere Risikogrenzen getrennt pflegen." />
    <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
      <Card>
        <form action={saveSettings} className="grid gap-3 sm:grid-cols-2">
          <label>Nettoliquidität · Quelldatum<input name="net_liquidity" defaultValue={portfolio.net_liquidity ?? ""} /></label>
          <label>Basiswährung<input name="currency" maxLength={3} defaultValue={portfolio.currency} readOnly={baseCurrencyLocked} aria-readonly={baseCurrencyLocked} /></label>
          <label>Datenzeitpunkt<input type="datetime-local" name="data_as_of" defaultValue={toDateTimeLocal(portfolio.data_as_of)} /></label>
          <label>Risikoprofil<input name="risk_profile" defaultValue={portfolio.risk_profile} /></label>
          <label>Risiko je Trade (%)<input name="risk_per_trade_pct" defaultValue={settings.risk_per_trade_pct} /></label>
          <label>Maximale Margin (%)<input name="max_margin_pct" defaultValue={settings.max_margin_pct} /></label>
          <label>Maximale Position (%)<input name="max_position_pct" defaultValue={settings.max_position_pct} /></label>
          <label>Maximaler Sektor (%)<input name="max_sector_pct" defaultValue={settings.max_sector_pct} /></label>
          <label>Maximaler Drawdown (%)<input name="max_drawdown_pct" defaultValue={settings.max_drawdown_pct} /></label>
          <div className="sm:col-span-2 rounded-xl border border-border/70 bg-background/30 p-3 text-xs text-muted">
            NetLiq bleibt ein eigenständiges Quelldatum. Das alte Einzel-Cashfeld wird nur noch zur Rückwärtskompatibilität gespeichert und hier nicht mehr bearbeitet.
          </div>
          {baseCurrencyLocked && <div className="sm:col-span-2 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100">
            Die Basiswährung ist schreibgeschützt, solange Positionen oder Währungs-Cashbestände vorhanden sind. Eine spätere Änderung benötigt einen kontrollierten Migrations- und Neubewertungsvorgang für Positionen, Cash, FX, Margin und Risiko.
          </div>}
          <div className="sm:col-span-2"><button className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-[#062218]">Einstellungen speichern</button></div>
        </form>
      </Card>
      <Card>
        <h2 className="font-medium">Kategorien</h2>
        <div className="mt-4 space-y-2">{categories.map((category) => <div key={category.id} className="rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm">{category.name}</div>)}</div>
        <p className="mt-4 text-xs leading-5 text-muted">Kategorie und Strategie gehören an die DepotArchitect-Teilposition, nicht dauerhaft an den Ticker-Gesamtbestand.</p>
      </Card>
    </div>

    <Card className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-medium">Cashbestände nach Währungen</h2><p className="mt-1 text-xs text-muted">Negative Salden sind zulässig. Cash beeinflusst NetLiq, wird aber nicht zum Wertpapier-Bruttomarktwert oder NetLiq-Hebel addiert.</p></div>
        <div className="text-right"><div className="text-xs text-muted">Gesamtcash in {portfolio.currency}</div><div className="text-xl font-semibold">{cash.totalCashBase.value === null ? "Nicht berechenbar" : money.format(cash.totalCashBase.value)}</div><div className="text-[11px] text-muted">{calculationExplanation(cash.totalCashBase.status, cash.totalCashBase.reasons)}</div></div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-left text-xs text-muted"><tr><th className="pb-3">Währung</th><th>Saldo</th><th>FX zur Basis</th><th>Wert Basiswährung</th><th>Stand</th><th>Quelle</th><th></th></tr></thead>
          <tbody>{cashBalances.map((balance) => <tr key={balance.id} className="border-t border-border/60">
            <td className="py-3 font-medium">{balance.currency}</td>
            <td>{new Intl.NumberFormat("de-DE", { maximumFractionDigits: 8 }).format(balance.balance_native)}</td>
            <td>{balance.current_fx_to_base ?? "fehlt"}</td>
            <td>{balance.value_base === null ? "Nicht berechenbar" : money.format(balance.value_base)}</td>
            <td className="text-xs text-muted">{formatDateTime(balance.balance_as_of)}</td>
            <td className="text-xs text-muted">{balance.source_type}</td>
            <td><form action={deleteCashBalance}><input type="hidden" name="id" value={balance.id} /><button className="text-xs text-red-300">Löschen</button></form></td>
          </tr>)}</tbody>
        </table>
      </div>
      <form action={saveCashBalance} className="mt-5 grid gap-3 border-t border-border/60 pt-5 sm:grid-cols-2 xl:grid-cols-4">
        <label>Währung<input name="cash_currency" maxLength={3} required placeholder="USD" /></label>
        <label>Cashsaldo<input name="balance_native" inputMode="decimal" required placeholder="-1000,00" /></label>
        <label>Davon settled · optional<input name="settled_cash_native" inputMode="decimal" /></label>
        <label>Aktueller FX zur Basis<input name="current_fx_to_base" inputMode="decimal" placeholder="Basiswährung automatisch 1" /></label>
        <label>Cashstand<input type="datetime-local" name="balance_as_of" required /></label>
        <label>FX-Stand<input type="datetime-local" name="fx_as_of" /></label>
        <div className="sm:col-span-2 flex items-end"><button className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-[#062218]">Manuellen Cashbestand speichern</button></div>
      </form>
    </Card>
  </>;
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
