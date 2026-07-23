# Mehrdepot- und Konsolidierungsmodell

Status: verbindliches fachliches Zielbild für Meilenstein 2C. Keine technische Implementierung.

## 1. DepotArchitect-Depot

Ein DepotArchitect-Depot ist ein vollständig getrennter, vom Benutzer benannter Auswertungsbereich. Beispiele:

- Estably Hauptdepot
- CapTrader Trading
- IBKR Langfristdepot
- separates Cashdepot

Jedes Depot besitzt eine unveränderliche interne `portfolio_id`. Alle Positionen, Cashbestände, Kategorien, Strategien, Transaktionen, Kapitalbewegungen, NetLiq-Snapshots, Notizen und späteren Brokerzuordnungen müssen eindeutig diesem Schlüssel zugeordnet sein.

### Pflichtangaben bei Anlage

- frei wählbarer Depotname
- Broker beziehungsweise Anbieter
- Kontotyp
- Basiswährung

Kontotypen:

- `cash_account`
- `margin_account`
- `portfolio_margin_account`
- `other`

Später optional:

- Broker-Infrastruktur
- maskierte Brokerkennung
- Eigentumsart beziehungsweise Inhaber-Alias
- Beschreibung

Eine vollständige Brokerkontonummer darf weder als regulärer Anzeigename verwendet noch offen angezeigt werden.

## 2. Basiswährung als Depotidentität

Die Basiswährung wird bei Anlage zwingend gewählt und gehört dauerhaft zur fachlichen Identität des Depots.

- Kein Depot ohne Basiswährung.
- Verschiedene Depots desselben Benutzers dürfen verschiedene Basiswährungen besitzen.
- Nach Anlage keine Änderung über ein normales Eingabefeld.
- Eine spätere Änderung verlangt einen kontrollierten Migrations- und Neubewertungsvorgang für Positionen, Cash, FX, Margin, Risiko, Historie und Berichte.

Die Basiswährung ist Bewertungs- und Berichtswährung. Sie sagt nicht aus, in welcher Währung ein Instrument gehandelt oder finanziert wurde.

## 3. Strikte Währungsebenen

### Depotbasiswährung

Beispiel EUR. Sie ist die Einheit für NetLiq, Cockpit-Kennzahlen, Margin, Risiko, Gewichtungen und NetLiq-Hebel.

### Instrumentwährung

Eine US-Aktie kann in USD gehandelt werden, obwohl das Depot EUR als Basiswährung besitzt. Einstandskurs, aktueller Kurs, Verkaufskurs und Stoppkurs bleiben in Instrumentwährung. Die Umrechnung in die Basiswährung verwendet die dafür vorgesehene FX-Quelle.

### Cashwährung

Ein EUR-Depot kann gleichzeitig EUR-Cash, negativen USD-Cash und negativen CHF-Cash besitzen. Cashwährung beschreibt den tatsächlichen Währungssaldo. Sie darf nicht aus der Währung eines Instruments abgeleitet oder mit ihr gleichgesetzt werden.

## 4. Brokerkonto und DepotArchitect-Depot

Ein **Brokerkonto** ist eine technische Datenquelle bei einem Anbieter. Es enthält brokerseitige Identitäten, Synchronisationszustände, Bestände, Transaktionen und Orders.

Ein **DepotArchitect-Depot** ist der benannte Arbeits- und Auswertungsbereich mit Basiswährung, Kontotyp, Positionen, Cash, NetLiq, Kategorien, Strategien, Historie und Notizen.

Für die erste technische Version darf genau ein Depot genau einem Brokerkonto entsprechen. Das Zielmodell darf jedoch nicht ausschließen, dass später mehrere Brokerverbindungen oder Datenquellen einem Depot zugeordnet werden. Brokeridentitäten und Benutzerdaten bleiben getrennt.

## 5. Depotwähler und Abfragekontext

Oben im Cockpit befindet sich ein gut sichtbarer Depotwähler:

```text
Ausgewähltes Depot:
[ Estably Hauptdepot ▼ ]
```

Der ausgewählte Kontext gilt mindestens für Cockpit, Depot, Risiko, Cash, Positionen und Depoteinstellungen. Ein Wechsel muss alle depotbezogenen Abfragen und Berechnungen konsistent auf die neue `portfolio_id` begrenzen. Ein UI-Parameter allein ist keine ausreichende Autorisierung; Eigentum und Depotzuordnung sind serverseitig und per RLS zu prüfen.

Die zuletzt gewählte Ansicht darf als Benutzerpräferenz gespeichert werden. Eine ungültige, gelöschte oder nicht mehr berechtigte Auswahl fällt sicher auf ein vorhandenes eigenes Depot zurück, ohne fremde Daten zu laden.

## 6. Virtuelle Depotgruppen

Eine Depotgruppe ist eine gespeicherte Auswahl eigener Depots für konsolidierte Berichte, zum Beispiel:

- Alle Depots
- Trading-Depots
- Langfristdepots

Eine Gruppe kopiert, verschiebt oder besitzt keine Positionen. Ursprungsdaten bleiben in ihren Depots. Gruppenmitgliedschaft steuert ausschließlich die Auswertung.

