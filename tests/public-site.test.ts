import { describe, expect, it } from "vitest";
import { getPublicSiteDecision, parsePublicSiteMode } from "../src/lib/config/public-site-core";

describe("public site launch guard", () => {
  it("defaults missing or unknown values to private", () => {
    expect(parsePublicSiteMode(undefined)).toBe("private");
    expect(parsePublicSiteMode("unexpected")).toBe("private");
  });

  it("keeps private and preview modes noindex", () => {
    expect(getPublicSiteDecision({ requestedMode: "private", legalLaunchReady: false }).indexable).toBe(false);
    expect(getPublicSiteDecision({ requestedMode: "preview", legalLaunchReady: false }).indexable).toBe(false);
  });

  it("blocks public mode when legal launch requirements are incomplete", () => {
    expect(getPublicSiteDecision({ requestedMode: "public", legalLaunchReady: false })).toEqual({
      requestedMode: "public",
      effectiveMode: "private",
      launchGuardActive: true,
      indexable: false,
    });
  });

  it("allows an indexable public site only after legal launch readiness", () => {
    expect(getPublicSiteDecision({ requestedMode: "public", legalLaunchReady: true })).toEqual({
      requestedMode: "public",
      effectiveMode: "public",
      launchGuardActive: false,
      indexable: true,
    });
  });
});
