# Produkt- und Architekturroadmap

## Abgeschlossene beziehungsweise laufende Grundlagen

- **Meilenstein 2A – Brokerneutraler benutzerdefinierter CSV-Import:** abgeschlossen und gemergt.
- **Meilenstein 2B – Zentrale Berechnungsmaschine und funktionales Cockpit:** Draft-PR; 2B.3 legt ausschließlich die verbindliche Produktspezifikation für 2C fest.
- **Meilenstein 2D – Risikodarstellung, Farblogik, Warnungen und Risikobudget:** nach fachlicher Definition.
- **Meilenstein 2E – Historische Performance und PDF-Historienimport:** geplant. Jahresberichte können später Transaktionen, Stichtagspositionen, Gebühren, Dividenden, Zinsen, Kapitalmaßnahmen und Ergebnisse liefern. PDF-Upload, Parser, OCR und Historienrekonstruktion sind nicht Teil von 2C.
- **Meilenstein 2F – Automatische Broker- und Marktdatenquellen:** geplant für aktuelle Positionen, Kontowerte, Trades, Orders, Kurse und FX.

## Meilenstein 2C

Meilenstein 2C wird bewusst in sechs abnehmbare Schritte aufgeteilt. Die verbindlichen Anforderungen stehen in [milestone-2c-requirements.md](milestone-2c-requirements.md).

### 2C.1 – Mehrdepot-Grundlage

- mehrere vollständig getrennte Depots je Benutzer
- Depoterstellung mit Name, Broker/Anbieter, Kontotyp und fester Basiswährung
- unveränderliche interne `portfolio_id`
- gut sichtbarer Depotwähler
- konsistente serverseitige und RLS-basierte Abfragebegrenzung auf das ausgewählte Depot
- sichere Migration des bisherigen einen Standarddepots

Abnahme: Zwei Depots desselben Benutzers können unterschiedliche Basiswährungen besitzen und bleiben in Anzeige, CRUD und Berechnung vollständig getrennt.

### 2C.2 – Depotgruppen

- virtuelle Gruppen ohne Kopie oder Verschiebung von Ursprungsdaten
- eigene Gruppen-Berichtswährung
- konsolidierte NetLiq-, Marktwert-, Hebel-, Cash-, Instrument-, Kategorie- sowie Long-/Short-Kennzahlen
- gleiche Instrumente aggregiert und nach Depot aufklappbar
- getrennte Margin-Auslastung je Konto; höchste Auslastung und betroffenes Depot
- Cashkonten mit „Margin nicht zutreffend“

Abnahme: Konsolidierung verändert keine Quelldepots und verdeckt kein einzelnes Marginrisiko.

### 2C.3 – Instrumente und Teilpositionen

- Instrumentstammdaten und produktspezifische Identität
- Gesamtbestand je Instrument
- DepotArchitect-Teilpositionen mit Kategorie, Strategie, Stopp und Notizen
- Käufe, Teilverkäufe und Schlussverkäufe
- abgeleitete offene Menge und Positionsstatus
- geschlossene Positionen und Instrumentbaum
- Schutz vor Überverkauf und unbeabsichtigter Überschreibung historischer Teilpositionen

Abnahme: Kauf 10, Teilverkauf 4 und Schlussverkauf 6 ergeben nachvollziehbar offen, teilweise geschlossen und geschlossen.

### 2C.4 – Bedienung

- Kompakt-/Erweitert-/Analyseansicht
- offene, alle und geschlossene Positionen innerhalb Depot
- aufklappbare offene und geschlossene Teilpositionen je Instrument
- neue Depot-Untermenüs
- Import unter Depot statt als eigenständiger Hauptproduktbereich
- manuelle Pflege bleibt auf notwendige Quelldaten begrenzt

Abnahme: Die Ansichten zeigen unterschiedliche Informationsdichte, aber identische Berechnungen und Daten.

### 2C.5 – Cash und Kapitalbewegungen

- Cashsaldo je Währung
- Einzahlungen und Auszahlungen
- interne Transfers zwischen eigenen Depots
- NetLiq-Snapshots als getrennte Quelle
- Eröffnungs- und Ausgleichsbuchungen
- keine Doppelzählung interner Transfers in Gruppen

Abnahme: Einzahlung, Auszahlung, Transfer, Cash und NetLiq bleiben fachlich und rechnerisch getrennt.

### 2C.6 – Positionsnotizen

- dauerhafter Textkommentar
- Screenshot nach vollständiger Sicherheitsfreigabe
- dauerhafte Archivierung nach Verkauf
- mehrere chronologische Journal-Einträge
- private Storage-Struktur mit Autorisierung, Löschung und Aufbewahrung

Abnahme: Notizen geschlossener Teilpositionen bleiben erhalten und ein späterer Neukauf erhält eine neue, getrennte Notiz-Historie.

Vor Beginn von 2C.6 muss die Sharp-/libvips-Sicherheitsfrage vollständig behoben sein. Nicht vertrauenswürdige Bilder dürfen nicht über eine verwundbare serverseitige Bildverarbeitung laufen.

## Zielnavigation

- Cockpit
- Depot
- Risiko
- Einstellungen

Unter **Depot**:

- Depotübersicht
- Positionen
- Cash
- Kapitalbewegungen
- Datenquellen und Import
- Brokerkonten

Geschlossene Positionen und Historie bleiben im Depotkontext. Sie erhalten in 2C keinen eigenen Hauptmenüpunkt. Der Import ist eine untergeordnete Datenzufuhr. Die heutige Route `/import` darf bis zum Bedienungsmeilenstein bestehen bleiben.

## Reihenfolge und Abhängigkeiten

1. Mehrdepot-Isolation vor Depotgruppen.
2. Depotgruppen vor konsolidierter Margindarstellung.
3. Instrument- und Transaktionsmodell vor vollständiger Historie oder Performance.
4. Cash-/Kapitalbewegungsmodell vor kapitalflussbereinigter Performance.
5. Private Storage- und Bildsicherheit vor Screenshots.
6. Broker- und Marktdatenanbindung erst nach stabilen Identitäten, Reconciliation und RLS.

## Nicht-Ziele von Meilenstein 2C

- keine automatische Broker-, Kurs- oder FX-Anbindung
- keine Orderausführung oder Anlageempfehlung
- keine vollständige Steuer-, Gebühren- oder Kontenbuchhaltung
- keine endgültige Performanceberechnung vor vollständigem Transaktionsmodell
- keine ungesicherte Bildverarbeitung
- keine automatische kontenübergreifende Marginverrechnung

## Offene Roadmap-Entscheidungen

- Ob Brokerorders und Stopzuordnungen als eigener Schritt zwischen 2C und 2F oder innerhalb der Brokerintegration umgesetzt werden.
- Ob eine eigenständige Historie-Navigation nach 2C fachlich noch erforderlich ist.
- Welche Teile der Performance nach Transaktionen, Kapitalbewegungen und Snapshots zuerst belastbar berechnet werden können.
- Welche Brokerquelle aktuelle Orders und welche historische Berichte liefert.
