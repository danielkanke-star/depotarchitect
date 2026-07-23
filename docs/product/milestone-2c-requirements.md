# Meilenstein 2C – Verbindliche Produktspezifikation

Status: verbindliches Zielbild vor technischer Umsetzung. Dieses Dokument beschreibt Produktverhalten und fachliche Grenzen. Es führt keine Tabellen, Migrationen, Server Actions oder Oberflächenänderungen ein.

Die Detailmodelle sind in folgenden Dokumenten festgelegt:

- [Mehrdepot-Modell](../architecture/multi-portfolio-model.md)
- [Positions- und Transaktionsmodell](../architecture/position-transaction-model.md)
- [Broker- und Positionsmodell](../architecture/broker-position-model.md)
- [Manuelle Datenerfassung](manual-data-entry.md)
- [Roadmap](roadmap.md)

## Produktgrundsätze

1. Ein Benutzer kann mehrere vollständig getrennte DepotArchitect-Depots führen.
2. Jedes Depot besitzt eine unveränderliche interne `portfolio_id` und eine bei Anlage festgelegte Basiswährung.
3. Depotbasiswährung, Instrumentwährung und Cashwährung sind verschiedene fachliche Ebenen.
4. Ein Brokerkonto ist eine technische Datenquelle; ein DepotArchitect-Depot ist der benannte Auswertungs- und Arbeitskontext.
5. Kategorie, Strategie und Notizen gehören an eine DepotArchitect-Teilposition, nicht dauerhaft an einen Ticker oder Broker-Gesamtbestand.
6. Cashbestände, Kapitalbewegungen und NetLiq-Snapshots bleiben getrennte Sachverhalte.
7. Mathematisch ableitbare Werte werden berechnet und nicht als manuelle Pflichtangaben geführt.
8. Geschlossene Positionen werden archiviert, nicht automatisch gelöscht.
9. Konsolidierte Ansichten dürfen einzeldepotbezogene Marginrisiken nie verdecken.

## Muss-Anforderungen

### Depotkontext

- Ein Benutzer kann mehrere Depots anlegen und getrennt auswerten.
- Bei der Anlage sind Depotname, Broker beziehungsweise Anbieter, Kontotyp und Basiswährung Pflicht.
- Vorgesehene Kontotypen sind `cash_account`, `margin_account`, `portfolio_margin_account` und `other`.
- Die interne `portfolio_id` bleibt unveränderlich und wird für jede fachliche Zuordnung verwendet.
- Ein Depotwechsel begrenzt mindestens Cockpit, Depot, Risiko, Cash, Positionen und Depoteinstellungen auf das gewählte Depot.
- Keine Abfrage oder Berechnung darf Daten verschiedener Depots unbeabsichtigt vermischen.
- Vollständige Brokerkontonummern dürfen nicht offen angezeigt werden.

### Basis- und Datenwährungen

- Kein Depot darf ohne Basiswährung entstehen.
- Jedes Depot kann eine andere Basiswährung haben.
- Die Basiswährung ist Bewertungs- und Berichtswährung des Depots, nicht Handelswährung seiner Instrumente.
- Nach der Anlage ist sie nicht über ein normales Eingabefeld veränderbar.
- Eine spätere Änderung benötigt einen kontrollierten Neubewertungs- und Migrationsprozess.
- Einstandskurs, aktueller Kurs, Verkaufskurs und Stoppkurs bleiben in Instrumentwährung.
- Cash wird als eigener Saldo je Cashwährung geführt; Instrument- und Cashwährung werden nicht automatisch gleichgesetzt.

### Positionen und Transaktionen

- Ein Instrument kann mehrere DepotArchitect-Teilpositionen besitzen.
- Eine Teilposition enthält einen Einstieg beziehungsweise Kauf und null bis mehrere Verkäufe.
- Die offene Menge wird aus Käufen und Verkäufen abgeleitet.
- Verkaufte Menge kleiner als gekaufte Menge bedeutet „teilweise geschlossen“.
- Verkaufte Menge gleich gekaufter Menge bedeutet „geschlossen“.
- Verkaufte Menge größer als die offene Menge ist unzulässig.
- Offene und geschlossene Teilpositionen bleiben unter demselben Instrument auffindbar.
- Eine geschlossene Teilposition und ihre Notizen werden bei einem späteren Neukauf desselben Tickers nicht überschrieben.

### Cash, Kapital und NetLiq

- Cashbestände bilden den aktuellen Saldo je Währung ab.
- Kapitalbewegungen unterscheiden Einzahlung, Auszahlung, internen Transfer und Eröffnungs- beziehungsweise Ausgleichsbuchung.
- Eine Einzahlung ist kein Gewinn; eine Auszahlung ist kein Verlust.
- Ein interner Transfer darf in konsolidierten Ansichten nicht doppelt als externe Kapitalbewegung zählen.
- NetLiq bleibt zunächst ein separates Quelldatum mit Wert, Basiswährung, Zeitpunkt und Quelle.
- NetLiq wird ohne vollständige Brokerbuchhaltung nicht aus Cash und Positionen rekonstruiert.

### Konsolidierung und Margin

