"use server";

import { revalidatePath } from "next/cache";
import { getOrCreatePortfolio, getUserId } from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";
import { resolveCurrentFx } from "@/lib/market-data-providers/fx";
import { berlinDate, calendarDays } from "@/lib/risk-rules";

export type SaleState = { message: string; ok: boolean };
export async function recordSale(_previous: SaleState, form: FormData): Promise<SaleState> {
  const supabase = await createClient();
  const userId = await getUserId();
  const portfolio = await getOrCreatePortfolio();
  const id = String(form.get("position_id") ?? "");
  const { data: position, error } = await supabase.from("positions").select("*").eq("id", id).eq("portfolio_id", portfolio.id).single();
  if (error || !position) return { ok: false, message: "Die Position konnte nicht geladen werden." };
  const parse = (key: string) => { const v = String(form.get(key) ?? "").trim(); return v ? Number(v.replace(",", ".")) : null; };
  const quantity = parse("quantity"), price = parse("price"), fxInput = parse("fx_to_base");
  const date = String(form.get("sale_date") ?? "");
  if (calendarDays(date,berlinDate()) === null || (position.entry_date && calendarDays(position.entry_date,date) === null)) return { ok:false, message:"Das tatsächliche Verkaufsdatum muss zwischen Einstieg und heute liegen." };
  let fx = position.instrument_currency === portfolio.currency ? 1 : fxInput;
  let source = fx === 1 && position.instrument_currency === portfolio.currency ? "identity" : "manual_execution_reference";
  if (fx === null && date === berlinDate()) {
    const quote = await resolveCurrentFx(portfolio.id, userId, position.instrument_currency ?? "", portfolio.currency);
    if (quote && !quote.stale && berlinDate(new Date(quote.asOf)) === date) { fx = quote.rate; source = `${quote.source} ${quote.asOf}`; }
  }
  if (quantity === null || price === null || !Number.isFinite(quantity) || !Number.isFinite(price) || quantity <= 0 || price < 0 || (fx !== null && (!Number.isFinite(fx) || fx <= 0))) return { ok: false, message: "Bitte gültige Menge, Verkaufskurs und gegebenenfalls historischen Wechselkurs eingeben." };
  const requestId = String(form.get("request_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return { ok: false, message: "Bitte das Formular neu öffnen." };
  const { error: writeError } = await supabase.rpc("record_position_sale", { target_position: id, sale_quantity: quantity, sale_price_native: price,
    executed_on: date, sale_fx: fx, fx_provenance: source, idempotency_key: requestId });
  if (writeError) return { ok: false, message: writeError.message.includes("übersteigt") ? "Die verkaufte Menge übersteigt die offene Restmenge." : writeError.message.includes("Ungültige") ? "Datum und Verkaufsangaben prüfen. Das Datum muss zwischen Einstieg und heute liegen." : "Der Verkauf konnte nicht gespeichert werden. Bitte Verbindung und Datenbankstand prüfen." };
  ["/depot", "/cockpit", "/performance", "/risiko"].forEach(path => revalidatePath(path));
  return { ok: true, message: ["Verkauf gespeichert.", fx === null ? "Für die historische Euro-Auswertung fehlt noch der Wechselkurs beim Verkauf." : "", ["broker","manual_direct","imported_direct"].includes(position.margin_source) ? "Den direkten Marginbetrag für die Restmenge bitte neu bestätigen." : ""].filter(Boolean).join(" ") };
}

export async function refreshPortfolioFx() {
  const userId = await getUserId();
  const portfolio = await getOrCreatePortfolio();
  const supabase = await createClient();
  const { data: positions } = await supabase.from("positions").select("instrument_currency").eq("portfolio_id", portfolio.id).neq("status", "closed");
  for (const currency of new Set((positions ?? []).map(p => p.instrument_currency).filter((v): v is string => Boolean(v) && v !== portfolio.currency))) {
    await resolveCurrentFx(portfolio.id, userId, currency, portfolio.currency, "automatic");
  }
  revalidatePath("/cockpit"); revalidatePath("/depot"); revalidatePath("/risiko");
}

export async function correctSale(_previous: SaleState, form: FormData): Promise<SaleState> {
  await getUserId();
  const supabase = await createClient();
  const read = (key: string) => { const s = String(form.get(key) ?? "").trim(); return s ? Number(s.replace(",", ".")) : null; };
  const quantity = read("quantity"), price = read("price"), fx = read("fx_to_base");
  if (quantity === null || price === null || !Number.isFinite(quantity) || !Number.isFinite(price) || (fx !== null && !Number.isFinite(fx))) return { ok: false, message: "Menge, Kurs und Wechselkurs prüfen." };
  const { error } = await supabase.rpc("correct_position_sale", { target_sale: String(form.get("sale_id") ?? ""), sale_quantity: quantity,
    sale_price_native: price, executed_on: String(form.get("sale_date") ?? ""), sale_fx: fx, correction_reason: String(form.get("reason") ?? "").trim() });
  if (error) return { ok: false, message: "Korrektur nicht gespeichert. Menge, Datum, Kurs, historischen Wechselkurs und Begründung prüfen." };
  ["/depot", "/cockpit", "/performance", "/risiko"].forEach(path => revalidatePath(path));
  return { ok: true, message: "Korrektur gespeichert. Die vorherigen Angaben bleiben in der Änderungshistorie erhalten." };
}
