import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../src/app/api/availability/route";

const secret = "test-only-cron-token";
const request = (authorization?: string) => new Request("https://example.test/api/availability", {
  headers: authorization ? { authorization } : {},
});

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", secret);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("scheduled availability check", () => {
  it("rejects an unauthenticated request without any Supabase traffic", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer wrong-token"))).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("checks all services without a session and reports a partial outage", async () => {
    let journalReady = true;
    const fetch = vi.fn(async (url: URL) => {
      if (url.pathname === "/auth/v1/health") return Response.json({ version: "test" });
      if (url.searchParams.get("section") === "journal") return Response.json(journalReady);
      return Response.json(true);
    });
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const authorized = request(`Bearer ${secret}`);
    expect((await GET(authorized)).status).toBe(204);
    expect(fetch).toHaveBeenCalledTimes(4);

    journalReady = false;
    expect((await GET(authorized)).status).toBe(503);
  });
});
