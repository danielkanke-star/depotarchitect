import type { Portfolio, PortfolioCategory, Position } from "@/lib/database.types";
import type { Direction, InstrumentType, MarginProvenance, PositionCalculationInput } from "./calculation-types";

export function positionToCalculationInput(
  position: Position,
  portfolio: Pick<Portfolio, "currency" | "net_liquidity">,
  categories: PortfolioCategory[] = [],
): PositionCalculationInput {
  const categoryName = categories.find((category) => category.id === position.category_id)?.name ?? null;
  const instrumentCurrency = position.instrument_currency?.trim().toUpperCase() || null;
  const baseCurrency = portfolio.currency.trim().toUpperCase();
  const currentFxToBase = position.current_fx_to_base ?? position.fx_to_base ?? (instrumentCurrency === baseCurrency ? 1 : null);
  const marginRate = position.margin_rate ?? (
    position.margin_percent === null ? null : Number(position.margin_percent) / 100
  );
  const directMarginProvenance = ["broker", "imported_direct", "manual_direct", "legacy_untrusted"].includes(position.margin_source)
    ? position.margin_source as Exclude<MarginProvenance, "estimated" | "missing">
    : undefined;

  return {
    id: position.id,
    ticker: position.ticker,
    categoryId: position.category_id,
    categoryName,
    instrumentType: position.instrument_type as InstrumentType,
    direction: position.direction as Direction,
    quantity: position.quantity,
    multiplier: position.multiplier,
    entryPrice: position.entry_price,
    currentPrice: position.current_price,
    entryFxToBase: position.entry_fx_to_base,
    currentFxToBase,
    netLiquidity: portfolio.net_liquidity,
    effectiveStopPrice: position.stop_price,
    directMarginRequirement: position.margin_requirement,
    directMarginProvenance,
    marginRate,
    legacyMarketValueBase: position.market_value,
  };
}