### Mögliche Gruppenkennzahlen

- gesamte NetLiq
- gesamter Wertpapier-Bruttomarktwert
- konsolidierter NetLiq-Hebel
- gesamter Cashwert
- Cash nach Währungen
- Gesamtgewicht je Instrument
- Gesamtgewicht je Kategorie
- Long- und Short-Marktwerte

Gleiche Instrumente dürfen aggregiert werden, müssen aber nach Depot aufklappbar bleiben:

```text
MSFT – Gesamtbestand
├── Estably: 5 Aktien
├── CapTrader: 3 Aktien
└── IBKR: 10 Aktien
```

## 7. Gruppen-Berichtswährung

Eine Depotgruppe kann eine eigene Berichtswährung besitzen. Beispiel:

- Estably-Basiswährung EUR
- Schweizer Depotbasiswährung CHF
- Gruppen-Berichtswährung EUR

Die Gruppen-Berichtswährung verändert niemals die Basiswährung eines Depots. Nur aktuelle Gruppenwerte werden für die konsolidierte Anzeige umgerechnet. Quelle, Zeitpunkt, Status und Vollständigkeit der Gruppen-FX-Kurse müssen nachvollziehbar sein.

## 8. Margin bleibt depotbezogen

Ein Marginüberschuss in Depot A schützt nicht vor einem Margin Call in Depot B. Deshalb muss eine Gruppenansicht neben Gesamtwerten mindestens später darstellen:

- Margin-Auslastung je Margin-Depot
- höchste einzelne Margin-Auslastung
- betroffenes Depot
- Cashkonten mit „Margin nicht zutreffend“

Eine konsolidierte Marginquote darf nicht als Ersatz für Einzelkontenrisiken verwendet werden. Bei unterschiedlichen Brokerregeln ist eine rein summierte Gesamtquote möglicherweise fachlich nicht aussagekräftig.

## 9. Cash, Kapitalbewegungen und NetLiq

Diese Bereiche sind auch im Mehrdepotmodell getrennt:

- **Cashbestand:** aktueller Saldo je Depot und Währung.
- **Kapitalbewegung:** Einzahlung, Auszahlung, interner Transfer oder Eröffnungs-/Ausgleichsbuchung.
- **NetLiq-Snapshot:** separates Quelldatum je Depot mit Wert, Basiswährung, Zeitpunkt und Quelle.

Eine Kapitalbewegung führt mindestens Datum, Typ, Betrag, Währung und Depot sowie optional einen Kommentar. Ein interner Transfer benötigt eine eindeutige Beziehung zwischen Quell- und Zielbewegung. Eine Einzahlung ist kein Gewinn; eine Auszahlung ist kein Verlust.

Ein interner Transfer verbindet Quell- und Zieldepot, ohne in der konsolidierten Gruppe doppelt als externe Einzahlung oder Auszahlung zu erscheinen. NetLiq wird ohne vollständige Brokerbuchhaltung nicht aus Cash und Positionen rekonstruiert.

## Muss-Anforderungen

- Vollständige Isolation über `portfolio_id`.
- Basiswährung und Kontotyp bei Anlage.
- Depotkontext für jede depotbezogene Abfrage.
- Gruppen nur als virtuelle Auswertung.
- Berichtswährung ändert keine Depotbasiswährung.
- Einzeldepot-Margin bleibt sichtbar.
- Keine offene Anzeige vollständiger Brokerkontonummern.

## Soll-Anforderungen

- Letzte Auswahl als Benutzerpräferenz.
- Maskierte Brokerkennung und Inhaber-Alias.
- Aufklappbare Instrumentaggregation in Gruppen.
- Deutliche Datenvollständigkeit bei fehlendem oder veraltetem Gruppen-FX.

## Nicht-Ziele

- keine Umsetzung von Depotwähler, Gruppen oder neuer Navigation in 2B.3
- keine automatische Brokerzuordnung
- keine kontenübergreifende Marginverrechnung
- keine automatische Basiswährungsänderung
- keine Rekonstruktion der NetLiq aus Teilkomponenten

## Abnahmekriterien

- Benutzer A sieht keine Depots oder Gruppen von Benutzer B.
- Ein Depotwechsel verändert alle depotbezogenen Datenquellen konsistent.
- Gleiche Instrumente in zwei Depots bleiben einzeln nachvollziehbar.
- Eine Gruppe kann verschiedene Basiswährungen in einer Berichtswährung darstellen, ohne Quelldepots zu verändern.
- Cashkonten werden bei Margin als nicht zutreffend gekennzeichnet.
- Interne Transfers werden in konsolidierten Kapitalflüssen nicht doppelt gezählt.

## Offene Entscheidungen

- Kardinalität zwischen Depot und Brokerkonto nach der ersten Version.
- Lebenszyklus und Löschregeln für Depotgruppen.
- Umgang mit historischen Gruppenmitgliedschaften.
- FX-Stichtag und Fallbackregeln der Gruppenansicht.
- Verhalten bei nicht gleichzeitig verfügbaren NetLiq-Snapshots.
- Verfahren für kontrollierte Basiswährungsänderungen.
