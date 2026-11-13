import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { DepotAccountBalance, Portfolio, PortfolioCashBalance } from "@/lib/database.types";
import { isMarginAccount } from "@/lib/portfolio-entry";
import { DepotValue } from "./depot-value";
import { InfoTip } from "./info-tip";
import { formatMoney } from "./risk-indicator";

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
  return <span>{sourceLabel(source)}{at && <> · <Stand at={at} source={source} /></>}</span>;
}

function Stand({ at, source }: { at: string; source: string | null }) {
  const hasTime = source !== "ibkr_flex" && !/T00:00:00(?:\.0+)?(?:Z|\+00:00)$/.test(at);
  return <time dateTime={at}>{(hasTime ? reportTime : reportDate).format(new Date(at))}</time>;
}

function BalanceSummary({ label, rows }: { label: string; rows: Balance[] }) {
  return <div className="py-2.5 first:pt-0 last:pb-0">
    <dt className="text-xs font-medium text-muted">{label}</dt>
    <dd className="mt-1">
      <ul className="space-y-1.5">{rows.map(row => <li key={row.currency} className="flex flex-wrap items-baseline gap-x-2">
        <strong className={`text-base font-semibold tabular-nums ${row.amount < 0 ? "negative-number" : ""}`}>{formatMoney(row.amount, row.currency)}</strong>
        <span className="text-xs text-muted"><Stand at={row.observed_at} source={row.source} /></span>
      </li>)}</ul>
    </dd>
  </div>;
}

function BalanceDetails({ label, rows }: { label: string; rows: Balance[] }) {
  return <div>
    <dt className="text-xs font-medium text-foreground">{label}</dt>
    <dd className="mt-1.5">
      <ul className="space-y-2">{rows.map(row => <li key={row.currency}>
        <span className="mr-2 tabular-nums text-foreground">{formatMoney(row.amount, row.currency)}</span>
        <Source source={row.source} at={row.observed_at} />
        {row.settled !== null && <div>Bereits abgerechnet {formatMoney(row.settled, row.currency)}</div>}
      </li>)}</ul>
    </dd>
  </div>;
}

export function AccountBalancesPanel({ portfolio, balances, legacyCash, unavailable = false }: {
  portfolio: Portfolio;
  balances: DepotAccountBalance[];
  legacyCash: PortfolioCashBalance[];
  unavailable?: boolean;
}) {
  const marginAccount = isMarginAccount(portfolio.account_type);
  const cashAccount = portfolio.account_type === "cash_account";
  const valueLabel = marginAccount ? "Nettoliquidität" : "Depotwert";
  const cashLabel = cashAccount ? "Verrechnungskonto" : "Cashbestand";
  const payoutLabel = cashAccount ? "Auszahlbar" : "Auszahlbar ohne Kredit";
  const totals = balances.filter(row => row.kind === "cash_total");
  const byCurrency = balances.filter(row => row.kind === "cash_currency");
  const currencyDetails = byCurrency.length || totals.length ? byCurrency : legacyCash
    .filter(row => row.source_type !== "demo" && row.source_type !== "legacy")
    .map(row => ({ currency: row.currency, amount: row.balance_native, settled: row.settled_cash_native, observed_at: row.balance_as_of, source: row.source_type }));
  const cash = totals.length ? totals : currencyDetails;
  const payouts = balances.filter(row => row.kind === "withdrawable");
  const hasSecondary = cash.length > 0 || payouts.length > 0;
  return <section id="depotwert" aria-label="Kontowerte" className="surface mb-6">
    <div className={hasSecondary ? "grid gap-4 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] sm:gap-6" : undefined}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-medium text-muted">{valueLabel}</h2>
          <InfoTip label={valueLabel}>Gesamtwert aus Wertpapieren und Cash abzüglich Verbindlichkeiten. Die App verwendet diesen Wert für das Risikobudget und die Positionsgröße.</InfoTip>
        </div>
        {portfolio.net_liquidity !== null ? <>
          <p className={`mt-1 break-words text-[clamp(1.9rem,5vw,2.65rem)] leading-tight font-semibold tracking-tight tabular-nums ${portfolio.net_liquidity < 0 ? "negative-number" : ""}`}>
            {formatMoney(portfolio.net_liquidity, portfolio.currency)}
          </p>
          <p className="mt-1 text-xs text-muted"><Source source={portfolio.net_liquidity_source} at={portfolio.data_as_of} /></p>
        </> : <div className="mt-2 flex flex-wrap items-start gap-x-5 gap-y-2">
          <Link className="text-sm font-semibold text-accent hover:underline" href="/import?via=kontowerte">Kontowerte importieren</Link>
          <DepotValue key={portfolio.id} portfolio={portfolio} inline />
        </div>}
      </div>
      {hasSecondary && <dl className="min-w-0 divide-y divide-border border-t border-border pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5">
        {cash.length > 0 && <BalanceSummary label={cashLabel} rows={cash} />}
        {payouts.length > 0 && <BalanceSummary label={payoutLabel} rows={payouts} />}
      </dl>}
    </div>
    <details className="group mt-4 border-t border-border pt-2.5 text-xs text-muted">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 py-1 font-medium hover:text-foreground [&::-webkit-details-marker]:hidden">
        Kontodetails <ChevronDown aria-hidden="true" size={14} className="group-open:rotate-180" />
      </summary>
      <div className="mt-3 space-y-3">
        {unavailable && <p role="status">Zusätzliche Kontowerte konnten gerade nicht geladen werden.</p>}
        {hasSecondary && <dl className="grid gap-4 md:grid-cols-2">
          {totals.length > 0 && <BalanceDetails label={cashLabel + " gesamt"} rows={totals} />}
          {currencyDetails.length > 0 && <BalanceDetails label={cashLabel + " nach Währung"} rows={currencyDetails} />}
          {payouts.length > 0 && <BalanceDetails label={payoutLabel} rows={payouts} />}
        </dl>}
        {cash.length === 0 && !unavailable && <p>Für dieses Depot liegt noch kein Cashsaldo vor.</p>}
        {portfolio.net_liquidity !== null && <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link className="text-sm font-medium text-accent hover:underline" href="/import?via=kontowerte">Kontowerte importieren</Link>
          <DepotValue key={portfolio.id} portfolio={portfolio} inline />
        </div>}
      </div>
    </details>
  </section>;
}
