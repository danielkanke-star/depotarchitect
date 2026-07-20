import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";
import { getLegalConfig } from "@/lib/config/legal";

export const metadata: Metadata = { title: "Nutzungsbedingungen | DepotArchitect" };

export default function TermsPage() {
  const legal = getLegalConfig();
  return (
    <LegalPage title="Nutzungsbedingungen" intro="Vorläufige Produkt- und Nutzungsabgrenzung, noch keine freigegebenen Vertragsbedingungen.">
      <LegalSection title="Anbieter und Gegenstand">
        <p>{legal.operatorLabel} entwickelt ein Analyse- und Risikomanagementwerkzeug für vom Nutzer erfasste Depotdaten und Grenzwerte.</p>
      </LegalSection>
      <LegalSection title="Funktionsabgrenzung">
        <p>DepotArchitect darf neutrale Kennzahlen zu Depotstruktur, Hebel, Margin, Positionsgrößen, Risiko bis Stop, Konzentrationen und selbst definierten Schwellen anzeigen.</p>
        <p>Die Anwendung erzeugt keine individuellen Kauf-, Verkaufs- oder Umschichtungsempfehlungen, trifft keine automatischen Orderentscheidungen und führt keine Orders aus.</p>
      </LegalSection>
      <LegalSection title="Verantwortung des Nutzers">
        <p>Eingaben, Kurse und Grenzwerte müssen vom Nutzer geprüft werden. Berechnungen können unvollständig oder fehlerhaft sein und ersetzen keine fachliche, steuerliche oder rechtliche Beratung.</p>
      </LegalSection>
      <LegalSection title="Noch festzulegen">
        <p>Vertragsumfang, Verfügbarkeit, Haftungsrahmen, Laufzeit, Kündigung und Aufbewahrungsregeln sind vor einer Kundenöffnung juristisch festzulegen.</p>
      </LegalSection>
    </LegalPage>
  );
}
