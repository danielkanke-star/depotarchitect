import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";
import { getLegalConfig, legalValue } from "@/lib/config/legal";

export const metadata: Metadata = { title: "Impressum | DepotArchitect" };

export default function ImpressumPage() {
  const legal = getLegalConfig();
  return (
    <LegalPage title="Impressum" intro="Vorläufige Betreiberangaben für den Entwicklungsstand von DepotArchitect.">
      <LegalSection title="Betreiber und Verantwortlicher">
        <p>{legal.operatorLabel}</p>
        <p>{legalValue(legal.street)}<br />{legalValue(legal.postalCode)} {legal.city}<br />{legal.country}</p>
      </LegalSection>
      <LegalSection title="Kontakt">
        <p>E-Mail: {legalValue(legal.contactEmail)}</p>
        {legal.contactPhone ? <p>Telefon: {legal.contactPhone}</p> : <p>Telefon: optional, derzeit nicht angegeben</p>}
      </LegalSection>
      <LegalSection title="Offener Prüfpunkt">
        <p>Das vollständige Impressum ist vor einer Kundenöffnung fachlich und juristisch zu prüfen und freizugeben.</p>
      </LegalSection>
    </LegalPage>
  );
}
