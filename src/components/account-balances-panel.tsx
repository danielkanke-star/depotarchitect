import Link from "next/link";
import type { DepotAccountBalance, Portfolio, PortfolioCashBalance } from "@/lib/database.types";
import { DepotValue } from "./depot-value";
import { formatMoney } from "./risk-indicator";
import { MetricCard } from "./ui";

const reportDate = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" });
const reportTime = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });

type Balance = {
  currency: string;
  amount: number;
  settled: number | null;
  observed_at: string;
  source: string;
};

function sourceLabel(source: string | null) {
  switch (source) {
    case "ibkr_flex": return "IBKR-Flex-Bericht";
    case "broker_file": return "Kontowerte-Datei";
    case "broker": return "Broker";
    case "custom_csv": return "Dateiimport";
    case "manual": return "Manuell erfasst";
    default: return "Gespeicherter Wert";
  }
}

function Source({ source, at }: { source: string | null; at?: string | null }) {
  const hasTime = at && source !== "ibkr_flex" && !at.endsWith("T00:00:00+00:00") && !at.endsWith("T00:00:00.000Z");
  return <span>{sourceLabel(source)}{at && <> · <time dateTime={at}>{(hasTime ? reportTime : reportDate).format(new Date(at))}</time></>}</span>;
}

function BalanceNotes({ rows }: { rows: Balance[] }) {
  return <ul className="space-y-2">{rows.map(row => <li key={row.currency}>
    {rows.length > 1 && <span>{row.currency} · </span>}
    <Source source={row.source} at={row.observed_at} />
    {row.settled !== null && <div>Abgerechnetes Cash: {formatMoney(row.settled, row.currency)}</div>}
  </li>)}</ul>;
}

function Amounts({ rows, empty }: { rows: Balance[]; empty: string }) {
  return rows.length ? <ul className="space-y-1">{rows.map(row =>
    <li key={row.currency}>{formatMoney(row.amount, row.currency)}</li>,
  )}</ul> : <span className="text-base font-medium text-muted">{empty}</span>;
}

export function AccountBalancesPanel({ portfolio, balances, legacyCash, unavailable = false }: {
  portfolio: Portfolio;
  balances: DepotAccountBalance[];
  legacyCash: PortfolioCashBalance[];
  unavailable?: boolean;
}) {
  const totals = balances.filter(row => row.kind === "cash_total");
  const byCurrency = balances.filter(row => row.kind === "cash_currency");
  const currencyDetails = byCurrency.length || totals.length ? byCurrency : legacyCash
    .filter(row => row.source_type !== "demo" && row.source_type !== "legacy")
    .map(row => ({ currency: row.currency, amount: row.balance_native, settled: row.settled_cash_native, observed_at: row.balance_as_of, source: row.source_type }));
  const cash = totals.length ? totals : currencyDetails;
  const payouts = balances.filter(row => row.kind === "withdrawable");
  return <section aria-label="Kontowerte" className="mb-6">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">Kontowerte</h2>
      <Link className="text-sm font-medium text-accent hover:underline" href="/import?via=kontowerte">Kontowerte importieren</Link>
    </div>
    <div className="grid gap-3 md:grid-cols-3">
      <MetricCard label="Depotwert" value={portfolio.net_liquidity === null ? <span className="text-base font-medium text-muted">Noch kein Wert</span> : formatMoney(portfolio.net_liquidity, portfolio.currency)}
        help="Nettoliquidität des gesamten Kontos einschließlich Wertpapieren, Cash und Verbindlichkeiten."
        note={<div className="space-y-2">
          {portfolio.net_liquidity !== null && <Source source={portfolio.net_liquidity_source} at={portfolio.data_as_of} />}
          <DepotValue key={portfolio.id} portfolio={portfolio} inline />
        </div>} />
      <MetricCard label="Cashbestand" value={<Amounts rows={cash} empty={unavailable ? "Abruf fehlgeschlagen" : "Noch kein Saldo"} />}
        help="Gemeldeter Bargeldsaldo. Ohne gemeldete Gesamtsumme stehen hier die Einzelwährungen."
        note={cash.length > 0 && <div className="space-y-2"><BalanceNotes rows={cash} />
          {totals.length > 0 && currencyDetails.length > 0 && <details>
            <summary className="cursor-pointer text-accent">Nach Währung</summary>
            <ul className="mt-2 space-y-2">{currencyDetails.map(row => <li key={row.currency}>
              <div className="font-medium text-foreground">{formatMoney(row.amount, row.currency)}</div>
              <Source source={row.source} at={row.observed_at} />
              {row.settled !== null && <div>Abgerechnetes Cash: {formatMoney(row.settled, row.currency)}</div>}
            </li>)}</ul>
          </details>}
        </div>} />
      <MetricCard label="Auszahlbar ohne Kredit" value={<Amounts rows={payouts} empty={unavailable ? "Abruf fehlgeschlagen" : "Noch kein Brokerwert"} />}
        help="Betrag, den der Broker zum angegebenen Stand ohne Kredit zur Auszahlung freigegeben hat."
        note={payouts.length > 0 && <BalanceNotes rows={payouts} />} />
    </div>
  </section>;
}
