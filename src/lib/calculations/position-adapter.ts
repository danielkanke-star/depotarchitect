import type { Portfolio, PortfolioCategory, PortfolioFxRate, Position } from "@/lib/database.types";
import { canonicalMarketDataStatus, isUsableRealMarketData, latestUsableFxRate } from "@/lib/market-data";
import type { Direction, InstrumentType, MarginProvenance, PositionCalculationInput } from "./calculation-types";

export function positionToCalculationInput(
  position: Position,
  portfolio: Pick<Portfolio, "currency" | "net_liquidity">,
  categories: PortfolioCategory[] = [],
  fxRates: PortfolioFxRate[] = [],
  riskBudget: number | null = null,
): PositionCalculationInput {
  const categoryName = categories.find((category) => category.id === position.category_id)?.name ?? null;
  const instrumentCurrency = position.instrument_currency?.trim().toUpperCase() || null;
  const baseCurrency = portfolio.currency.trim().toUpperCase();
  const storedFxStatus = canonicalMarketDataStatus(
    position.current_fx_status,
    position.source_type,
    (position.current_fx_to_base ?? position.fx_to_base) !== null,
  );
  const sharedFx = instrumentCurrency ? latestUsableFxRate(fxRates, instrumentCurrency, baseCurrency) : null;
  const storedFxIsUsable = isUsableRealMarketData(storedFxStatus);
  const sharedFxIsNewer = Boolean(
    sharedFx
    && (!position.current_fx_as_of || (sharedFx.asOf && Date.parse(sharedFx.asOf) > Date.parse(position.current_fx_as_of))),
  );
  const useSharedFx = Boolean(sharedFx && (!storedFxIsUsable || sharedFxIsNewer));
  const currentFxToBase = instrumentCurrency === baseCurrency
    ? 1
    : useSharedFx
      ? sharedFx?.rate ?? null
      : position.current_fx_to_base ?? position.fx_to_base;
  const currentFxStatus = instrumentCurrency === baseCurrency
    ? "manually_updated" as const
    : useSharedFx
      ? sharedFx?.status ?? "missing"
      : storedFxStatus;
  const currentPrice = position.current_price_native ?? position.current_price;
  const currentPriceStatus = canonicalMarketDataStatus(
    position.current_price_status,
    position.source_type,
    currentPrice !== null,
  );
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
    currentPrice,
    currentPriceStatus,
    entryFxToBase: position.entry_fx_to_base,
    currentFxToBase,
    currentFxStatus,
    netLiquidity: portfolio.net_liquidity,
    riskBudget,
    effectiveStopPrice: position.stop_price_native ?? position.stop_price,
    directMarginRequirement: position.margin_requirement,
    directMarginProvenance,
    marginRate,
  };
}
