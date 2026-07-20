import "server-only";

import { getLegalLaunchReadiness } from "@/lib/config/legal";
import {
  getRegistrationDecision,
  parseRegistrationMode,
  type RegistrationEnvironment,
} from "@/lib/config/registration-core";

export type { RegistrationMode } from "@/lib/config/registration-core";

export function resolveRegistrationConfig(env: RegistrationEnvironment = process.env) {
  const requestedMode = parseRegistrationMode(env.REGISTRATION_MODE);
  const isProduction = env.VERCEL_ENV === "production";
  const readiness = getLegalLaunchReadiness(env);
  const decision = getRegistrationDecision({
    requestedMode,
    isProduction,
    legalLaunchReady: readiness.ready,
  });

  return {
    ...decision,
    missingLegalRequirements: readiness.missing,
  };
}

export function getRegistrationConfig() {
  const config = resolveRegistrationConfig(process.env);

  if (config.launchGuardActive) {
    console.warn(
      "[launch-check] Registration forced to closed because legal launch requirements are incomplete.",
    );
  }

  return config;
}
