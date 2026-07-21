import "server-only";

import { getLegalLaunchReadiness } from "@/lib/config/legal";
import {
  getPublicSiteDecision,
  parsePublicSiteMode,
  type PublicSiteEnvironment,
} from "@/lib/config/public-site-core";

export type { PublicSiteMode } from "@/lib/config/public-site-core";

export function resolvePublicSiteConfig(env: PublicSiteEnvironment = process.env) {
  const readiness = getLegalLaunchReadiness(env);
  const decision = getPublicSiteDecision({
    requestedMode: parsePublicSiteMode(env.PUBLIC_SITE_MODE),
    legalLaunchReady: readiness.ready,
  });

  return {
    ...decision,
    missingLegalRequirements: readiness.missing,
  };
}

export function getPublicSiteConfig() {
  const config = resolvePublicSiteConfig(process.env);

  if (config.launchGuardActive) {
    console.warn(
      "[launch-check] Public site forced to private because legal launch requirements are incomplete.",
    );
  }

  return config;
}
