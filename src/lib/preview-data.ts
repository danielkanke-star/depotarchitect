// Synthetic review data only. Never loaded by the authenticated application.
import type { OverviewData } from "./depot-overview";
import type { Position, PositionSale } from "./database.types";
const date = "2026-10-27T10:00:00Z";
export function examplePosition(overrides: Partial<Position> = {}): Position {
  return { id: "example-1", user_id: "example-user", portfolio_id: "example-portfolio", category_id: "core", ticker: "AMZN", instrument_name: "Amazon · Beispieldaten",
    instrument_type: "stock", direction: "long", quantity: 10, multiplier: 1, entry_price: 100, current_price: 120, current_price_native: 120,
    instrument_currency: "USD", fx_to_base: 0.9, data_as_of: date, entry_fx_to_base: 0.88, current_fx_to_base: 0.9, current_fx_as_of: date,
    current_fx_source: "manual", current_fx_status: "manually_updated", current_price_as_of: date, current_price_source: "manual", current_price_status: "manually_updated",
    stop_price: 108, stop_price_native: 108, stop_updated_at: date, stop_comment: null, market_value: null, risk_amount: null,
    margin_requirement: null, margin_percent: null, margin_rate: 0.15, margin_source: "estimated", margin_currency: null, margin_as_of: date,
    margin_calculation_type: "rate_estimate", margin_confidence: "estimated", sector: null, strategy: null, entry_date: "2026-10-01", status: "active", notes: null,
    sold_quantity: 0, sale_price: null, sale_date: null, external_position_id: null, option_type: null, strike_price: null, expiration_date: null,
    source_type: "manual", listing_id: null, listing_resolution_status: "needs_confirmation", source_import_id: null, imported_at: null,
    entry_margin_base: 132, entry_margin_source: "entry_rate_reference", quantity_step: 0.01, tradingview_url: null, journal_source_key: null,
    created_at: date, updated_at: date, ...overrides };
}
export function exampleSale(positionId: string, overrides: Partial<PositionSale> = {}): PositionSale {
  return { id: `sale-${positionId}`, user_id: "example-user", portfolio_id: "example-portfolio", position_id: positionId, quantity: 10, price: 120,
    sale_date: "2026-10-14", fx_to_base: 0.9, fx_source: "manual_execution_reference", source: "manual", request_id: `request-${positionId}`, created_at: date, ...overrides };
}
export function createPreviewData(now = new Date()): OverviewData {
  const iso = now.toISOString(); const age = (days: number) => new Date(now.getTime() - days * 86400000).toISOString();
  return {
    portfolio: { id: "example-portfolio", user_id: "example-user", name: "Beispieldepot", currency: "EUR", net_liquidity: 100000, cash_balance: null,
      data_as_of: iso, account_type: "margin_account", margin_used_pct: null, risk_budget_used_pct: null, risk_profile: "Aggressiv 1,0", created_at: iso, updated_at: iso },
    settings: { portfolio_id: "example-portfolio", user_id: "example-user", risk_model: "risk_per_trade", risk_per_trade_pct: 1.2, max_margin_pct: 50,
      max_position_pct: 15, max_sector_pct: 50, max_drawdown_pct: 8, updated_at: iso },
    categories: ["Kerninvestment", "Momentumtrade", "taktische Beimischung", "Hedge"].map((name,i) => ({ id: ["core", "momentum", "tactical", "hedge"][i], portfolio_id: "example-portfolio", user_id: "example-user", name, sort_order: i, is_active: true, created_at: iso })),
    positions: [
      examplePosition({ id: "amzn1", quantity: 100, entry_margin_base: 1320, stop_updated_at: age(16), current_price_as_of: iso, current_fx_as_of: iso }),
      examplePosition({ id: "amzn2", quantity: 80, entry_date: "2026-10-05", entry_margin_base: 1056, stop_price: 118, stop_price_native: 118, stop_updated_at: age(3), current_price_as_of: iso, current_fx_as_of: iso }),
      examplePosition({ id: "amzn3", quantity: 50, entry_date: "2026-10-10", entry_margin_base: 660, stop_price: 119, stop_price_native: 119, stop_updated_at: age(1), current_price_as_of: iso, current_fx_as_of: iso }),
      examplePosition({ id: "ntap", ticker: "NTAP", instrument_name: "NetApp · Beispieldaten", category_id: "momentum", quantity: 10, sold_quantity: 2, sale_price: 115, sale_date: "2026-10-14", stop_updated_at: age(8), current_price_as_of: iso, current_fx_as_of: iso }),
      examplePosition({ id: "swiss", ticker: "CH-BEISPIEL", instrument_name: "Beispielnotierung · CHF", instrument_currency: "CHF", category_id: "tactical", quantity: 100, current_fx_to_base: 1.06, current_fx_as_of: iso, stop_price: 85, stop_price_native: 85, stop_updated_at: age(12), current_price_as_of: iso }),
      examplePosition({ id: "closed-win", ticker: "GEWINN", status: "closed", sold_quantity: 10, sale_price: 120, sale_date: "2026-10-14" }),
      examplePosition({ id: "closed-loss", ticker: "VERLUST", status: "closed", sold_quantity: 10, sale_price: 90, sale_date: "2026-10-14" }),
    ],
    fxRates: [], priceObservations: [], sales: [exampleSale("ntap", { quantity: 2, price: 115 }), exampleSale("closed-win"), exampleSale("closed-loss", { price: 90 })],
  };
}
