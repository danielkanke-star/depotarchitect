import { Card, PageHeader } from "@/components/ui";
import { getPortfolioData } from "@/lib/portfolio";
import { saveSettings } from "./actions";

export default async function EinstellungenPage() {
  const { portfolio, settings, categories } = await getPortfolioData();
  return <><PageHeader eyebrow="Konfiguration" title="Einstellungen" description="Depotweite Quelldaten und spätere Risikogrenzen getrennt pflegen." /><div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]"><Card><form action={saveSettings} className="grid gap-3 sm:grid-cols-2"><label>Nettoliquidität · Quelldatum<input name="net_liquidity" defaultValue={portfolio.net_liquidity ?? ""} /></label><label>Cash / Barbestand · Quelldatum<input name="cash_balance" defaultValue={portfolio.cash_balance ?? ""} /></label><label>Basiswährung<input name="currency" maxLength={3} defaultValue={portfolio.currency} /></label><label>Datenzeitpunkt<input type="datetime-local" name="data_as_of" defaultValue={toDateTimeLocal(portfolio.data_as_of)} /></label><label>Risikoprofil<input name="risk_profile" defaultValue={portfolio.risk_profile} /></label><label>Risiko je Trade (%)<input name="risk_per_trade_pct" defaultValue={settings.risk_per_trade_pct} /></label><label>Maximale Margin (%)<input name="max_margin_pct" defaultValue={settings.max_margin_pct} /></label><label>Maximale Position (%)<input name="max_position_pct" defaultValue={settings.max_position_pct} /></label><label>Maximaler Sektor (%)<input name="max_sector_pct" defaultValue={settings.max_sector_pct} /></label><label>Maximaler Drawdown (%)<input name="max_drawdown_pct" defaultValue={settings.max_drawdown_pct} /></label><div className="sm:col-span-2 rounded-xl border border-border/70 bg-background/30 p-3 text-xs text-muted">Margin-Auslastung wird aus den Positions-Marginwerten berechnet. Eine Risikobudget-Auslastung wird erst nach fachlicher Definition in Meilenstein 2D eingeführt.</div><div className="sm:col-span-2"><button className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-[#062218]">Einstellungen speichern</button></div></form></Card><Card><h2 className="font-medium">Kategorien</h2><div className="mt-4 space-y-2">{categories.map((category) => <div key={category.id} className="rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm">{category.name}</div>)}</div><p className="mt-4 text-xs leading-5 text-muted">Das Umbenennen und Ergänzen von Kategorien folgt als eigener Bearbeitungsschritt.</p></Card></div></>;
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
