import "server-only";
import { createClient } from "../supabase/server";
import { ibkrQuoteMatchesPosition, ibkrQuoteStatus, ibkrSourceLabel, splitIbkrQuery, validateIbkrQuote, type IbkrQuote } from "./core";

export async function getIbkrConnection(portfolioId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ibkr_connections").select("*").eq("portfolio_id", portfolioId).maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code)) throw new Error("Der IBKR-Verbindungsstatus konnte nicht geladen werden.");
  return data;
}

export async function getIbkrQuotes(portfolioId: string) {
  const connection = await getIbkrConnection(portfolioId);
  if (!connection || connection.state !== "paired") return { connection, quotes: [] as IbkrQuote[] };
  const supabase = await createClient();
  const { data, error } = await supabase.from("ibkr_quotes").select("quote,fetched_at")
    .eq("connection_id", connection.id).order("fetched_at", { ascending: false }).limit(1000);
  if (error) throw new Error("Die IBKR-Kurse konnten nicht geladen werden.");
  const quotes = (data ?? []).flatMap(row => {
    const q = validateIbkrQuote(row.quote);
    return q ? [{ ...q, fetchedAt: row.fetched_at }] : [];
  });
  return { connection, quotes };
}

export async function lookupIbkrQuote(portfolioId: string, query: string): Promise<IbkrQuote | null> {
  const { connection, quotes } = await getIbkrQuotes(portfolioId);
  if (!connection || connection.state !== "paired") return null;
  const parsed = splitIbkrQuery(query);
  if (!parsed.valid) return null;
  const matching = quotes.filter(q => q.assetClass === "STK" && q.symbol === parsed.symbol && q.mic
    && (!parsed.mic || parsed.mic === q.mic) && ibkrQuoteStatus(q) !== "stale");
  if (matching.length === 1) return matching[0];
  if (!connection.last_seen_at || Date.now() - Date.parse(connection.last_seen_at) > 90_000 || !connection.gateway_authenticated) return null;
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("request_ibkr_quote", { target_portfolio: portfolioId, search_query: query });
  if (error || !id) return null;
  // The paired device polls outbound; no incoming port or broker cookie is exposed.
  // Bound the wait so a disconnected device cannot block the existing provider.
  for (let attempt = 0; attempt < 20; attempt++) {
    const { data: job, error: readError } = await supabase.from("ibkr_quote_requests").select("state,result").eq("id", id).single();
    if (readError) return null;
    if (job.state === "completed") {
      const result = job.result;
      if (!result || typeof result !== "object" || Array.isArray(result) || result.status !== "success") return null;
      const quote = validateIbkrQuote(result.quote);
      return quote && quote.assetClass === "STK" && quote.symbol === parsed.symbol && quote.mic
        && (!parsed.mic || parsed.mic === quote.mic) && ibkrQuoteStatus(quote) !== "stale" ? quote : null;
    }
    await new Promise(resolve => setTimeout(resolve, 800));
  }
  return null;
}

export async function applyIbkrPortfolioQuotes(portfolioId: string, userId: string, positionId?: string) {
  const { connection, quotes } = await getIbkrQuotes(portfolioId);
  if (!connection || connection.state !== "paired") return { connected: false, complete: false, updated: 0, matched: 0, attention: null as string | null };
  const supabase = await createClient();
  await supabase.rpc("mark_ibkr_active", { target_portfolio: portfolioId });
  let positionQuery = supabase.from("positions").select("*").eq("portfolio_id", portfolioId)
    .eq("user_id", userId).neq("source_type", "demo").neq("status", "closed");
  if (positionId) positionQuery = positionQuery.eq("id", positionId);
  const { data: positions, error } = await positionQuery;
  if (error) throw new Error("Die Positionen konnten nicht mit IBKR abgeglichen werden.");
  const { data: prior, error: priorError } = await supabase.from("position_price_observations").select("position_id,price_native,status,observed_at")
    .eq("portfolio_id", portfolioId).eq("source_type", "ibkr").order("observed_at", { ascending: false }).limit(1000);
  if (priorError) throw new Error("Vorhandene IBKR-Beobachtungen konnten nicht geprüft werden.");
  const newest = new Map<string, NonNullable<typeof prior>[number]>();
  for (const row of prior ?? []) if (!newest.has(row.position_id)) newest.set(row.position_id, row);
  let updated = 0, matched = 0;
  for (const position of positions ?? []) {
    const candidates = quotes.filter(q => ibkrQuoteMatchesPosition(q, position));
    if (candidates.length !== 1) continue;
    const quote = candidates[0], status = ibkrQuoteStatus(quote);
    if (status === "stale") continue;
    matched++;
    const previous = newest.get(position.id);
    if (previous && Number(previous.price_native) === quote.price && previous.status === status
      && Date.now() - Date.parse(previous.observed_at) < 5 * 60_000) continue;
    const { error: writeError } = await supabase.from("position_price_observations").upsert({
      user_id: userId, portfolio_id: portfolioId, position_id: position.id, ticker: position.ticker,
      currency: quote.currency, price_native: quote.price, source_type: "ibkr", source_name: ibkrSourceLabel(quote),
      observed_at: quote.observedAt, status, source_reference: `ibkr:${quote.conid}:${quote.priceBasis ?? "last"}`,
    }, { onConflict: "position_id,source_type,observed_at,price_native", ignoreDuplicates: true });
    if (writeError) throw new Error("Ein IBKR-Kurs konnte nicht gespeichert werden.");
    updated++;
  }
  const attention = connection.last_error ?? (!connection.last_seen_at || Date.now() - Date.parse(connection.last_seen_at) > 90_000
    ? "device_offline" : !connection.gateway_authenticated || !connection.brokerage_authenticated ? "login_required" : null);
  return { connected: true, complete: matched === (positions ?? []).length, updated, matched, attention };
}
