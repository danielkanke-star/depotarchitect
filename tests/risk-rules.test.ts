import { describe, expect, it } from "vitest";
import { calculateSizing, depotRiskBudget, TRADING_PROFILES, stopAge, positionRiskTone, concentrationTone, riskConcentrationTone, calendarDays, berlinDateTime, parseBerlinDateTime } from "../src/lib/risk-rules";
import { calculatePortfolio } from "../src/lib/calculations/portfolio-calculations";
const input = { netLiquidity: 100000, existingRisk: 10000, riskComplete: true, riskPct: 1.2, entry: 100, stop: 90, fxToBase: 0.9, step: 0.01 };
describe("personal risk and sizing rules", () => {
  it.each(Object.entries(TRADING_PROFILES))("uses 33 percent times %s", (profile, factor) => expect(depotRiskBudget(100000, profile)).toBe(33000*factor));
  it("deducts current total stop risk and rounds down fractional units", () => {
    const r = calculateSizing({ ...input, stop: 89 });
    expect(r).toMatchObject({ error: null, basis: 90000, plannedRisk: 1080, quantity: 109.09 });
    if (r.error === null) expect(r.actualRisk).toBeLessThanOrEqual(1080);
    expect(calculateSizing({ ...input, stop: 89, step: 1 })).toMatchObject({ quantity: 109 });
  });
  it("handles shorts and rejects stops on the profit side of entry", () => {
    expect(calculateSizing({ ...input, direction: "short", stop: 110 })).toMatchObject({ quantity: 120 });
    expect(calculateSizing({ ...input, stop: 101 }).error).toBeTruthy();
    expect(calculateSizing({ ...input, stop: 100 }).error).toBeTruthy();
  });
  it("withholds sizing when total risk, FX or remaining basis is missing", () => {
    for (const changes of [{ riskComplete: false }, { existingRisk: null }, { fxToBase: null }, { existingRisk: 100000 }, { step: 0.0000001 }]) expect(calculateSizing({ ...input, ...changes }).error).toBeTruthy();
  });
  it("allows a truly empty portfolio to start at zero risk", () => {
    const r = calculatePortfolio({ positions: [], netLiquidity: 100000, riskBudget: 33000 });
    expect(r.totalCalculableStopRisk.value).toBe(0); expect(r.riskIsComplete).toBe(true);
    expect(calculateSizing({ ...input, existingRisk: 0 })).toMatchObject({ quantity: 133.33 });
  });
  it("keeps concentration visible even with a tightly protected stop", () => {
    expect(positionRiskTone(0.001,"Aggressiv 1,0")).toBe("good"); expect(concentrationTone(0.25,"Aggressiv 1,0")).toBe("watch");
    expect(positionRiskTone(null,"Normal 0,8")).toBe("neutral"); expect(riskConcentrationTone(0.05,20)).toBe("good"); expect(riskConcentrationTone(0.2,20)).toBe("danger");
    expect(riskConcentrationTone(0.08,20,"Konservativ 0,6")).toBe("high"); expect(riskConcentrationTone(0.08,20,"Aggressiv 1,0")).toBe("watch");
  });
  it("uses calendar dates in Berlin, including DST, and rejects impossible dates", () => {
    expect(stopAge("2026-10-13T22:30:00Z",new Date("2026-10-27T22:00:00Z")).days).toBe(13);
    expect(stopAge("2026-10-13T10:00:00Z",new Date("2026-10-27T10:00:00Z")).tone).toBe("danger");
    expect(calendarDays("2026-02-30","2026-03-10")).toBeNull();
  });
  it("stores Berlin inputs correctly on UTC servers and rejects DST gaps",()=>{
    expect(berlinDateTime("2026-07-01T10:00:00Z")).toBe("2026-07-01T12:00");
    expect(parseBerlinDateTime("2026-07-01T12:00")).toBe("2026-07-01T10:00:00.000Z");
    expect(parseBerlinDateTime("2026-12-01T12:00")).toBe("2026-12-01T11:00:00.000Z");
    expect(parseBerlinDateTime("2026-03-29T02:30")).toBeNull();
  });
});
