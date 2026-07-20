export type RegistrationMode = "closed" | "invite" | "open";

export type RegistrationEnvironment = Record<string, string | undefined>;

export function parseRegistrationMode(candidate: string | undefined): RegistrationMode {
  return candidate === "invite" || candidate === "open" ? candidate : "closed";
}

export function getRegistrationDecision({
  requestedMode,
  isProduction,
  legalLaunchReady,
}: {
  requestedMode: RegistrationMode;
  isProduction: boolean;
  legalLaunchReady: boolean;
}) {
  const launchGuardActive = isProduction && requestedMode !== "closed" && !legalLaunchReady;

  return {
    requestedMode,
    effectiveMode: launchGuardActive ? "closed" as const : requestedMode,
    launchGuardActive,
  };
}
