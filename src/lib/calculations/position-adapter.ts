import type { Portfolio, PortfolioCategory, Position } from "@/lib/database.types";
import type { Direction, PositionCalculationInput } from "./calculation-types";

export function positionToCalculationInput(
  position: Position,
  portfolio: Pick<Portfolio, "currency" | "net_liquidity">,
  categories: PortfolioCategory[] = [],
): PositionCalculationInput {
  const categoryName = categories.find((category) => category.id === position.category_id)?.name ?? null;
  const instrumentCurrency = position.instrument_currency?.trim().toUpperCase() || null;
  const baseCurrency = portfolio.currency.trim().toUpperCase();
  const fxToBase = position.fx_to_base ?? (instrumentCurrency === baseCurrency ? 1 : null);

  return {
    id: position.id,
    ticker: position.ticker,
    categoryId: position.category_id,
    categoryName,
    direction: position.direction as Direction,
    quantity: position.quantity,
    multiplier: position.multiplier,
    entryPrice: position.entry_price,
    currentPrice: position.current_price,
    fxToBase,
    netLiquidity: portfolio.net_liquidity,
    effectiveStopPrice: position.stop_price,
    directMarginRequirement: position.margin_requirement,
    marginPercent: position.margin_percent,
    legacyMarketValueBase: position.market_value,
  };
}
