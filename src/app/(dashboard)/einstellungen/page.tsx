import { Card, PageHeader } from "@/components/ui";
import { getPortfolioData } from "@/lib/portfolio";
import { isBaseCurrencyLocked } from "@/lib/portfolio-write-policy";
import { SettingsForm } from "@/components/settings-form";

export default async function EinstellungenPage() {
  const { portfolio, settings, categories, positions, cashBalances } = await getPortfolioData();
  const baseCurrencyLocked = isBaseCurrencyLocked(positions.length, cashBalances.length);

  return <>
    <PageHeader eyebrow="Konfiguration" title="Einstellungen" description="Depot- und Risikoeinstellungen verwalten." />
    <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
      <Card>
        <SettingsForm portfolio={portfolio} settings={settings} locked={baseCurrencyLocked} />
      </Card>
      <Card>
        <h2 className="font-medium">Kategorien</h2>
        <div className="mt-4 space-y-2">{categories.map((category) => <div key={category.id} className="rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm">{category.name}</div>)}</div>
        <p className="mt-4 text-xs leading-5 text-muted">Kategorien werden den einzelnen Positionen zugeordnet.</p>
      </Card>
    </div>
  </>;
}
