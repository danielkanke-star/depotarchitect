import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const heartbeat = readFileSync(new URL("../src/components/market-data-heartbeat.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("../src/app/(dashboard)/depot/actions.ts", import.meta.url), "utf8");

describe("market-data runtime feedback", () => {
  it("makes missing provider, schema, mapping and free-budget states visible", () => {
    for (const status of ["provider-disabled", "schema-pending", "mapping-required", "budget", "rate-limited"]) {
      expect(heartbeat).toContain(`case "${status}"`);
    }
    expect(heartbeat).toContain("Aktuelle Kurse:");
    expect(heartbeat).toContain("keine automatischen Zusatzkosten");
  });

  it("detects open legacy positions without a listing instead of silently reporting idle", () => {
    expect(actions).toContain('.select("id,listing_id")');
    expect(actions).toContain("unassignedPositionCount");
    expect(actions).toContain('"mapping-required" as const');
  });
});
