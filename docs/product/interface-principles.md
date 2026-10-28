# Darstellung des Depotalltags

Überarbeitung vom 28. Oktober 2026. Die Oberfläche ordnet die tatsächlich benötigten Daten nach Aufgabe: Überblick, offene Positionen und Stopps, Planung, abgeschlossene Trades. Rechenregeln und persönliche Risikoschwellen bleiben maßgeblich.

## Entscheidungen

- Ruhiges Anthrazit, zurückhaltendes Grün für Aktionen und positive Ergebnisse; Risikostufen behalten eigene Farben und Text. Die Oberfläche verwendet lokale Systemschriften ohne externe Font-Abfragen.
- Wenige Hauptkennzahlen mit klarer Bezugsgröße. Nicht anwendbare Kennzahlen werden weggelassen. Datenlücken werden nicht mit Null ersetzt.
- Tabellen richten Zahlen rechts aus und verwenden gleich breite Ziffern. Eine Position bündelt Unternehmen, Kategorie und Instrumentart. Der Marktwert in Handelswährung und die optionale Euro-Umrechnung stehen zusammen.
- Stoppkurs, Risikobetrag in Handelswährung und Stoppalter stehen im selben hervorgehobenen Bereich. Profilregeln bestimmen weiterhin die Risikofarbe.
- Vertiefende Erklärungen liegen hinter fokussierbaren Info-Schaltflächen. Sie öffnen per Maus, Tastatur oder Klick, schließen mit Escape und werden beim Tabellen-Scrollen nicht abgeschnitten.
- Zeilendetails öffnen gezielt; Aktionen liegen in einem kompakten Menü. Suche, Auswahlfelder, Pagination und Fokusmarkierung sind einheitlich gestaltet.
- Die Statistik bietet Such-, Status- und Sortiermöglichkeiten sowie 25 Zeilen pro Seite; das Depot begrenzt auf 50. Große Bestände erzeugen keine unübersichtliche Komplettliste mit allen Formularen gleichzeitig.

## Recherchegrundlage

Die Gestaltung folgt den Empfehlungen zu reduzierter visueller Komplexität und schrittweise abrufbaren Details von [Nielsen Norman Group: Complex Application Design](https://www.nngroup.com/articles/complex-application-design/) und [Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/).

Tabellendichte, Toolbar, Ausrichtung und Zeilenaufklappung orientieren sich an [Carbon Data Table Guidelines](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines). Finanzielle Zahlenformate und typografische Hierarchie wurden anhand von [Morningstar: Formatting](https://design.morningstar.com/foundations/formatting?tab=Basic) und [Typeface](https://design.morningstar.com/foundations/typeface?tab=Background) geprüft. Als fachlicher Vergleich diente außerdem die [TradingView Holdings-Seite](https://www.tradingview.com/support/solutions/43000756132-holdings-page/).

Diese Quellen begründen die Gestaltungsentscheidungen; es wird keine Identität, Oberfläche oder Anlageempfehlung eines anderen Anbieters übernommen.
