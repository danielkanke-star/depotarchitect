import { CsvImporter } from "@/components/csv-importer";
import { JournalImporter } from "@/components/journal-importer";
import { ImportSourceSummary } from "@/components/import-source-summary";
import { PageHeader } from "@/components/ui";
import { getPortfolioData } from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";

export default async function ImportPage() {
  const { portfolio, categories, positions, journalAvailable } = await getPortfolioData();
  const supabase = await createClient();
  const { data: imports, error } = await supabase
    .from("portfolio_imports")
    .select("*")
    .eq("portfolio_id", portfolio.id)
    .order("imported_at", { ascending: false })
    .limit(20);

  if (error) throw new Error("Die Importhistorie konnte nicht geladen werden.");

  return <>
    <PageHeader
      eyebrow="Optionaler Dateiimport"
      title="Depotjournal übernehmen"
      description="Die bisherige Tabelle einschließlich abgeschlossener Trades als Ausgangspunkt übernehmen."
    />
    <ImportSourceSummary imported={imports[0] ?? null} />
    <JournalImporter baseCurrency={portfolio.currency} available={journalAvailable} currentCount={positions.length} />
    <details className="mt-6"><summary className="cursor-pointer text-sm text-muted">Bisheriger CSV-Snapshotimport</summary><p className="my-3 text-sm text-amber-200">Dieser Import ersetzt offene Snapshotpositionen. Sobald Verkaufshistorie vorhanden ist, schützt das Journal diese vor dem Ersetzen. Für die Erstübernahme der Google-Tabelle den Journalimport oben verwenden.</p><CsvImporter
      currentPositionCount={positions.filter((position) => position.status !== "closed").length}
      categoryNames={categories.map((category) => category.name)}
      baseCurrency={portfolio.currency}
      imports={imports}
    /></details>
  </>;
}
