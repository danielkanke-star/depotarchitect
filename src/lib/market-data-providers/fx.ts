import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchFxRate, fetchReferenceFxRate } from "./fx-core";

const REFERENCE_SOURCE = "EZB-Tagesreferenz über Frankfurter";
export async function resolveCurrentFx(portfolioId: string, userId: string, from: string, to: string, mode: "interactive" | "automatic" = "interactive") {
  if (from === to) return { rate: 1, asOf: new Date().toISOString(), source: "identity", stale: false };
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return null;
  const supabase = await createClient();
  const { data: rates } = await supabase.from("portfolio_fx_rates").select("*").eq("portfolio_id", portfolioId)
    .eq("source_currency", from).eq("target_currency", to).neq("source_type", "demo").neq("status", "missing").order("rate_as_of", { ascending: false }).limit(10);
  const cached = rates?.find(rate => Number.isFinite(Number(rate.rate)) && Number(rate.rate) > 0);
  const fallback = cached ? { rate: Number(cached.rate), asOf: cached.rate_as_of, source: cached.source_name,
    stale: Date.now() - Date.parse(cached.rate_as_of) > (cached.source_name === REFERENCE_SOURCE ? 7 * 86400000 : 3600000) || cached.status === "stale" } : null;
  if (fallback && (!fallback.stale && cached?.source_name !== REFERENCE_SOURCE || cached?.source_type === "market_data_provider" && Date.now() - Date.parse(cached.updated_at) < 3600000)) return fallback;

  const { data: lease } = await supabase.rpc("claim_portfolio_fx_refresh", { target_portfolio: portfolioId, from_currency: from, to_currency: to });
  // The independently cached daily reference also works during provider backoff.
  if (!lease) return fallback ?? referenceOnly();
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
  let value: { rate: number; asOf: string } | null = null;
  let source = "Twelve Data";
  let providerLimited = false;
  if (apiKey) {
    const { data: claimed, error } = await supabase.rpc("claim_market_data_request", { target_provider: "twelve_data", request_mode: mode, request_kind: "fx" });
    if (!error && claimed === "claimed") {
      const response = await fetchFxRate(from, to, apiKey);
      if (response && !("error" in response)) value = response;
      providerLimited = response !== null && "error" in response;
    }
  }
  if (!value) { value = await fetchReferenceFxRate(from, to); source = REFERENCE_SOURCE; }
  if (!value) { await supabase.rpc("finish_portfolio_fx_refresh", { lease, wait_seconds: providerLimited ? 3600 : 300 }); return fallback; }
  const previous = rates?.find(rate => rate.source_type === "market_data_provider" && rate.source_name === source);
  const { error: writeError } = await supabase.from("portfolio_fx_rates").upsert({ ...(previous ? { id: previous.id } : {}), user_id: userId, portfolio_id: portfolioId, source_currency: from, target_currency: to,
    rate: value.rate, source_type: "market_data_provider", source_name: source, rate_as_of: value.asOf, status: "delayed" });
  await supabase.rpc("finish_portfolio_fx_refresh", { lease, wait_seconds: writeError ? 300 : 3600 });
  // A cache write failure must not discard a verified rate for the current calculation.
  return { ...value, source, stale: source === "Twelve Data" && Date.now() - Date.parse(value.asOf) > 3600000 };

  async function referenceOnly() {
    const reference = await fetchReferenceFxRate(from, to);
    return reference ? { ...reference, source: REFERENCE_SOURCE, stale: false } : null;
  }
}
