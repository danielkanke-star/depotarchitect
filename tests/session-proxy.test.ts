import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createServerClient, getClaims } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { updateSession } from "../src/lib/supabase/proxy";

const request = (path: string, method = "GET") => new NextRequest(`https://example.test${path}`, {
  method,
  headers: { cookie: "sb-example-auth-token=expired-session-placeholder" },
});

beforeEach(() => {
  vi.clearAllMocks();
  createServerClient.mockReturnValue({ auth: { getClaims } });
  getClaims.mockResolvedValue({ data: null });
});

describe("session proxy availability and access boundaries", () => {
  it.each(["/login", "/auth/login", "/", "/impressum", "/datenschutz", "/nutzungsbedingungen", "/risikohinweis"])(
    "renders public page %s even when Auth is unavailable and cookies are present",
    async path => {
      createServerClient.mockImplementation(() => { throw new Error("Auth unavailable"); });
      const response = await updateSession(request(path));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(createServerClient).not.toHaveBeenCalled();
    },
  );

  it("also permits a public HEAD request without contacting Auth", async () => {
    await updateSession(request("/auth/login", "HEAD"));
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it.each(["/cockpit", "/depot", "/admin", "/konto/datenschutz/export", "/login/private"])(
    "still validates the session and redirects an unauthenticated request to %s",
    async path => {
      const response = await updateSession(request(path));
      expect(getClaims).toHaveBeenCalledOnce();
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://example.test/login");
    },
  );

  it("keeps the session refresh on login POSTs and confirmation callbacks", async () => {
    await updateSession(request("/login", "POST"));
    await updateSession(request("/auth/confirm"));
    expect(getClaims).toHaveBeenCalledTimes(2);
  });

  it("lets a verified session reach its protected page", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "test-user" } } });
    const response = await updateSession(request("/depot"));
    expect(getClaims).toHaveBeenCalledOnce();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
