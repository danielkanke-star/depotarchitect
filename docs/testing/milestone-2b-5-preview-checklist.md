# Meilenstein 2B.5 – Preview-Prüfliste

Preview und Production verwenden derzeit dasselbe Supabase-Projekt. Deshalb ausschließlich eindeutig synthetische, anschließend gezielt löschbare Einzelzeilen verwenden. Vor Beginn Anzahl und Inhalt vorhandener Positionen dokumentieren; nach Abschluss unveränderten Bestand bestätigen.

## Ohne Datenmutation

1. `/cockpit`: sechs Kernkennzahlen sichtbar; keine technische Kurs-/FX-Qualitätsmatrix und keine Demo-Kennzahlen.
2. `/depot?add=position`: nur die vereinfachten Fachfelder einschließlich Pflichtfeld „Aktueller Kurs“ sichtbar; keine FX-, Provider-, Quellen-, Status-, ID- oder technischen Zeitfelder.
3. Cash-Konto: Margin als nicht zutreffend; manipulierte Marginfelder werden serverseitig ignoriert.
4. Margin-Konto: Quote oder Betrag auswählbar.
5. Vorhandene Legacy-Positionen ohne Kurs und Positionen ohne Trading-Stopp werden als fehlend beziehungsweise nicht berechenbar gezeigt.
6. Bei einer bearbeiteten Position werden aktiver Kurs, verständliche Quellenbezeichnung und Zeitpunkt gemeinsam angezeigt.
7. Falls synthetische Beobachtungen mehrerer Quellen geprüft werden: gültiges IBKR schlägt Import/Provider/manuell; veraltetes IBKR schlägt keinen aktuellen Import.
8. `/einstellungen`: Kontomodell ist auswählbar; technische Cash- und FX-Pflege ist nicht Teil des normalen Wegs.
9. Der CSV-Import bleibt über das Depot optional erreichbar, ist aber kein Hauptnavigationspunkt.

## Gezielte synthetische Einzelzeilen

1. Eine offene synthetische Position anlegen und anschließend gezielt löschen.
2. Eine synthetische Position mit Teilverkauf anlegen; offene Restmenge und Berechnung prüfen; anschließend löschen.
3. Eine synthetische vollständig verkaufte Position als geschlossen speichern; Ansicht „Geschlossen“ prüfen; anschließend löschen.
4. Je eine synthetische Ein- und Auszahlung erfassen. Prüfen, dass sie in der Liste erscheinen und NetLiq, Cash und Performance nicht automatisch verändern.
5. Da Kapitalbewegungen in 2B.5 absichtlich unveränderlich sind, diese nur mit einem getrennten Testportfolio/Testbenutzer anlegen oder nach der Abnahme kontrolliert per Datenbankadministration entfernen.

Keine vollständigen CSV-Snapshot-Imports mit dem normalen Benutzerkonto durchführen. Keine aktiven Depotdaten für UI-Tests ersetzen.

## Abschluss

- Positionenzahl und Inhalte des vorher vorhandenen Bestands sind unverändert.
- Keine echten Depot-, Broker-, Kontonummern- oder privaten Dateidaten wurden verwendet.
- Authentifizierte Seiten `/cockpit`, `/depot`, `/risiko`, `/einstellungen` und `/import` laden ohne Laufzeitfehler.
