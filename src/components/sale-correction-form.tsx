"use client";
import { useActionState } from "react";
import { correctSale } from "@/app/(dashboard)/depot/journal-actions";
import type { PositionSale } from "@/lib/database.types";
import { berlinDate } from "@/lib/risk-rules";

export function SaleCorrectionForm({ sale, entryDate, currency, baseCurrency }: { sale: PositionSale; entryDate: string | null; currency: string; baseCurrency: string }) {
  const [state, action, pending] = useActionState(correctSale, { ok: false, message: "" });
  return <details className="mt-2"><summary className="cursor-pointer text-xs text-accent">Verkauf vom {sale.sale_date} korrigieren</summary><form action={action} className="mt-3 grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2 lg:grid-cols-4">
    <input type="hidden" name="sale_id" value={sale.id} />
    <label>Menge<input name="quantity" type="number" min="0.000001" step="any" defaultValue={sale.quantity} required /></label>
    <label>Kurs · {currency}<input name="price" type="number" min="0" step="any" defaultValue={sale.price} required /></label>
    <label>Verkaufsdatum<input name="sale_date" type="date" min={entryDate ?? undefined} max={berlinDate()} defaultValue={sale.sale_date} required /></label>
    <label>Historischer Wechselkurs · 1 {currency} in {baseCurrency}<input name="fx_to_base" type="number" min="0.000000001" step="any" readOnly={currency === baseCurrency} defaultValue={currency === baseCurrency ? 1 : sale.fx_to_base ?? ""} /></label>
    <label className="sm:col-span-2">Grund der Korrektur<input name="reason" minLength={3} maxLength={500} required placeholder="Zum Beispiel Wechselkurs beim Verkauf ergänzt" /></label>
    <button disabled={pending || state.ok} className="self-end rounded-xl border border-accent px-4 py-2 text-sm text-accent disabled:opacity-50">{pending ? "Wird gespeichert …" : state.ok ? "Korrigiert" : "Korrektur speichern"}</button>
    {state.message && <p role="status" className="sm:col-span-2 lg:col-span-4 text-sm text-amber-200">{state.message}</p>}
  </form></details>;
}
