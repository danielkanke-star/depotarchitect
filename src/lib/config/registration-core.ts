export type RegistrationMode = "closed" | "invite" | "open";

export type RegistrationEnvironment = Record<string, string | undefined>;

export function parseRegistrationMode(candidate: string | undefined): RegistrationMode {
  return candidate === "invite" || candidate === "open" ? candidate : "closed";
}

export function getRegistrationDecision({
  requestedMode,
  isProduction,
  legalLaunchReady,
  publicSiteMode = "preview",
}: {
  requestedMode: RegistrationMode;
  isProduction: boolean;
  legalLaunchReady: boolean;
  publicSiteMode?: "private" | "preview" | "public";
}) {
  const legalLaunchGuardActive = isProduction && requestedMode !== "closed" && !legalLaunchReady;
  const privateSiteGuardActive = publicSiteMode === "private" && requestedMode !== "closed";
  const launchGuardActive = legalLaunchGuardActive || privateSiteGuardActive;

  return {
    requestedMode,
    effectiveMode: launchGuardActive ? "closed" as const : requestedMode,
    launchGuardActive,
    legalLaunchGuardActive,
    privateSiteGuardActive,
  };
}
