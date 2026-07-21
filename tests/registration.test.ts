import { describe, expect, it } from "vitest";
import { getRegistrationDecision, parseRegistrationMode } from "../src/lib/config/registration-core";

describe("registration launch guard", () => {
  it("defaults unknown values to closed", () => {
    expect(parseRegistrationMode(undefined)).toBe("closed");
    expect(parseRegistrationMode("unexpected")).toBe("closed");
  });

  it("forces incomplete Production launches to closed", () => {
    expect(getRegistrationDecision({ requestedMode: "open", isProduction: true, legalLaunchReady: false })).toEqual({
      requestedMode: "open",
      effectiveMode: "closed",
      launchGuardActive: true,
      legalLaunchGuardActive: true,
      privateSiteGuardActive: false,
    });
  });

  it("does not silently open a closed configuration", () => {
    expect(getRegistrationDecision({ requestedMode: "closed", isProduction: true, legalLaunchReady: true }).effectiveMode).toBe("closed");
  });

  it("allows invite/open only when the Production legal guard is ready", () => {
    expect(getRegistrationDecision({ requestedMode: "invite", isProduction: true, legalLaunchReady: true }).effectiveMode).toBe("invite");
    expect(getRegistrationDecision({ requestedMode: "open", isProduction: false, legalLaunchReady: false }).effectiveMode).toBe("open");
  });

  it("forces registration closed whenever the public site is private", () => {
    const result = getRegistrationDecision({
      requestedMode: "open",
      isProduction: false,
      legalLaunchReady: true,
      publicSiteMode: "private",
    });
    expect(result.effectiveMode).toBe("closed");
    expect(result.privateSiteGuardActive).toBe(true);
  });
});
