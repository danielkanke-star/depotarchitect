"use server";

import { randomBytes, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getOrCreatePortfolio, getUserId } from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";
import { applyIbkrPortfolioQuotes, getIbkrConnection } from "@/lib/ibkr/server";

export async function createIbkrPairing() {
  await getUserId();
  const portfolio = await getOrCreatePortfolio(), supabase = await createClient();
  const code = randomBytes(32).toString("base64url");
  const { error } = await supabase.rpc("create_ibkr_pairing", {
    target_portfolio: portfolio.id, code_hash: createHash("sha256").update(code).digest("hex"),
  });
  if (error) throw new Error("Die Gerätekopplung konnte nicht vorbereitet werden.");
  return { code, expiresAt: new Date(Date.now() + 600_000).toISOString() };
}

export async function revokeIbkrConnection() {
  await getUserId();
  const portfolio = await getOrCreatePortfolio(), supabase = await createClient();
  const { error } = await supabase.rpc("revoke_ibkr_connection", { target_portfolio: portfolio.id });
  if (error) throw new Error("Die Verbindung konnte nicht getrennt werden.");
  revalidatePath("/einstellungen");
}

export async function refreshIbkrMarketData() {
  const userId = await getUserId(), portfolio = await getOrCreatePortfolio();
  return applyIbkrPortfolioQuotes(portfolio.id, userId);
}

export async function ibkrConnectionStatus() {
  await getUserId();
  const portfolio = await getOrCreatePortfolio();
  const data = await getIbkrConnection(portfolio.id);
  return data ? {
    state: data.state, lastSeenAt: data.last_seen_at, gatewayAuthenticated: data.gateway_authenticated,
    brokerageAuthenticated: data.brokerage_authenticated, attention: data.last_error,
  } : null;
}
