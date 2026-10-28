import Decimal from "decimal.js";
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
const BERLIN_DATE_FORMAT = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });
const BERLIN_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone:"Europe/Berlin", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23" });

export const TRADING_PROFILES = {
  "Stockkonservativ 0,4": 0.4,
  "Konservativ 0,6": 0.6,
  "Normal 0,8": 0.8,
  "Aggressiv 1,0": 1,
  "Aggro 1,2": 1.2,
} as const;
export type TradingProfile = keyof typeof TRADING_PROFILES;
export type RiskTone = "neutral" | "good" | "watch" | "high" | "danger";
export const CATEGORY_TARGETS: Record<string, { min: number; max: number }> = {
  kerninvestment: { min: 8, max: 8 }, momentumtrade: { min: 9, max: 9 },
  taktischebeimischung: { min: 4, max: 4 }, hedge: { min: 1, max: 2 },
};
export function categoryTarget(name: string) {
  return CATEGORY_TARGETS[name.toLowerCase().replace(/[\s_-]/g, "")] ?? null;
}
export function profileFactor(profile: string): number | null {
  return TRADING_PROFILES[profile as TradingProfile] ?? null;
}
export function depotRiskBudget(netLiquidity: number | null, profile: string) {
  const factor = profileFactor(profile);
  return netLiquidity !== null && Number.isFinite(netLiquidity) && netLiquidity > 0 && factor !== null
    ? new Decimal(netLiquidity).mul("0.33").mul(factor).toNumber() : null;
}
export function berlinDate(date: Date = new Date()) {
  return BERLIN_DATE_FORMAT.format(date);
}
export function berlinDateTime(value: string | Date) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts=BERLIN_TIME_FORMAT.formatToParts(date);
  const get=(key:string)=>parts.find(p=>p.type===key)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
export function parseBerlinDateTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const target=Date.parse(`${value}Z`);
  if (!Number.isFinite(target)) return null;
  let guess=target;
  for(let i=0;i<3;i++) guess+=target-Date.parse(`${berlinDateTime(new Date(guess))}Z`);
  return berlinDateTime(new Date(guess))===value ? new Date(guess).toISOString() : null;
}
export function calendarDays(start: string | null, end: string): number | null {
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start.slice(0, 10)) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  const from = Date.parse(start.slice(0, 10)); const to = Date.parse(end);
  return Number.isFinite(from) && Number.isFinite(to) && new Date(from).toISOString().slice(0, 10) === start.slice(0, 10)
    && new Date(to).toISOString().slice(0, 10) === end && to >= from ? Math.round((to - from) / 86400000) : null;
}
export function stopAge(asOf: string | null, now = new Date()) {
  const days = asOf && Number.isFinite(Date.parse(asOf)) ? calendarDays(berlinDate(new Date(asOf)), berlinDate(now)) : null;
  const tone: RiskTone = days === null ? "neutral" : days >= 14 ? "danger" : days >= 11 ? "high" : days >= 7 ? "watch" : "good";
  return { days, tone, label: days === null ? "Stoppdatum unbekannt" : `${days} Tage unverändert` };
}
export function budgetTone(utilization: number | null): RiskTone {
  return utilization === null ? "neutral" : utilization >= 1 ? "danger" : utilization >= 0.9 ? "high" : utilization >= 0.6 ? "watch" : "good";
}
export function positionRiskTone(riskToNetLiq: number | null, profile: string): RiskTone {
  const factor = profileFactor(profile);
  if (riskToNetLiq === null || factor === null) return "neutral";
  return riskToNetLiq >= 0.02 * factor ? "danger" : riskToNetLiq >= 0.011 * factor ? "high" : riskToNetLiq >= 0.005 * factor ? "watch" : "good";
}
// Concentration is independent of stop protection. Thresholds are personal review rules.
export function concentrationTone(netLiqShare: number | null, profile: string, baseThreshold = 0.15): RiskTone {
  const factor = profileFactor(profile);
  return netLiqShare === null || factor === null ? "neutral" : netLiqShare >= baseThreshold * factor ? "watch" : "good";
}
export function riskConcentrationTone(share: number | null, instrumentCount: number, profile = "Aggressiv 1,0"): RiskTone {
  const factor=profileFactor(profile);
  if (share === null || instrumentCount <= 1 || factor === null) return "neutral";
  const multiple = share * instrumentCount;
  return multiple >= 1+2*factor ? "danger" : multiple >= 1+factor ? "high" : multiple >= 1+0.5*factor ? "watch" : "good";
}

export type SizingInput = {
  netLiquidity: number | null; existingRisk: number | null; riskComplete: boolean;
  riskPct: number; entry: number; stop: number; fxToBase: number | null;
  step: number; multiplier?: number; direction?: "long" | "short"; budget?: number | null;
};
export function calculateSizing(input: SizingInput) {
  const { netLiquidity, existingRisk, riskComplete, riskPct, entry, stop, fxToBase, step, multiplier = 1, direction = "long", budget = null } = input;
  if (!riskComplete || existingRisk === null) return { error: "Das bestehende Stopprisiko ist unvollständig." } as const;
  if (![netLiquidity, existingRisk, riskPct, entry, stop, fxToBase, step, multiplier].every(v => v !== null && Number.isFinite(v))) return { error: "Für die Berechnung fehlen gültige Angaben." } as const;
  if (netLiquidity === null || netLiquidity <= 0 || existingRisk < 0 || riskPct <= 0 || riskPct > 100 || entry <= 0 || stop < 0 || !fxToBase || fxToBase <= 0 || step < 0.000001 || new Decimal(step).decimalPlaces() > 6 || multiplier <= 0) return { error: "Bitte gültige Werte und eine Stückelung mit höchstens sechs Nachkommastellen eingeben." } as const;
  const basis = new Decimal(netLiquidity).minus(existingRisk);
  const distance = direction === "long" ? new Decimal(entry).minus(stop) : new Decimal(stop).minus(entry);
  if (basis.lte(0)) return { error: "Nach Abzug des bestehenden Stopprisikos bleibt keine positive Berechnungsbasis." } as const;
  if (distance.lte(0)) return { error: "Der Stopp muss auf der Verlustseite des geplanten Einstiegskurses liegen." } as const;
  const plannedRisk = basis.mul(riskPct).div(100);
  const perUnit = distance.mul(multiplier).mul(fxToBase);
  const quantity = plannedRisk.div(perUnit).div(step).floor().mul(step);
  const actualRisk = quantity.mul(perUnit);
  const nativeValue = quantity.mul(entry).mul(multiplier);
  const baseValue = nativeValue.mul(fxToBase);
  return { error: null, basis: basis.toNumber(), plannedRisk: plannedRisk.toNumber(), actualRisk: actualRisk.toNumber(), quantity: quantity.toNumber(),
    nativeValue: nativeValue.toNumber(), baseValue: baseValue.toNumber(), netLiqShare: baseValue.div(netLiquidity).toNumber(),
    utilizationAfter: budget && budget > 0 ? new Decimal(existingRisk).add(actualRisk).div(budget).toNumber() : null,
    targets: [1, 2, 3].map(r => new Decimal(entry).add(distance.mul(direction === "long" ? r : -r)).toNumber()) };
}
