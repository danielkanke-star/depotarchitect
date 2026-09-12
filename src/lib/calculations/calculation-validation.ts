import Decimal from "decimal.js";
import type { CalculationMetric, CalculationReason, NumericInput } from "./calculation-types";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export function decimal(value: NumericInput): Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

export function calculated(value: Decimal | number): CalculationMetric {
  return { value: value instanceof Decimal ? value.toNumber() : value, status: "calculated", reasons: [] };
}

export function sourceFallback(value: Decimal | number, reason: CalculationReason): CalculationMetric {
  return { value: value instanceof Decimal ? value.toNumber() : value, status: "source_fallback", reasons: [reason] };
}

export function incomplete(...reasons: CalculationReason[]): CalculationMetric {
  return { value: null, status: "incomplete", reasons: unique(reasons) };
}

export function invalid(...reasons: CalculationReason[]): CalculationMetric {
  return { value: null, status: "invalid", reasons: unique(reasons) };
}

export function metricWithValue(
  value: Decimal | number,
  status: "calculated" | "source_fallback" | "incomplete" | "invalid",
  reasons: CalculationReason[] = [],
): CalculationMetric {
  return {
    value: value instanceof Decimal ? value.toNumber() : value,
    status,
    reasons: unique(reasons),
  };
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
