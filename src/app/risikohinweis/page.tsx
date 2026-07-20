import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = { title: "Risikohinweis | DepotArchitect" };

export default function RiskNoticePage() {
  return (
    <LegalPage title="Risikohinweis" intro="Vorläufige Abgrenzung der Analysefunktionen und der mit Kapitalmarktentscheidungen verbundenen Risiken.">
      <LegalSection title="Keine Anlageberatung">
        <p>DepotArchitect ist ein Analyse- und Risikomanagementwerkzeug und ersetzt keine Anlageberatung. Es wird nicht beurteilt, ob ein konkretes Finanzinstrument für einen bestimmten Nutzer geeignet ist.</p>
      </LegalSection>
      <LegalSection title="Keine Handlungsempfehlungen oder Ausführung">
        <p>Die Anwendung gibt keine individuellen Kauf- oder Verkaufsempfehlungen, bestimmt keine konkreten Umschichtungen, verwaltet kein Vermögen und führt keine Orders aus.</p>
      </LegalSection>
      <LegalSection title="Neutrale Berechnungen und Warnungen">
        <p>Angezeigt werden dürfen Depotstruktur, Hebel, Margin, Positionsgrößen, Risiko bis Stop, Konzentrationen, Warnschwellen sowie vom Nutzer selbst eingetragene Grenzwerte. Warnungen beziehen sich ausschließlich auf objektive Kennzahlen oder diese eigenen Regeln.</p>
      </LegalSection>
      <LegalSection title="Kapitalmarktrisiken">
        <p>Finanzinstrumente können erheblich an Wert verlieren; bei Hebelprodukten können Verluste besonders schnell eintreten. Daten und Berechnungen können verspätet, unvollständig oder fehlerhaft sein. Entscheidungen bleiben vollständig beim Nutzer.</p>
      </LegalSection>
      <LegalSection title="Prüfvorbehalt">
        <p>Der endgültige Risikohinweis muss vor Kundenöffnung juristisch geprüft werden. Neue Empfehlungs-, Order- oder Automatisierungsfunktionen erfordern vor ihrer Einführung eine gesonderte rechtliche und gegebenenfalls finanzaufsichtsrechtliche Prüfung.</p>
      </LegalSection>
    </LegalPage>
  );
}
