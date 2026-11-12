import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CsvImporter } from "@/components/csv-importer";
import { JournalImporter } from "@/components/journal-importer";
import { PageHeader } from "@/components/ui";
import { FlexConnectionForm, IntakeChoices, NewDepotForm, TradeFileImport } from "@/components/depot-intake";
import { getPortfolioData } from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";
import { flexConfiguration, type FlexStatus } from "@/lib/ibkr/flex-sync";

export const maxDuration = 60;

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ via?: string }> }) {
  const { via } = await searchParams;
  const { portfolio, categories, positions, journalAvailable } = await getPortfolioData();
  const supabase = await createClient();
  const [{ data: imports }, { data: connection }] = await Promise.all([
    supabase.from("portfolio_imports").select("*").eq("portfolio_id", portfolio.id).order("imported_at", { ascending: false }).limit(20),
    supabase.rpc("ibkr_flex_status", { target_portfolio: portfolio.id }),
  ]);
  const status = connection as unknown as FlexStatus | null;
  const step = via === "broker" || via === "datei";
  return <>
    <PageHeader title={via === "broker" ? "Brokerverbindung" : via === "datei" ? "Dateien importieren" : "Daten hinzufügen"}
      action={step ? <Link href="/import" className="inline-flex items-center gap-2 text-sm text-muted"><ArrowLeft size={16} aria-hidden="true" /> Alle Möglichkeiten</Link> : undefined} />
    <p className="-mt-3 mb-5 text-sm text-muted">Aktives Depot <span className="ml-1 font-medium text-foreground">{portfolio.name} · {portfolio.currency}</span></p>
    {via === "broker" ? <FlexConnectionForm key={portfolio.id} portfolio={portfolio.id} connected={status} available={Boolean(flexConfiguration())}
      hasPositions={positions.length > 0} currency={portfolio.currency} />
      : via === "datei" ? <TradeFileImport key={portfolio.id} portfolio={portfolio.id} hasPositions={positions.length > 0} />
      : <IntakeChoices connected={Boolean(status)} />}
    <div className="mt-5"><NewDepotForm /></div>
    {via !== "broker" && <details className="mt-5 rounded-xl border border-border p-4">
      <summary className="cursor-pointer text-sm font-medium">Importhistorie und frühere Formate</summary>
      {imports?.length ? <ul className="mt-4 divide-y divide-border text-sm">
        {imports.map(record => <li className="flex justify-between gap-2 py-2" key={record.id}><span>{record.original_filename ?? "Import"}</span><time className="text-muted" dateTime={record.imported_at}>{new Date(record.imported_at).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}</time></li>)}
      </ul> : <p className="mt-3 text-sm text-muted">Noch keine Datei importiert.</p>}
      <details className="mt-4"><summary className="cursor-pointer text-sm text-muted">Journal aus früherem Format übernehmen</summary>
        <JournalImporter baseCurrency={portfolio.currency} available={journalAvailable} currentCount={positions.length} />
      </details>
      <details className="mt-4"><summary className="cursor-pointer text-sm text-muted">Bestand aus früherem Format ersetzen</summary>
        <p className="my-3 text-xs text-amber-200">Dieser frühere Import ersetzt offene Snapshotpositionen. Positionen mit Verkaufshistorie sind geschützt.</p>
        <CsvImporter currentPositionCount={positions.filter(position => position.status !== "closed").length}
          categoryNames={categories.map(category => category.name)} baseCurrency={portfolio.currency} imports={imports ?? []} />
      </details>
    </details>}
  </>;
}
