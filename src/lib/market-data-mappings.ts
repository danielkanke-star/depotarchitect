import "server-only";

import type { PositionMarketDataMapping } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export async function getPositionMarketDataMappings(portfolioId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("position_market_data_mappings")
    .select("*")
    .eq("portfolio_id", portfolioId);

  if (isMissingTable(error)) return [] as PositionMarketDataMapping[];
  if (error) throw new Error("Die Kurszuordnungen konnten nicht geladen werden.");
  return data ?? [];
}

export function isMissingMarketDataTable(error: { code?: string } | null) {
  return isMissingTable(error);
}

function isMissingTable(error: { code?: string } | null) {
  return error?.code === "42P01"
    || error?.code === "42703"
    || error?.code === "PGRST202"
    || error?.code === "PGRST204"
    || error?.code === "PGRST205";
}
