import { describe, expect, it } from "vitest";
import { buildSecurityHeaders } from "../src/lib/config/security-headers";

describe("security headers", () => {
  it("allows only the configured Supabase endpoint for external connections", () => {
    const headers = buildSecurityHeaders({ NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" });
    const csp = headers.find((header) => header.key === "Content-Security-Policy")?.value;
    expect(csp).toContain("connect-src 'self' https://project.supabase.co wss://project.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("google-analytics");
  });

  it("sets HSTS only for the Production environment", () => {
    expect(buildSecurityHeaders({ VERCEL_ENV: "preview" }).some((header) => header.key === "Strict-Transport-Security")).toBe(false);
    expect(buildSecurityHeaders({ VERCEL_ENV: "production" }).some((header) => header.key === "Strict-Transport-Security")).toBe(true);
  });
});
