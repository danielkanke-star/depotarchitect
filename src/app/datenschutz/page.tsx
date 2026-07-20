import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";
import { getLegalConfig, legalValue } from "@/lib/config/legal";

export const metadata: Metadata = { title: "Datenschutz | DepotArchitect" };

export default function DatenschutzPage() {
  const legal = getLegalConfig();
  return (
    <LegalPage title="Datenschutzinformationen" intro="Transparenter Arbeitsstand zu den aktuell tatsächlich vorgesehenen Verarbeitungen.">
      <LegalSection title="Verantwortlicher">
        <p>{legal.operatorLabel}, {legalValue(legal.street)}, {legalValue(legal.postalCode)} {legal.city}, {legal.country}</p>
        <p>Kontakt: {legalValue(legal.contactEmail)}</p>
      </LegalSection>
      <LegalSection title="Notwendige Verarbeitung">
        <p>Für Anmeldung, Kontoführung und die vom Nutzer angeforderten Depot- und Risikofunktionen werden insbesondere E-Mail-Adresse, interne Benutzer-ID, Kontostatus, Rollen, Portfolios, Kategorien, Positionen, Einstellungen und rechtliche Kenntnisnahmen verarbeitet.</p>
        <p>Die konkreten Rechtsgrundlagen sind vor Kundenstart je Zweck verbindlich festzulegen. <strong>AUFBEWAHRUNGSFRIST VOR KUNDENSTART FESTZULEGEN.</strong></p>
      </LegalSection>
      <LegalSection title="Kenntnisnahme und Bedingungen">
        <p>Die Kenntnisnahme dieser Datenschutzinformationen ist keine pauschale Einwilligung in jede Verarbeitung. Die Annahme der Nutzungsbedingungen und die Kenntnisnahme des Risikohinweises werden getrennt versioniert dokumentiert.</p>
      </LegalSection>
      <LegalSection title="Technisch notwendige Cookies">
        <p>Supabase Auth verwendet technisch notwendige Sitzungsinformationen in Cookies, damit Anmeldung und geschützte Bereiche funktionieren. Solange keine optionalen Analyse- oder Marketingdienste eingesetzt werden, ist kein Einwilligungsbanner für optionale Cookies vorgesehen.</p>
      </LegalSection>
      <LegalSection title="Keine Marketingverfolgung">
        <p>Es werden in diesem Meilenstein keine Analyse-, Marketing-, Session-Replay-, Fingerprinting- oder Social-Pixel-Werkzeuge eingesetzt. Eine freiwillige Marketingeinwilligung ist nicht aktiviert.</p>
      </LegalSection>
      <LegalSection title="Betroffenenrechte und Löschung">
        <p>Angemeldete Nutzer können ihre eigenen Daten als JSON exportieren und eine Kontolöschung zur manuellen Prüfung beantragen. Zuständigkeit, Identitätsprüfung und Fristen für Datenschutzanfragen sind vor Kundenstart festzulegen.</p>
      </LegalSection>
      <LegalSection title="Dienstleister und Transfers">
        <p>Supabase und Vercel sind technisch eingesetzte Dienstleister. Verträge zur Auftragsverarbeitung, Unterauftragsverarbeiter und mögliche Drittlandtransfers müssen vor Kundenstart verbindlich geprüft und dokumentiert werden.</p>
      </LegalSection>
    </LegalPage>
  );
}
