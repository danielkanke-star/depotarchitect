import Decimal from "decimal.js";
import type { Portfolio, PortfolioCategory, PortfolioFxRate, PortfolioSettings, Position, PositionPriceObservation, PositionSale } from "./database.types";
import { calculatePortfolio } from "./calculations/portfolio-calculations";
import { positionToCalculationInput } from "./calculations/position-adapter";
import { instrumentKey, calculateJournal } from "./journal";
import { categoryTarget, concentrationTone, depotRiskBudget, riskConcentrationTone } from "./risk-rules";
import { resolvePositionPrice } from "./price-resolution";
import { latestUsableFxRate } from "./market-data";

export type OverviewData = { portfolio: Portfolio; settings: PortfolioSettings; categories: PortfolioCategory[]; positions: Position[];
  fxRates: PortfolioFxRate[]; priceObservations: PositionPriceObservation[]; sales: PositionSale[] };
export function buildOverview(data: OverviewData, now = new Date()) {
  const { portfolio, positions, categories, fxRates, priceObservations, sales } = data;
  const active = positions.filter(p => p.status !== "closed" && p.instrument_type !== "cash");
  const budget = depotRiskBudget(portfolio.net_liquidity, portfolio.risk_profile);
  const inputs=active.map(p => positionToCalculationInput(p, portfolio, categories, fxRates, budget, priceObservations));
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
    return inputs[i].currentFxStatus === "stale" || !times.length || now.getTime()-Math.max(...times)>3600000;
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
      concentration: concentrationTone(netLiqShare, portfolio.risk_profile, data.settings.max_position_pct / 100), riskConcentration: riskConcentrationTone(share, grouped.size, portfolio.risk_profile) };
  });
  const displayCategories = active.some(p=>!p.category_id) ? [...categories,{ id:"unassigned",name:"Nicht zugeordnet",portfolio_id:portfolio.id,user_id:portfolio.user_id,sort_order:999,is_active:true,created_at:portfolio.created_at }] : categories;
  const categoryOverview = displayCategories.map(c => {
    const own = active.filter(p => c.id === "unassigned" ? !p.category_id : p.category_id === c.id);
    return { ...c, count: new Set(own.map(instrumentKey)).size, rows: own.length, value: sum(own.map(p => byId.get(p.id)?.positionValueBase.value)),
      risk: sum(own.map(p => byId.get(p.id)?.stopRisk.value)), target: categoryTarget(c.name) };
  });
  return { budget, active, calculation, byId, instruments, categoryOverview, stalePrices, staleFx, marginLimit: data.settings.max_margin_pct / 100, journal: calculateJournal(positions, sales, now) };
}
