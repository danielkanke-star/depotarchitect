import type { CalculationReason, CalculationStatus, MarginProvenance } from "./calculation-types";

export const CALCULATION_STATUS_LABELS: Record<CalculationStatus, string> = {
  calculated: "Berechnet",
  source_fallback: "Quelldaten-Fallback",
  incomplete: "Nicht berechenbar",
  invalid: "Ungültige Ausgangsdaten",
};

export const MARGIN_PROVENANCE_LABELS: Record<MarginProvenance, string> = {
  broker_or_imported: "Broker/importiert",
  estimated: "Geschätzt",
  missing: "Nicht verfügbar",
};

export const CALCULATION_REASON_LABELS: Record<CalculationReason, string> = {
  current_price_missing: "aktueller Kurs fehlt",
  current_price_invalid: "aktueller Kurs ist ungültig",
  entry_price_missing: "Einstandskurs fehlt",
  entry_price_invalid: "Einstandskurs ist ungültig",
  quantity_missing: "Menge fehlt",
  quantity_invalid: "Menge ist ungültig",
  multiplier_missing: "Multiplikator fehlt",
  multiplier_invalid: "Multiplikator ist ungültig",
  fx_to_base_missing: "Wechselkurs zur Basiswährung fehlt",
  fx_to_base_invalid: "Wechselkurs zur Basiswährung ist ungültig",
  net_liquidity_missing: "Nettoliquidität fehlt",
  net_liquidity_invalid: "Nettoliquidität muss größer als null sein",
  stop_missing: "Stopp fehlt",
  stop_invalid: "Stopp liegt auf der falschen Seite des aktuellen Kurses",
  margin_information_missing: "Margininformation fehlt",
  margin_requirement_invalid: "direktes Margin Requirement ist ungültig",
  margin_percent_invalid: "Margin-Prozentsatz ist ungültig",
  legacy_market_value_used: "gespeicherter Legacy-Marktwert wird vorübergehend verwendet",
  direct_margin_requirement_used: "direktes Broker-/Import-Margin Requirement wird verwendet",
  portfolio_contains_incomplete_positions: "Portfolio enthält Positionen mit fehlenden Ausgangsdaten",
  portfolio_contains_invalid_positions: "Portfolio enthält Positionen mit ungültigen Ausgangsdaten",
  gross_exposure_zero: "Brutto-Exposure ist null",
  market_value_total_zero: "Gesamtmarktwert ist null",
  calculable_risk_total_zero: "Summe des berechenbaren Risikos ist null",
};

export function calculationExplanation(status: CalculationStatus, reasons: CalculationReason[]) {
  if (status === "calculated") return "Berechnet";
  const details = reasons.map((reason) => CALCULATION_REASON_LABELS[reason]).join(", ");
  return details ? `${CALCULATION_STATUS_LABELS[status]} – ${details}` : CALCULATION_STATUS_LABELS[status];
}
