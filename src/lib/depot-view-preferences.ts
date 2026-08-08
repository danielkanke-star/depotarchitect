export type DepotOptionalColumn = "baseMarketValue" | "risk" | "margin" | "priceDetails";
export type DepotViewPreferences = Record<DepotOptionalColumn, boolean>;

export const DEFAULT_DEPOT_VIEW_PREFERENCES: DepotViewPreferences = {
  baseMarketValue: false,
  risk: false,
  margin: false,
  priceDetails: false,
};

export const DEPOT_VIEW_STORAGE_KEY = "depotarchitect:depot-columns:v1";

export function parseDepotViewPreferences(raw: string | null): DepotViewPreferences {
  if (!raw) return { ...DEFAULT_DEPOT_VIEW_PREFERENCES };
  try {
    const parsed = JSON.parse(raw) as Partial<Record<DepotOptionalColumn, unknown>>;
    return {
      baseMarketValue: parsed.baseMarketValue === true,
      risk: parsed.risk === true,
      margin: parsed.margin === true,
      priceDetails: parsed.priceDetails === true,
    };
  } catch {
    return { ...DEFAULT_DEPOT_VIEW_PREFERENCES };
  }
}

export function toggleDepotViewPreference(
  preferences: DepotViewPreferences,
  column: DepotOptionalColumn,
): DepotViewPreferences {
  return { ...preferences, [column]: !preferences[column] };
}
