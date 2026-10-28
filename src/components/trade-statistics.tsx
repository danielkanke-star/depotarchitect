import { Card } from "./ui";
import { formatMoney, formatRatio } from "./risk-indicator";
import type { calculateJournal } from "@/lib/journal";

export function TradeStatistics({ journal, currency, categoryNames = {} }: { journal: ReturnType<typeof calculateJournal>; currency: string; categoryNames?: Record<string, string> }) {
  const results = journal.trades.filter(t => t.closed || t.hasSales).sort((a,b) => (b.closeDate ?? b.entryDate ?? "").localeCompare(a.closeDate ?? a.entryDate ?? ""));
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Realisierter Kurs-G&V vor Kosten" value={formatMoney(journal.realized, currency)} note={journal.realizedComplete ? "Alle erfassten Verkäufe" : "Teilsumme · historische FX fehlen"} />
      <Metric label="Marginrendite vor Kosten" value={formatRatio(journal.marginReturn)} note="Geschlossene Trades · Summe G&V / Summe Einstiegsmargin" />
      <Metric label="Trefferquote" value={formatRatio(journal.hitRate)} note={`${journal.wins} Gewinne · ${journal.losses} Verluste · ${journal.flat} Nullergebnisse`} />
      <Metric label="Abgeschlossene Trades" value={String(journal.closedCount)} note={`${journal.incompleteClosedCount} mit unvollständiger Euro-Auswertung`} />
      <Metric label="Ø Gewinn" value={formatMoney(journal.averageWin, currency)} note="Vollständig bewertete Gewinntrades" />
      <Metric label="Ø Verlust" value={formatMoney(journal.averageLoss, currency)} note="Vollständig bewertete Verlusttrades" />
      <Metric label="Ø Haltedauer" value={journal.averageDays === null ? "—" : `${journal.averageDays.toLocaleString("de-DE", { maximumFractionDigits: 1 })} Tage`} note="Einstieg bis letzter Verkauf · Kalenderzeit" />
      <Metric label="Realisierter G&V · letzte 12 Monate" value={formatMoney(journal.rollingRealized, currency)} note={`${journal.cutoff} bis ${journal.today}${journal.rollingComplete ? "" : " · Teilsumme"}`} />
    </div>
    <Card><h2 className="font-medium">Trade-Gruppen und Ergebnisse</h2><p className="mt-2 text-xs leading-5 text-muted">Gleiches Wertpapier, gleiche Richtung, Einstiegstag und Kategorie bilden einen Trade. Teilverkäufe zählen sofort zum realisierten Ergebnis, für die Trefferquote erst nach vollständigem Abschluss. Unvollständige Trades werden aus der Trefferquote ausgeschlossen und separat gezählt.</p>
      {results.length === 0 ? <p className="mt-6 text-sm text-muted">Noch keine Verkäufe erfasst. Abgeschlossene Trades und Teilverkäufe erscheinen hier.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1000px] text-sm"><thead className="text-left text-xs text-muted"><tr><th className="pb-3">Wertpapier / Einstieg</th><th>Kategorie</th><th>Status</th><th>Realisierter G&V</th><th>Einstiegsmargin</th><th>Marginrendite</th><th>Haltedauer</th></tr></thead><tbody>{results.map(t => <tr key={t.key} className="border-t border-border/60"><td className="py-3"><div className="font-medium">{t.ticker}</div><div className="text-xs text-muted">{t.entryDate ?? "Datum unbekannt"}</div></td><td>{categoryNames[t.categoryId ?? ""] ?? "Keine"}</td><td>{t.closed ? "Abgeschlossen" : `${t.remaining.toLocaleString("de-DE")} offen`}</td><td>{formatMoney(t.pnl, currency)}</td><td>{formatMoney(t.margin, currency)}</td><td>{formatRatio(t.marginReturn)}</td><td>{t.days === null ? "—" : `${t.days} Tage`}</td></tr>)}</tbody></table></div>}
      <details className="mt-4 border-t border-border pt-3"><summary className="cursor-pointer text-sm text-muted">Optional: rechnerische p.a.-Hochrechnung</summary><p className="mt-3 text-xs leading-5 text-muted">Rechnerische Hochrechnung einzelner vollständig geschlossener Trades mit nur einem Verkaufstag: (1 + Marginrendite)^(365 / Tage) − 1. Bei mehreren Verkaufstagen, null Tagen oder Verlusten ab 100 % wird kein Wert ausgewiesen. Diese Hochrechnung ist keine gemessene Depotjahresrendite. Gebühren, Finanzierungskosten, Steuern und FX-Wirkung des gesamten Kontos sind nicht enthalten.</p><div className="mt-3 space-y-2">{results.filter(t=>t.annualized!==null).map(t=><div key={t.key} className="flex flex-wrap justify-between gap-3 text-xs"><span>{t.ticker} · {t.entryDate}</span><span>{Math.abs(t.annualized!)>1000 ? `${(t.annualized!*100).toExponential(2)} %` : formatRatio(t.annualized)}</span></div>)}</div></details>
    </Card>
  </div>;
}
function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <Card><div className="text-xs text-muted">{label}</div><div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div><div className="mt-2 text-xs text-muted">{note}</div></Card>;
}
