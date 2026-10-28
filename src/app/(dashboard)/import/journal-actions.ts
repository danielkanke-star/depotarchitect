"use server";
import { revalidatePath } from "next/cache";
import { getOrCreatePortfolio, getUserId } from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";
import { analyzeJournalCsv } from "@/lib/journal-import";
import type { Json } from "@/lib/database.types";

export async function importJournal(_previous: { ok: boolean; message: string }, form: FormData) {
  await getUserId();
  const portfolio = await getOrCreatePortfolio();
  const raw = String(form.get("csv") ?? "");
  if (form.get("reviewed") !== "yes") return { ok: false, message: "Bitte zuerst die Vorschau einschließlich Datenlücken prüfen und bestätigen." };
  let preview;
  try { preview = await analyzeJournalCsv(raw, portfolio.currency); }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Datei nicht lesbar." }; }
  if (preview.errors || !preview.entries.length) return { ok: false, message: "Der Import enthält Fehler. Es wurde nichts gespeichert." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_position_journal", { target_portfolio: portfolio.id, entries: preview.entries as unknown as Json });
  if (error) return { ok: false, message: error.message.includes("leeres Depot") ? "Die Erstübernahme benötigt ein leeres Depot. Bestehende echte Positionen werden zum Schutz vor Duplikaten nicht ergänzt oder überschrieben. Bereits importierte Zeilen können wiederholt werden." : "Der Journalimport wurde vollständig zurückgerollt. Bitte Datenbankstand und Importangaben prüfen." };
  const result = data as { inserted: number; skipped: number };
  ["/import", "/cockpit", "/depot", "/performance", "/risiko"].forEach(path => revalidatePath(path));
  return { ok: true, message: `${result.inserted} Positionen übernommen, ${result.skipped} bereits importierte Zeilen übersprungen. Der Import synchronisiert keine späteren Änderungen.` };
}
