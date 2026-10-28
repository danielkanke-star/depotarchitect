import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchFxRate } from "./fx-core";

export async function resolveCurrentFx(portfolioId: string, userId: string, from: string, to: string, mode: "interactive" | "automatic" = "interactive") {
  if (from === to) return { rate: 1, asOf: new Date().toISOString(), source: "identity", stale: false };
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return null;
  const supabase = await createClient();
  const { data: rates, error } = await supabase.from("portfolio_fx_rates").select("*").eq("portfolio_id", portfolioId)
    .eq("source_currency", from).eq("target_currency", to).neq("source_type", "demo").neq("status", "missing").order("rate_as_of", { ascending: false }).limit(1);
  if (error) return null;
  const cached = rates?.[0];
  const fallback = cached && Number(cached.rate) > 0 ? { rate: Number(cached.rate), asOf: cached.rate_as_of, source: cached.source_name, stale: Date.now() - Date.parse(cached.rate_as_of) > 3600000 || cached.status === "stale" } : null;
  if (fallback && (!fallback.stale || cached?.source_type === "market_data_provider" && Date.now() - Date.parse(cached.updated_at) < 3600000)) return fallback;
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!apiKey) return fallback;
  const { data: lease, error: leaseError } = await supabase.rpc("claim_portfolio_fx_refresh", { target_portfolio: portfolioId, from_currency: from, to_currency: to });
  if (leaseError || !lease) return fallback;
  const { data: claimed, error: claimError } = await supabase.rpc("claim_market_data_request", { target_provider: "twelve_data", request_mode: mode, request_kind: "fx" });
  if (claimError || claimed !== "claimed") { await supabase.rpc("finish_portfolio_fx_refresh", { lease, wait_seconds: 300 }); return fallback; }
  const value = await fetchFxRate(from, to, apiKey);
  if (!value || "error" in value) { await supabase.rpc("finish_portfolio_fx_refresh", { lease, wait_seconds: value && "error" in value ? 3600 : 300 }); return fallback; }
  const { error: writeError } = await supabase.from("portfolio_fx_rates").upsert({ ...(cached?.source_type === "market_data_provider" && cached.source_name === "Twelve Data" ? { id: cached.id } : {}), user_id: userId, portfolio_id: portfolioId, source_currency: from, target_currency: to,
    rate: value.rate, source_type: "market_data_provider", source_name: "Twelve Data", rate_as_of: value.asOf, status: "delayed" });
  await supabase.rpc("finish_portfolio_fx_refresh", { lease, wait_seconds: writeError ? 300 : 3600 });
  if (writeError) return fallback;
  return { ...value, source: "Twelve Data", stale: Date.now() - Date.parse(value.asOf) > 3600000 };
}
