import type { InstrumentType } from "@/lib/calculations/calculation-types";

const CASH_POSITION_ERROR = "Cashbestände dürfen nur als Währungs-Cashbestand gespeichert werden.";
const LEGACY_CASH_ERROR = "Eine Legacy-Cashposition darf nicht in eine Wertpapierposition umgewandelt werden.";

export function resolveWritableInstrumentType(
  requestedType: InstrumentType,
  existingType: InstrumentType | null,
): InstrumentType {
  if (existingType === null) {
    if (requestedType === "cash") throw new Error(CASH_POSITION_ERROR);
    return requestedType;
  }

  if (existingType === "cash") {
    if (requestedType !== "cash") throw new Error(LEGACY_CASH_ERROR);
    return "cash";
  }

  if (requestedType === "cash") throw new Error(CASH_POSITION_ERROR);
  return requestedType;
}

export function isBaseCurrencyLocked(positionCount: number, cashBalanceCount: number) {
  return positionCount > 0 || cashBalanceCount > 0;
}

export function assertBaseCurrencyChangeAllowed({
  currentCurrency,
  requestedCurrency,
  positionCount,
  cashBalanceCount,
}: {
  currentCurrency: string;
  requestedCurrency: string;
  positionCount: number;
  cashBalanceCount: number;
}) {
  if (currentCurrency.trim().toUpperCase() === requestedCurrency.trim().toUpperCase()) return;
  if (isBaseCurrencyLocked(positionCount, cashBalanceCount)) {
    throw new Error(
      "Die Basiswährung kann bei vorhandenen Positionen oder Cashbeständen nicht geändert werden.",
    );
  }
}
