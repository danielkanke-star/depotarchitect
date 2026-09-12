# Positions- und Transaktionsmodell

Status: verbindliches fachliches Zielbild für Meilenstein 2C.3 und 2C.5. Keine technische Implementierung.

## 1. Ebenen

```text
Depot
└── Instrument
    └── DepotArchitect-Teilposition
        ├── Einstieg beziehungsweise Kauf
        ├── Teilverkauf 1
        ├── Teilverkauf 2
        └── Schlussverkauf
```

Das **Instrument** beschreibt das handelbare Wertpapier oder den Vertrag. Die **Teilposition** beschreibt die fachliche Absicht des Benutzers innerhalb eines konkreten Depots. Käufe und Verkäufe beschreiben Mengenänderungen dieser Teilposition.

Kategorie, Strategie, Trading-Stopp, Kommentar und Journal gehören an die Teilposition. Sie gehören nicht dauerhaft an den Ticker oder einen brokerseitigen Gesamtbestand.

## 2. Instrumentbaum

Zielstruktur eines Depots:

```text
Depot
├── Cash
│   ├── EUR
│   ├── USD
│   └── CHF
├── Aktien
├── ETFs
├── Optionen
├── Optionsscheine
└── Knock-out-Produkte
```

Innerhalb eines Instruments:

```text
GOOG – Gesamtbestand
├── Kerninvestment
└── Momentumtrade
```

Bei Derivaten:

```text
Basiswert
└── konkretes Produkt beziehungsweise konkreter Vertrag
    └── Teilpositionen
```

Die fachliche Instrumentidentität darf nicht ausschließlich aus dem Ticker bestehen. Der spätere technische Schlüssel muss produktspezifische Identifikatoren und Vertragsmerkmale berücksichtigen.

## 3. Einstieg und Käufe

Eine Teilposition beginnt mit mindestens einem Einstieg beziehungsweise Kauf. Ausgangsdaten sind insbesondere Instrument, Richtung, Menge, Einstandskurs, Einstiegsdatum, Instrumentwährung und optional Kategorie, Strategie, Stopp, Marginquelle und Kommentar.

Ob mehrere Käufe dieselbe Teilposition erweitern oder als neue Teilposition erfasst werden, ist eine bewusste Benutzerentscheidung. Eine Broker-Synchronisation darf eine Erhöhung nicht automatisch einer beliebigen Kategorie oder Strategie zuordnen.

## 4. Verkäufe und offene Menge

Ein Verkauf enthält mindestens:

- Verkaufsdatum
- Verkaufskurs in Instrumentwährung
- verkaufte Menge

Die offene Menge ist immer abgeleitet:

```text
offene Menge = Summe Kaufmengen − Summe Verkaufsmengen
```

Regeln:

- Verkaufsmengen müssen positiv sein.
- Ein Verkauf darf die zum Buchungszeitpunkt offene Menge nicht überschreiten.
- Teilverkäufe verändern weder Instrumentidentität noch historische Einstiegstransaktionen.
- Verkaufspreis und Kaufpreis bleiben in Instrumentwährung.
- Korrekturen müssen nachvollziehbar sein; historisch relevante Transaktionen werden nicht still überschrieben.

## 5. Abgeleiteter Positionsstatus

Der Status wird möglichst aus den Transaktionen abgeleitet:

| Bedingung | Fachlicher Status | UI-Begriff |
|---|---|---|
| keine verkaufte Menge, offene Menge > 0 | `open` | offen |
| verkaufte Menge > 0, offene Menge > 0 | `partially_closed` | teilweise geschlossen |
| offene Menge = 0 | `closed` | geschlossen |
| verkaufte Menge > verfügbare offene Menge | ungültig | Speichern abweisen |

Ein manueller Status darf diese Mengenlogik nicht widersprechen. Zusätzliche Arbeitszustände wie Beobachtung, Abstimmung oder Datenproblem sind von der mengenbasierten Offen-/Geschlossen-Logik getrennt zu modellieren.

## 6. Offene und historische Positionen

Geschlossene Positionen erhalten keinen eigenen Hauptmenüpunkt. Innerhalb von Depot sind beispielsweise folgende Filter zulässig:

- Offen
- Alle
- Geschlossen

oder „Geschlossene Positionen einblenden“.

Offene und geschlossene Teilpositionen bleiben unter demselben Instrument aufklappbar:

