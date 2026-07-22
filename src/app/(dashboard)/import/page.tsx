import { CsvImporter } from "@/components/csv-importer";
import { PageHeader } from "@/components/ui";
import { getPortfolioData } from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";

export default async function ImportPage() {
  const { portfolio, categories, positions } = await getPortfolioData();
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
      title="Benutzerdefinierte CSV"
      description="Optionaler manueller Dateiimport. Die spätere automatische Brokeranbindung ist hiervon getrennt."
    />
    <CsvImporter
      currentPositionCount={positions.length}
      categoryNames={categories.map((category) => category.name)}
      imports={imports}
    />
  </>;
}
