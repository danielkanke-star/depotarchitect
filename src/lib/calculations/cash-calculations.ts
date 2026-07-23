import Decimal from "decimal.js";
import type {
  CalculationMetric,
  CashBalanceCalculation,
  CashBalanceCalculationInput,
  CashPortfolioCalculation,
} from "./calculation-types";
import { calculated, decimal, incomplete, invalid, metricWithValue, unique } from "./calculation-validation";

function calculateCashBalance(input: CashBalanceCalculationInput): CashBalanceCalculation {
  const balance = decimal(input.balanceNative);
  const sameCurrency = input.currency.trim().toUpperCase() === input.baseCurrency.trim().toUpperCase();
  const enteredFx = decimal(input.currentFxToBase);
  const fx = sameCurrency ? new Decimal(1) : enteredFx;
  let valueBase: CalculationMetric;

  if (balance === null) valueBase = incomplete("quantity_missing");
  else if (fx === null) valueBase = incomplete("cash_fx_missing");
  else if (!fx.isPositive() || (sameCurrency && !fx.equals(1))) valueBase = invalid("cash_fx_invalid");
  else valueBase = calculated(balance.mul(fx));

  return {
    id: input.id,
    currency: input.currency.trim().toUpperCase(),
    balanceNative: balance?.toNumber() ?? null,
    currentFxToBase: fx?.toNumber() ?? null,
    valueBase,
  };
}

export function calculateCashPortfolio(inputs: CashBalanceCalculationInput[]): CashPortfolioCalculation {
  const balances = inputs.map(calculateCashBalance);
  const available = balances.flatMap((balance) => balance.valueBase.value === null ? [] : [balance.valueBase.value]);
  const reasons = unique(balances.flatMap((balance) => balance.valueBase.reasons));
  const hasInvalid = balances.some((balance) => balance.valueBase.status === "invalid");
  const hasIncomplete = balances.some((balance) => balance.valueBase.status === "incomplete");
  const total = available.reduce((sum, value) => sum.add(value), new Decimal(0));
  const totalCashBase = hasInvalid
    ? metricWithValue(total, "invalid", reasons)
    : hasIncomplete
      ? metricWithValue(total, "incomplete", reasons)
      : calculated(total);

  return {
    balances,
    totalCashBase,
    positiveBalanceCount: balances.filter((balance) => (balance.balanceNative ?? 0) > 0).length,
    negativeBalanceCount: balances.filter((balance) => (balance.balanceNative ?? 0) < 0).length,
    zeroBalanceCount: balances.filter((balance) => balance.balanceNative === 0).length,
    fxIsComplete: !hasInvalid && !hasIncomplete,
    missingFxCount: balances.filter((balance) => balance.valueBase.reasons.includes("cash_fx_missing")).length,
  };
}
