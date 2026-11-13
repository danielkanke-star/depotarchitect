"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { manageCategory } from "@/app/(dashboard)/einstellungen/actions";
import type { PortfolioCategory } from "@/lib/database.types";
import { InfoTip } from "./info-tip";

type Category = PortfolioCategory & { positionCount: number };
const initial = { message: "", ok: false };
const button = "rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:border-accent/60 disabled:opacity-50";

export function CategorySettings({ portfolio, categories }: { portfolio: string; categories: Category[] }) {
  const active = categories.filter(category => category.is_active);
  const archived = categories.filter(category => !category.is_active);
  return <>
    <div className="flex items-center gap-2">
      <h2 className="font-semibold">Kategorien</h2>
      <InfoTip label="Kategorien">Das Ziel zählt unterschiedliche Wertpapiere. Archivierte Kategorien bleiben ihren bisherigen Positionen zugeordnet und erscheinen weiterhin in deren Auswertung.</InfoTip>
    </div>
    <div className="mt-3 divide-y divide-border/75">
      {active.map(category => <CategoryRow key={category.id} category={category} portfolio={portfolio} />)}
      {!active.length && <p className="py-3 text-sm text-muted">Noch keine aktiven Kategorien</p>}
    </div>
    <details className="mt-4 rounded-lg border border-border px-3 py-2.5">
      <summary className="cursor-pointer text-sm font-medium text-accent"><span className="ml-1 inline-flex items-center gap-2"><Plus size={15} aria-hidden="true" /> Kategorie hinzufügen</span></summary>
      <CategoryForm portfolio={portfolio} />
    </details>
    {archived.length > 0 && <details className="mt-4">
      <summary className="cursor-pointer text-sm text-muted">Archiviert ({archived.length})</summary>
      <div className="mt-1 divide-y divide-border/75">
        {archived.map(category => <CategoryRow key={category.id} category={category} portfolio={portfolio} />)}
      </div>
    </details>}
  </>;
}

function CategoryRow({ category, portfolio }: { category: Category; portfolio: string }) {
  const [state, action, pending] = useActionState(manageCategory, initial);
  const used = category.positionCount > 0;
  const operation = category.is_active || !used ? "remove" : "restore";
  const actionLabel = operation === "restore" ? "Aktivieren" : used ? "Archivieren" : "Löschen";
  const goal = category.target_min !== null && category.target_max !== null
    ? category.target_min === category.target_max ? category.target_max : `${category.target_min}–${category.target_max}` : null;
  return <div className="py-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <details className="min-w-36 flex-1">
        <summary className="cursor-pointer text-sm font-medium">{category.name}<span className="ml-2 text-xs font-normal text-muted">{goal !== null ? `Ziel ${goal}` : ""}</span></summary>
        <CategoryForm key={`${category.name}/${category.target_min}/${category.target_max}`} portfolio={portfolio} category={category} />
      </details>
      <form action={action} onSubmit={event => {
        if (operation === "remove" && !used && !window.confirm(`Kategorie „${category.name}“ löschen?`)) event.preventDefault();
      }}>
        <input type="hidden" name="portfolio_id" value={portfolio} />
        <input type="hidden" name="category_id" value={category.id} />
        <input type="hidden" name="operation" value={operation} />
        <button className={button} disabled={pending} aria-label={`${category.name} ${actionLabel.toLowerCase()}`}>{actionLabel}</button>
      </form>
    </div>
    <Feedback state={state} />
  </div>;
}

function CategoryForm({ portfolio, category }: { portfolio: string; category?: Category }) {
  const [state, action, pending] = useActionState(manageCategory, initial);
  return <form action={action} className="mt-3 space-y-3">
    <input type="hidden" name="portfolio_id" value={portfolio} />
    <input type="hidden" name="operation" value={category ? "edit" : "create"} />
    {category && <input type="hidden" name="category_id" value={category.id} />}
    <label>Name<input name="name" maxLength={60} required defaultValue={category?.name} placeholder="z. B. Dividenden" /></label>
    <details open={category?.target_max != null || undefined} className="text-xs text-muted">
      <summary className="cursor-pointer">Zielzahl für Wertpapiere</summary>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label>Von<input name="target_min" type="number" min="0" max="1000" step="1" defaultValue={category?.target_min ?? ""} /></label>
        <label>Bis<input name="target_max" type="number" min="1" max="1000" step="1" defaultValue={category?.target_max ?? ""} /></label>
      </div>
    </details>
    <div className="flex flex-wrap items-center gap-3">
      <button className={button} disabled={pending}>{category ? "Kategorie speichern" : "Hinzufügen"}</button>
      <Feedback state={state} />
    </div>
  </form>;
}

function Feedback({ state }: { state: typeof initial }) {
  return state.message ? <p role={state.ok ? "status" : "alert"} className={`mt-1 text-xs ${state.ok ? "text-accent" : "text-amber-200"}`}>{state.message}</p> : null;
}
