import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/lib/config/security-headers";

const securityHeaders = buildSecurityHeaders(process.env);

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