```text
GOOG
├── Offen
└── Geschlossen
```

Eine geschlossene Teilposition wird archiviert und nicht automatisch gelöscht. Ein späterer erneuter Kauf desselben Instruments erzeugt eine neue Teilposition mit eigenen Notizen.

## 7. Berechnete Werte

Nicht manuell pflegen:

- Marktwert
- offene Restmenge
- Kurs-G&V
- realisierter G&V
- Risiko bis Stopp
- NetLiq-Anteil
- Kategoriengewicht
- NetLiq-Hebel

Die bestehende Kennzahl „Kurs-G&V zum aktuellen FX“ ist nicht automatisch der vollständige Gesamtgewinn. Realisierter G&V, Gebühren, Steuern, Finanzierung und FX-Effekt benötigen die später festzulegende Transaktions- und Bewertungslogik.

## 8. Cash und Kapitalbewegungen

Wertpapiertransaktionen, Cashsalden und Kapitalbewegungen sind getrennte Ebenen. Ein Kauf in USD beweist weder einen USD-Cashsaldo noch einen tatsächlich ausgeführten Währungstausch. Einzahlungen und Auszahlungen gehören nicht in den Wertpapiergewinn.

Interne Transfers zwischen eigenen Depots müssen als zusammengehörige Quell- und Zielbewegung erkennbar sein. Der bisherige Tabellen-Ausgleichswert kann bei einer Migration nur als ausdrücklich markierte Eröffnungs- oder Ausgleichsbuchung übernommen werden.

## 9. Kommentare, Screenshots und Journal

Jede Teilposition kann dauerhaft enthalten:

- Textkommentar
- später Screenshot
- später mehrere Journal-Einträge

Kommentar und Screenshot bleiben nach dem Verkauf erhalten. Die alte geschlossene Position darf durch einen späteren Neukauf desselben Tickers nicht überschrieben werden.

Vor jeder Bildfunktion sind Sharp-/libvips-Risiken, Dateitypen, Größenlimits, Metadatenbereinigung, Malwareprüfung, private Storage-Autorisierung, Aufbewahrung und Löschung verbindlich zu lösen.

## Muss-Anforderungen

- Offene Menge und Status aus Transaktionen ableiten.
- Überverkauf serverseitig und datenbankseitig verhindern.
- Transaktionen eindeutig Depot, Instrument und Teilposition zuordnen.
- Historische Verkäufe und geschlossene Teilpositionen erhalten.
- Kategorie und Strategie an Teilposition führen.
- Preise in Instrumentwährung speichern und Bewertung davon trennen.
- Manuelle Quelldaten von berechneten Kennzahlen trennen.

## Soll-Anforderungen

- Chronologisches Positionsjournal.
- Nachvollziehbare Korrektur- oder Stornologik statt stiller Überschreibung.
- Aufklappbarer Instrumentbaum mit offenen und geschlossenen Teilpositionen.
- Eindeutige Abstimmungszustände bei Brokerabweichungen.

## Nicht-Ziele

- keine Transaktionstabellen oder Formulare in 2B.3
- keine FIFO-/LIFO-/Steuerlogik
- keine automatische Orderausführung
- keine automatische Zuordnung unbekannter Brokerreduktionen
- keine vollständige Kontenbuchhaltung oder Performanceberechnung
- keine Screenshotverarbeitung

## Abnahmekriterien

- Kauf 10, Verkauf 4 ergibt offene Menge 6 und „teilweise geschlossen“.
- Ein weiterer Verkauf 6 ergibt offene Menge 0 und „geschlossen“.
- Ein Verkauf 7 bei offener Menge 6 wird abgewiesen.
- Zwei Teilpositionen desselben Instruments behalten getrennte Kategorien, Transaktionen und Notizen.
- Geschlossene Teilpositionen bleiben unter dem Instrument sichtbar.
- Ein Neukauf nach vollständigem Verkauf erzeugt keine Überschreibung der alten Historie.

## Offene Entscheidungen

- Loszuordnung bei mehreren Käufen und Verkäufen.
- Behandlung von Gebühren, Steuern und Währungsabrechnung.
- Korrektur, Storno und Valutadatum von Transaktionen.
- Corporate Actions, Splits, Optionen-Ausübung und Zuteilungen.
- Definition des realisierten G&V in Instrument- und Basiswährung.
- Zuordnung brokerseitiger Sammeltransaktionen zu Teilpositionen.
