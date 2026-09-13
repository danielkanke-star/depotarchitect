import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../supabase/migrations/20260808120000_instrument_universe_quote_cache.sql", import.meta.url), "utf8");
const observationHardeningSql = readFileSync(
  new URL("../supabase/migrations/20260913003500_harden_price_observation_trigger.sql", import.meta.url),
  "utf8",
);

describe("instrument-universe migration contract", () => {
  it("enables RLS and removes anon access for every public table", () => {
    for (const table of ["market_instruments", "market_listings", "market_listing_provider_mappings", "user_instrument_universe", "market_listing_quotes", "market_fx_quotes"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).not.toMatch(/grant .* to anon/i);
  });

  it("binds child rows to the same owner and leaves ambiguous legacy rows for confirmation", () => {
    expect(sql).toContain("foreign key (user_id,instrument_id)");
    expect(sql).toContain("foreign key (user_id,listing_id)");
    expect(sql).toContain("default 'needs_confirmation'");
    expect(sql).toContain("m.mapping_status='verified'");
  });

  it("hardens every exposed security-definer function", () => {
    const definers = sql.match(/security definer set search_path = ''/g) ?? [];
    expect(definers).toHaveLength(5);
    expect(sql).toContain("revoke all on function public.claim_market_data_request");
    expect(sql).toContain("revoke all on function public.claim_market_quote_refresh");
    expect(sql).toContain("revoke all on function public.complete_market_quote_refresh");
    expect(sql).toContain("revoke all on function public.fail_market_quote_refresh");
    expect(sql).toContain("revoke all on function public.attach_position_listing");
  });

  it("stores only latest quote rows and enforces automatic free-tier headroom", () => {
    expect(sql).toContain("unique (listing_id, provider)");
    expect(sql).toContain("('twelve_data', 8, 800, 6, 650, 150, 30)");
    expect(sql).toContain("market_data_refresh_leases");
    expect(sql).toContain("market_data_provider_backoffs");
  });

  it("keeps legacy imports without an instrument currency writable", () => {
    expect(observationHardeningSql).toContain("new.instrument_currency is null");
    expect(observationHardeningSql).toContain("upper(btrim(new.instrument_currency)) !~ '^[A-Z]{3}$'");
    expect(observationHardeningSql).toContain("return new;");
  });
});
