import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { getPortfolioData } from "@/lib/portfolio";
import { isBaseCurrencyLocked } from "@/lib/portfolio-write-policy";
import { CategorySettings } from "@/components/category-settings";
import { SettingsForm } from "@/components/settings-form";
import { IbkrConnection } from "@/components/ibkr-connection";

export default async function EinstellungenPage() {
  const { portfolio, settings, categories, positions, cashBalances, capitalMovements } = await getPortfolioData();
  const baseCurrencyLocked = isBaseCurrencyLocked(positions.length, cashBalances.length) || portfolio.net_liquidity !== null || capitalMovements.length > 0;
  const counts = new Map<string, number>();
  for (const position of positions) if (position.category_id) counts.set(position.category_id, (counts.get(position.category_id) ?? 0) + 1);

  return <>
    <PageHeader eyebrow="Konfiguration" title="Einstellungen" description="Depot- und Risikoeinstellungen verwalten." />
    <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
      <Card>
        <SettingsForm key={portfolio.id} portfolio={portfolio} settings={settings} locked={baseCurrencyLocked} />
      </Card>
      <Card>
        <CategorySettings key={portfolio.id} portfolio={portfolio.id}
          categories={categories.map(category => ({ ...category, positionCount: counts.get(category.id) ?? 0 }))} />
      </Card>
    </div>
    <Card className="mt-4"><div className="flex items-center justify-between gap-4"><h2 className="font-medium">Brokerberichte</h2><Link href="/import?via=broker" className="text-sm text-accent">Verbindung verwalten</Link></div></Card>
    <details className="mt-4"><summary className="mb-3 cursor-pointer text-sm text-muted">Lokaler IBKR-Kursdienst</summary><IbkrConnection /></details>
  </>;
}
