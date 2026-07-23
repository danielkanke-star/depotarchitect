# Manuelle Datenerfassung

Status: verbindliche Produktvorgabe für Meilenstein 2C. DepotArchitect darf bei der manuellen Pflege nicht aufwendiger werden als die bisherige Tabellenpflege. Die Anwendung fragt nur notwendige Quelldaten ab und berechnet ableitbare Werte selbst.

## 1. Grundsatz

Die Eingabe folgt dem Arbeitsvorgang des Benutzers:

1. Depot auswählen.
2. Instrument beziehungsweise vorhandenen Instrumentstamm wählen.
3. Teilposition und ihre fachlichen Quelldaten erfassen.
4. Berechnete Vorschau prüfen.
5. Spätere Verkäufe als eigene Transaktionen hinzufügen.

Das Formular darf keine Felder verlangen, die zuverlässig aus vorhandenen Quelldaten ableitbar sind.

## 2. Pflicht- beziehungsweise Ausgangsdaten einer Teilposition

- Ticker beziehungsweise Instrument
- Kategorie
- Positionstyp
- Richtung
- Menge
- Einstandskurs
- Einstiegsdatum
- Trading-Stopp
- Marginquote oder direkter Marginwert, sofern für das Konto beziehungsweise Instrument fachlich anwendbar
- Instrumentwährung
- Status beziehungsweise Verkaufsdaten

Der konkrete Pflichtgrad darf kontextbezogen sein: Ein Cashkonto benötigt keine Marginangabe; ein fehlender Stopp macht das Risiko sichtbar unvollständig, darf aber nicht durch einen erfundenen Wert ersetzt werden.

## 3. Verkaufsdaten

Beim Verkauf:

- Verkaufsdatum
- Verkaufskurs
- verkaufte Menge

Die Anwendung zeigt vor dem Speichern die resultierende offene Menge und den abgeleiteten Status. Ein Verkauf über die offene Menge wird abgewiesen.

## 4. Optionale Angaben

- Strategie
- Kommentar
- später Screenshot
- später mehrere Journal-Einträge
- produktspezifische Referenzen, soweit für eindeutige Instrumentidentität erforderlich

Screenshots sind erst nach Behebung und erneuter Prüfung der Sharp-/libvips-Sicherheitslage zulässig.

## 5. Automatisch berechnete Angaben

Nicht manuell pflegen:

- Marktwert
- offene Restmenge
- Kurs-G&V
- realisierter G&V
- Risiko bis Stopp
- NetLiq-Anteil
- Kategoriengewicht
- NetLiq-Hebel

Berechnete Werte sind als solche zu kennzeichnen. Fehlende Quellen führen zu „unvollständig“, nicht zu stillen Null- oder Schätzwerten. Direkte Broker- oder Importwerte müssen ihre Herkunft behalten.

## 6. Währungen

- Einstandskurs, aktueller Kurs, Verkaufskurs und Stoppkurs werden in Instrumentwährung eingegeben.
- Die Depotbasiswährung wird bei Depoterstellung festgelegt und im Positionsformular nicht erneut gewählt.
- Cashwährungen werden im Cashbereich gepflegt, nicht als normale Position.
- FX wird nur dann manuell eingegeben, wenn keine automatische oder importierte Quelle vorhanden ist; Definition und Richtung müssen eindeutig sein.

## 7. Produktspezifische Progressive Disclosure

Allgemeine Felder werden zuerst gezeigt. Produktspezifische Felder erscheinen nur, wenn sie benötigt werden.

- Aktie/ETF: Instrument, Richtung, Menge, Preise, Stopp, Währung.
- Option: zusätzlich Basiswert, Call/Put, Strike, Verfall und Multiplikator.
- Optionsschein: später ISIN, Emittent, Basiswert, Bezugsverhältnis, Strike und Verfall.
- Knock-out: später ISIN, Emittent, Basiswert, Richtung, Knock-out-Schwelle und Bezugsverhältnis.

Nicht relevante Felder dürfen die einfache Standarderfassung nicht überladen.

## 8. Informationsstufen

Der globale Ansichtsumschalter Kompakt, Erweitert und Analyse beeinflusst nur die Darstellung. Das Eingabeformular bleibt auf Quelldaten fokussiert; Analysemetadaten wie Herkunft, FX-Status und Zeitstempel können in einer erweiterten Sektion erscheinen.

## Muss-Anforderungen

- Depotkontext vor Positionserfassung eindeutig.
- Nur notwendige Quelldaten editierbar.
- Cash nicht als normale Position anlegbar.
- Basiswährung im Positionsworkflow nicht veränderbar.
- Überverkauf verhindern.
- Berechnete Vorschau vor beziehungsweise nach Speichern verständlich anzeigen.
- Fehlende Quellen nicht als Null tarnen.
- Kategorie und Strategie an Teilposition statt Ticker binden.

## Soll-Anforderungen

- Wiederverwendung vorhandener Instrumentstammdaten ohne Überschreiben alter Teilpositionen.
- Gute Tastaturbedienung und sinnvolle Standardwerte.
- Produktspezifische Felder nur bei Bedarf.
- Eindeutige Herkunftsanzeige für manuelle, importierte und spätere Brokerdaten.
- Schnelles Erfassen eines Teilverkaufs aus der bestehenden Position.

## Nicht-Ziele

- keine manuelle Pflege berechneter Aggregate
- keine automatische Broker-, Kurs- oder FX-Abfrage in 2C
- keine automatische Anlageempfehlung oder Orderentscheidung
- keine vollständige Optionsschein-/Knock-out-Berechnung in der ersten 2C-Stufe
- keine Bildfunktion vor Sicherheitsfreigabe

## Abnahmekriterien

- Eine Standardaktie kann ohne Eingabe eines Marktwerts oder G&V angelegt werden.
- Das Formular unterscheidet Basis-, Instrument- und Cashwährung eindeutig.
- Ein Teilverkauf benötigt nur Datum, Kurs und Menge und zeigt die neue Restmenge.
- Nicht anwendbare Marginfelder werden nicht erzwungen.
- Fehlender aktueller Kurs, FX oder Stopp erzeugt einen verständlichen unvollständigen Zustand.
- Ein erneuter Kauf desselben Tickers kann bewusst als neue Teilposition mit eigener Kategorie angelegt werden.

## Offene Entscheidungen

- Welche Felder sind je Produkttyp harte Pflicht und welche erlauben einen unvollständigen Entwurf?
- Wann wird ein weiterer Kauf derselben Teilposition zugeordnet?
- Wie werden Gebühren und Handelswährung beim Verkauf erfasst?
- Welche Standardkategorie und welche Schnellwahlmechanismen sind zulässig?
- Wie werden Entwürfe, Validierungsfehler und Abbruch behandelt?
