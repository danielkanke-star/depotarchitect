"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePortfolio, getUserId } from "@/lib/portfolio";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const num = (formData: FormData, key: string) => Number(String(formData.get(key) ?? "0").replace(",", ".")) || 0;

export async function savePosition(formData: FormData) {
  const supabase = await createClient();
  const userId = await getUserId();
  const portfolio = await getOrCreatePortfolio();
  const id = text(formData, "id");
  const payload = {
    portfolio_id: portfolio.id,
    user_id: userId,
    category_id: text(formData, "category_id") || null,
    ticker: text(formData, "ticker").toUpperCase(),
    instrument_name: text(formData, "instrument_name") || null,
    instrument_type: text(formData, "instrument_type") || "stock",
    direction: text(formData, "direction") || "long",
    quantity: num(formData, "quantity"),
    entry_price: num(formData, "entry_price"),
    stop_price: num(formData, "stop_price") || null,
    market_value: num(formData, "market_value"),
    risk_amount: num(formData, "risk_amount"),
    sector: text(formData, "sector") || null,
    status: text(formData, "status") || "active",
    updated_at: new Date().toISOString(),
  };

  const result = id ? await supabase.from("positions").update(payload).eq("id", id) : await supabase.from("positions").insert(payload);
  if (result.error) throw new Error("Die Position konnte nicht gespeichert werden.");
  revalidatePath("/depot");
  revalidatePath("/cockpit");
  redirect("/depot");
}

export async function deletePosition(formData: FormData) {
  const supabase = await createClient();
  const id = text(formData, "id");
  const { error } = await supabase.from("positions").delete().eq("id", id);
  if (error) throw new Error("Die Position konnte nicht gelöscht werden.");
  revalidatePath("/depot");
  revalidatePath("/cockpit");
}