- Virtuelle Depotgruppen kopieren oder verschieben keine Positionen.
- Eine Gruppe besitzt eine Berichtswährung, ohne die Basiswährungen ihrer Depots zu ändern.
- Gleiche Instrumente dürfen gruppiert werden, müssen aber nach Depot aufklappbar bleiben.
- Ein Marginüberschuss in Depot A darf nicht als Schutz gegen einen Margin Call in Depot B dargestellt werden.
- Neben konsolidierten Werten müssen Margin-Auslastungen der einzelnen Margin-Depots sichtbar bleiben.
- Cashkonten erhalten für Margin die Anzeige „nicht zutreffend“.

### Bedienung und Navigation

- Zielnavigation: Cockpit, Depot, Risiko, Einstellungen.
- Unter Depot: Depotübersicht, Positionen, Cash, Kapitalbewegungen, Datenquellen und Import, Brokerkonten.
- Import bleibt untergeordnete Datenzufuhr und ist kein eigener Hauptproduktbereich.
- Ein globaler Ansichtsumschalter bietet Kompakt, Erweitert und Analyse.
- Der Umschalter verändert nur die Darstellung, nie Daten oder Berechnungen.

## Soll-Anforderungen

- Die zuletzt gewählte Depot- oder Gruppenansicht kann als Benutzerpräferenz gespeichert werden.
- Depots können später Broker-Infrastruktur, maskierte Brokerkennung, Inhaber-Alias und Beschreibung führen.
- Depotgruppen können Gesamt-NetLiq, Wertpapier-Bruttomarktwert, NetLiq-Hebel, Cashwert, Cash nach Währungen, Instrument- und Kategoriegewichte sowie Long-/Short-Marktwerte zeigen.
- Die konsolidierte Marginansicht soll die höchste einzelne Auslastung und das betroffene Depot hervorheben.
- Kommentare sollen später um mehrere chronologische Journal-Einträge ergänzt werden.
- Screenshots sollen per Drag-and-drop, Zwischenablage und Dateiauswahl hinterlegt sowie auf Desktop als Vorschau und vollständig per Klick oder Tippen angezeigt werden.

## Informationsstufen

### Kompakt

- Ticker
- Produktart
- Menge
- aktueller Kurs
- aktueller Positionswert
- eine zentrale Kennzahl

### Erweitert

Zusätzlich Einstandskurs, Kurs-G&V, NetLiq-Anteil, Stopp, Risiko und Margin.

### Analyse

Vollständige Kennzahlen, Herkunft, FX, Zeitstempel, Teilpositionen und später Orders.

## Nicht-Ziele dieser Spezifikation

- keine technische Implementierung von Mehrdepotfähigkeit oder Depotwähler
- keine Tabellen, Migrationen oder RLS-Policies
- keine neue Navigation oder Baumansicht
- keine Broker-, Kurs- oder FX-Anbindung
- keine Screenshot- oder Storagefunktion
- keine Orderausführung oder automatische Teilpositionszuordnung
- keine komplexe Konten-P&L oder vollständige Brokerbuchhaltung
- keine Änderung an Meilenstein 2B.2 oder Production

## Abnahmekriterien für die spätere Umsetzung

- Zwei Depots desselben Benutzers bleiben in CRUD, Berechnung und Anzeige vollständig isoliert.
- Zwei Depots können unterschiedliche Basiswährungen und Kontotypen besitzen.
- Ein Depotwähler setzt den Kontext konsistent über alle depotbezogenen Bereiche.
- Depotgruppen konsolidieren ohne Kopie oder Verschiebung von Ursprungsdaten.
- Marginrisiken bleiben pro Depot sichtbar und Cashkonten werden nicht mit einer Marginquote versehen.
- Teilverkäufe leiten offene Menge und Status korrekt ab und verhindern Überverkauf.
- Einzahlungen, Auszahlungen, interne Transfers, Cashsalden und NetLiq werden fachlich getrennt behandelt.
- Geschlossene Positionen und Notizen bleiben dauerhaft nachvollziehbar.
- Kompakt, Erweitert und Analyse liefern dieselben Berechnungen mit unterschiedlicher Informationsdichte.
- Die manuelle Pflege benötigt nur Quelldaten; ableitbare Kennzahlen sind nicht editierbar.

## Offene fachliche Entscheidungen

- Darf ein Depot später mehreren Brokerkonten gleichzeitig zugeordnet werden, und nach welchen Regeln?
- Wie werden Depotgruppen bei fehlenden oder veralteten Gruppen-FX-Kursen als unvollständig gekennzeichnet?
- Wie werden Gebühren, Steuern, Dividenden, Zinsen, Kapitalmaßnahmen und Finanzierungskosten in der späteren Gesamt-P&L modelliert?
- Wie werden Loszuordnung und realisierter Gewinn bei mehreren Käufen und Verkäufen bestimmt: explizite Benutzerzuordnung, FIFO oder brokerseitige Zuordnung?
- Wie werden Transfers sicher gepaart, wenn Betrag, Währung oder Valuta zwischen Quell- und Zieldepot abweichen?
- Welche Brokerorder ist bei mehreren Stoporders für eine Teilposition fachlich maßgeblich?
- Welche private Storage-, Lösch-, Größen- und Malware-Prüfstrategie gilt für Screenshots?

Vor Beginn von Meilenstein 2C.6 muss die dokumentierte Sharp-Sicherheitsfrage vollständig behoben und die Verarbeitung nicht vertrauenswürdiger Bilder neu freigegeben sein.
