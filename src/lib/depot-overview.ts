import Decimal from "decimal.js";
import type { Portfolio, PortfolioCategory, PortfolioFxRate, PortfolioSettings, Position, PositionPriceObservation, PositionSale } from "./database.types";
import { calculatePortfolio } from "./calculations/portfolio-calculations";
import { positionToCalculationInput } from "./calculations/position-adapter";
import { instrumentKey, calculateJournal } from "./journal";
import { concentrationTone, depotRiskBudget, riskConcentrationTone } from "./risk-rules";
import { resolvePositionPrice } from "./price-resolution";
import { latestUsableFxRate } from "./market-data";
import type { JournalSourceReference } from "./journal-source-reference";

export type OverviewData = { portfolio: Portfolio; settings: PortfolioSettings; categories: PortfolioCategory[]; positions: Position[];
  fxRates: PortfolioFxRate[]; priceObservations: PositionPriceObservation[]; sales: PositionSale[]; journalReferences?: JournalSourceReference[] };
export function buildOverview(data: OverviewData, now = new Date()) {
  const { portfolio, positions, categories, fxRates, priceObservations, sales } = data;
  const active = positions.filter(p => p.status !== "closed" && p.instrument_type !== "cash");
  const budget = depotRiskBudget(portfolio.net_liquidity, data.settings.risk_budget_pct);
  const inputs=active.map(p => positionToCalculationInput(p, portfolio, categories, fxRates, budget, priceObservations));
  const profile = portfolio.risk_profile_configured ? portfolio.risk_profile : "";
  const calculation = calculatePortfolio({ netLiquidity: portfolio.net_liquidity, riskBudget: budget,
    positions: inputs });
  const byId = new Map(calculation.positions.map(p => [p.id, p]));
  const stalePrices = active.filter(p => {
    const price = resolvePositionPrice(p,priceObservations);
    return price && (price.status === "stale" || !price.observedAt || now.getTime()-Date.parse(price.observedAt) > (price.status === "end_of_day" ? 12 : 1)*3600000);
  }).length;
  const staleFx=active.filter((p,i)=>{
    if (!p.instrument_currency || p.instrument_currency===portfolio.currency || inputs[i].currentFxToBase==null) return false;
    const shared=latestUsableFxRate(fxRates,p.instrument_currency,portfolio.currency);
    const times=[p.current_fx_as_of,shared?.asOf].flatMap(d=>d && Number.isFinite(Date.parse(d)) ? [Date.parse(d)] : []);
    const maxAge = shared?.source === "EZB-Tagesreferenz über Frankfurter" ? 7 * 86400000 : 3600000;
    return inputs[i].currentFxStatus === "stale" || !times.length || now.getTime()-Math.max(...times)>maxAge;
  }).length;
  const grouped = new Map<string, Position[]>();
  for (const p of active) grouped.set(instrumentKey(p), [...(grouped.get(instrumentKey(p)) ?? []), p]);
  const sum = (ns: (number | null | undefined)[]) => ns.every(n => n != null) ? ns.reduce<Decimal>((s, n) => s.plus(n!), new Decimal(0)).toNumber() : null;
  const instruments = [...grouped].map(([key, ps]) => {
    const value = sum(ps.map(p => byId.get(p.id)?.positionValueBase.value));
    const risk = sum(ps.map(p => byId.get(p.id)?.stopRisk.value));
    const totalRisk = calculation.totalCalculableStopRisk.value;
    const share = calculation.riskIsComplete && risk !== null && totalRisk !== null ? totalRisk === 0 ? 0 : risk / totalRisk : null;
    const netLiqShare = value !== null && portfolio.net_liquidity && portfolio.net_liquidity > 0 ? value / portfolio.net_liquidity : null;
    return { key, ticker: ps[0].ticker, count: ps.length, ids: ps.map(p => p.id), value, risk, share, netLiqShare,
      concentration: concentrationTone(netLiqShare, profile, data.settings.max_position_pct / 100), riskConcentration: riskConcentrationTone(share, grouped.size, profile) };
  });
  const usedCategories = new Set(active.map(position => position.category_id));
  const displayCategories = categories.filter(category => category.is_active || usedCategories.has(category.id));
  if (usedCategories.has(null)) displayCategories.push({
    id: "unassigned", name: "Nicht zugeordnet", portfolio_id: portfolio.id, user_id: portfolio.user_id,
    sort_order: 999, is_active: true, created_at: portfolio.created_at, target_min: null, target_max: null,
  });
  const categoryOverview = displayCategories.map(category => {
    const own = active.filter(position => category.id === "unassigned" ? !position.category_id : position.category_id === category.id);
    const target = category.is_active && category.target_min !== null && category.target_max !== null
      ? { min: category.target_min, max: category.target_max } : null;
    return { ...category, count: new Set(own.map(instrumentKey)).size, rows: own.length,
      value: sum(own.map(position => byId.get(position.id)?.positionValueBase.value)),
      risk: sum(own.map(position => byId.get(position.id)?.stopRisk.value)), target };
  });
  return { budget, budgetPct: data.settings.risk_budget_pct, active, calculation, byId, instruments, categoryOverview, stalePrices, staleFx, marginLimit: data.settings.max_margin_pct / 100, journal: calculateJournal(positions, sales, now, data.journalReferences) };
}
