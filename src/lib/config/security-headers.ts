export type SecurityEnvironment = Record<string, string | undefined>;

function supabaseOrigins(configuredUrl: string | undefined) {
  if (!configuredUrl) return [];
  try {
    const origin = new URL(configuredUrl).origin;
    return [origin, origin.replace(/^https:/, "wss:")];
  } catch {
    return [];
  }
}

export function buildSecurityHeaders(env: SecurityEnvironment) {
  const isProduction = env.VERCEL_ENV === "production";
  const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseOrigins(env.NEXT_PUBLIC_SUPABASE_URL).join(" ")}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
    ...(isProduction
      ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
      : []),
  ];
}
