import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEPOT_VIEW_PREFERENCES,
  parseDepotViewPreferences,
  toggleDepotViewPreference,
} from "../src/lib/depot-view-preferences";

const depotPage = readFileSync(new URL("../src/app/(dashboard)/depot/page.tsx", import.meta.url), "utf8");
const preferenceComponent = readFileSync(new URL("../src/components/depot-view-preferences.tsx", import.meta.url), "utf8");

describe("configurable depot columns", () => {
  it("keeps the default view slim and toggles every optional area independently", () => {
    expect(DEFAULT_DEPOT_VIEW_PREFERENCES).toEqual({ baseMarketValue: false, risk: false, margin: false, priceDetails: false });
    for (const key of Object.keys(DEFAULT_DEPOT_VIEW_PREFERENCES) as Array<keyof typeof DEFAULT_DEPOT_VIEW_PREFERENCES>) {
      const toggled = toggleDepotViewPreference(DEFAULT_DEPOT_VIEW_PREFERENCES, key);
      expect(toggled[key]).toBe(true);
      expect(Object.entries(toggled).filter(([candidate]) => candidate !== key).every(([, value]) => value === false)).toBe(true);
    }
  });

  it("persists only known boolean preferences and safely rejects malformed storage", () => {
    expect(parseDepotViewPreferences('{"risk":true,"margin":true,"unknown":true}')).toEqual({ baseMarketValue: false, risk: true, margin: true, priceDetails: false });
    expect(parseDepotViewPreferences("not-json")).toEqual(DEFAULT_DEPOT_VIEW_PREFERENCES);
    expect(preferenceComponent).toContain("localStorage");
  });

  it("uses instrument market value as primary and names the optional column by portfolio currency", () => {
    expect(depotPage).toContain("result?.positionValueInstrument");
    expect(depotPage).toContain("Marktwert {portfolio.currency}");
    expect(depotPage).toContain("FX fehlt");
    expect(depotPage).toContain("Kein Stop");
    expect(depotPage).not.toContain("Basiswert");
  });
});
