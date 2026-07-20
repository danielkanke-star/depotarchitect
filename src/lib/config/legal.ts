import "server-only";

export const LEGAL_MISSING = "RECHTLICH ZU ERGÄNZEN";

type Environment = Record<string, string | undefined>;

const value = (candidate: string | undefined, fallback = "") =>
  candidate?.trim() || fallback;

export function getLegalConfig(env: Environment = process.env) {
  const operatorName = value(env.LEGAL_OPERATOR_NAME, "Daniel Kanke");
  const businessName = value(env.LEGAL_BUSINESS_NAME);

  return {
    productName: "DepotArchitect",
    operatorName,
    businessName,
    street: value(env.LEGAL_OPERATOR_STREET),
    postalCode: value(env.LEGAL_OPERATOR_POSTAL_CODE),
    city: value(env.LEGAL_OPERATOR_CITY, "Rheda-Wiedenbrück"),
    country: value(env.LEGAL_OPERATOR_COUNTRY, "Deutschland"),
    contactEmail: value(env.LEGAL_CONTACT_EMAIL),
    contactPhone: value(env.LEGAL_CONTACT_PHONE),
    privacyApproved: env.LEGAL_PRIVACY_APPROVED === "true",
    imprintApproved: env.LEGAL_IMPRINT_APPROVED === "true",
    processorsReviewed: env.LEGAL_PROCESSORS_REVIEWED === "true",
    operatorLabel: businessName
      ? `${businessName} – betrieben von ${operatorName}`
      : `DepotArchitect – betrieben von ${operatorName}`,
  };
}

export function getLegalLaunchReadiness(env: Environment = process.env) {
  const legal = getLegalConfig(env);
  const missing: string[] = [];

  if (!legal.street) missing.push("vollständige Straße und Hausnummer");
  if (!legal.postalCode) missing.push("Postleitzahl");
  if (!legal.contactEmail) missing.push("Kontakt-E-Mail");
  if (!legal.privacyApproved) missing.push("freigegebene Datenschutzerklärung");
  if (!legal.imprintApproved) missing.push("freigegebenes Impressum");
  if (!legal.processorsReviewed) missing.push("abgeschlossene Auftragsverarbeiterprüfung");

  return { ready: missing.length === 0, missing };
}

export function legalValue(candidate: string) {
  return candidate || LEGAL_MISSING;
}
