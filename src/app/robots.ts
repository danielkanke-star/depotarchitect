import type { MetadataRoute } from "next";
import { getPublicSiteConfig } from "@/lib/config/public-site";

export default function robots(): MetadataRoute.Robots {
  const publicSite = getPublicSiteConfig();

  if (!publicSite.indexable) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/cockpit/",
        "/depot/",
        "/einstellungen/",
        "/konto/",
        "/login/",
        "/mfa/",
        "/performance/",
        "/risiko/",
        "/datenschutz/",
        "/impressum/",
        "/nutzungsbedingungen/",
        "/risikohinweis/",
      ],
    },
  };
}
