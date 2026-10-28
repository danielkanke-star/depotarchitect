"use client";
import { useActionState, useState } from "react";
import { recordSale } from "@/app/(dashboard)/depot/journal-actions";
import { berlinDate } from "@/lib/risk-rules";

type Props = { id: string; remaining: number; currency: string; baseCurrency: string; entryDate: string | null; requestId: string };
export function SaleForm(props: Props) {
  const [requestId, setRequestId] = useState(props.requestId);
  return <SaleEntry key={requestId} {...props} requestId={requestId} onAgain={() => setRequestId(crypto.randomUUID())} />;
}
function SaleEntry({ id, remaining, currency, baseCurrency, entryDate, requestId, onAgain }: Props & { onAgain: () => void }) {
  const [state, action, pending] = useActionState(recordSale, { ok: false, message: "" });
  const [quantity, setQuantity] = useState("");
  const after = remaining - Number(quantity);
  return <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <input type="hidden" name="position_id" value={id} /><input type="hidden" name="request_id" value={requestId} />
    <label>Verkaufte Menge · offen {remaining}<input name="quantity" type="number" min="0.000001" max={remaining} step="any" value={quantity} onChange={e=>setQuantity(e.target.value)} required /></label>
    <label>Verkaufskurs · {currency}<input name="price" type="number" min="0" step="any" required /></label>
    <label>Tatsächliches Verkaufsdatum<input name="sale_date" type="date" min={entryDate ?? undefined} max={berlinDate()} required /></label>
    {currency !== baseCurrency && <label>Wechselkurs beim Verkauf · 1 {currency} in {baseCurrency}<input name="fx_to_base" type="number" min="0.000000001" step="any" placeholder="Historischer Referenzkurs" /><span className="mt-1 block text-xs text-muted">Bei heutigen Verkäufen wird ein frischer Tageskurs versucht. Ältere Verkäufe erhalten keinen heutigen Ersatzkurs.</span></label>}
    {quantity && Number(quantity)>0 && after>=0 && <p className="sm:col-span-2 lg:col-span-4 text-sm text-muted">Nach diesem Verkauf: {Math.max(0,after).toLocaleString("de-DE",{maximumFractionDigits:6})} Stück offen · {after === 0 ? "Position vollständig geschlossen" : "Position bleibt offen"}.</p>}
    <div className="sm:col-span-2 lg:col-span-4"><button disabled={pending || state.ok} className="rounded-xl bg-accent px-4 py-2 font-medium text-[#062218] disabled:opacity-50">{pending ? "Wird gespeichert …" : state.ok ? "Gespeichert" : "Verkauf speichern"}</button>{state.ok && remaining > 0 && <button type="button" onClick={onAgain} className="ml-3 rounded-xl border border-border px-4 py-2">Weiteren Verkauf erfassen</button>}</div>
    {state.message && <p role="status" className={`sm:col-span-2 lg:col-span-4 text-sm ${state.ok ? "text-emerald-300" : "text-amber-300"}`}>{state.message}</p>}
  </form>;
}
