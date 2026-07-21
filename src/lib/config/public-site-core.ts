export type PublicSiteMode = "private" | "preview" | "public";

export type PublicSiteEnvironment = Record<string, string | undefined>;

export function parsePublicSiteMode(candidate: string | undefined): PublicSiteMode {
  return candidate === "preview" || candidate === "public" ? candidate : "private";
}

export function getPublicSiteDecision({
  requestedMode,
  legalLaunchReady,
}: {
  requestedMode: PublicSiteMode;
  legalLaunchReady: boolean;
}) {
  const launchGuardActive = requestedMode === "public" && !legalLaunchReady;
  const effectiveMode = launchGuardActive ? "private" as const : requestedMode;

  return {
    requestedMode,
    effectiveMode,
    launchGuardActive,
    indexable: effectiveMode === "public",
  };
}
