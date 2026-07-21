# CSV-Snapshot-Import (Meilenstein 2A)

Stand: 21. Juli 2026

## Zweck und Grenzen

Der Import übernimmt einen vom Benutzer geprüften CSV-Snapshot als aktuellen aktiven Depotbestand. Er stellt keine Google-Sheets- oder Broker-Verbindung her und berechnet noch keine endgültigen Risiko- oder Margin-Kennzahlen. Diese fachlichen Berechnungen folgen in Meilenstein 2B.

## Datenschutzfreundlicher Datenfluss

1. Der Browser liest die ausgewählte UTF-8-Datei mit `File.arrayBuffer()` und `TextDecoder`.
2. Der Browser erkennt Trennzeichen und Kopfzeile, zeigt die Spaltenzuordnung und normalisiert die Zeilen.
3. Die Rohdatei wird nicht an Vercel, Supabase Storage oder eine sonstige Ablage übertragen.
4. Erst nach Checkbox und exakter Eingabe `DEPOT ERSETZEN` sendet die Oberfläche die normalisierten, gültigen Positionen an eine authentifizierte Server Action.
5. Server Action und Datenbankfunktion prüfen Identität, Portfolio-Eigentum, Zähler und jede normalisierte Position erneut.
6. Die Datenbankfunktion ersetzt den aktiven Bestand in einer Transaktion und schreibt ausschließlich Importmetadaten in `portfolio_imports`.
7. CSV-Rohzeilen, Depotinhalte und E-Mail-Adressen werden nicht geloggt.

Die Dateigröße ist auf 2 MB und die Anzahl gültiger Positionen auf 2.000 begrenzt. Die Vorschau zeigt höchstens 50 Zeilen, verarbeitet werden jedoch alle Zeilen innerhalb dieser Grenze.

## Transaktion und Rollback

`replace_portfolio_snapshot` führt unter einer portfolio-spezifischen Transaktionssperre aus:

1. `auth.uid()` und Eigentum des Zielportfolios prüfen
2. vollständige JSON-Nutzlast prüfen
3. Importhistorie im Status `processing` anlegen
4. bestätigte neue Kategorien anlegen
5. bisherigen Bestand mit Status ungleich `closed` entfernen
6. normalisierte Positionen mit Quelle `csv` einfügen
7. nicht aus der CSV ableitbare Portfolio-Kennzahlen auf `NULL` setzen
8. Importhistorie auf `completed` setzen

Jede Exception rollt die gesamte Transaktion zurück. Dadurch bleiben der vorherige Bestand und die vorherige Importhistorie unverändert. Ein fehlgeschlagener Status kann nicht innerhalb derselben zurückgerollten Transaktion dauerhaft gespeichert werden; die Oberfläche zeigt deshalb eine neutrale Rollback-Meldung, ohne Nutzlastdaten zu loggen.

## RLS und RPC-Schutz

- `portfolio_imports` hat RLS; Benutzer können nur eigene Historieneinträge lesen.
- Direkte Inserts, Updates und Deletes auf `portfolio_imports` sind für `authenticated` entzogen.
- `replace_portfolio_snapshot` ist die einzige Schreiboberfläche für einen Snapshot.
- Die `SECURITY DEFINER`-Funktion verwendet einen leeren `search_path`, vollständig qualifizierte Relationen, `auth.uid()` und eine explizite Eigentumsprüfung.
- `anon` besitzt kein Ausführungsrecht.
- Ein normaler Benutzer kann weder in ein fremdes Portfolio importieren noch fremde Importhistorie lesen.
- Der Adminbereich erhält nur den aggregierten Zeitpunkt des letzten erfolgreichen Imports, keine CSV-Zeile und keine Depotposition.

## Echte Google-Sheets-CSV im Preview prüfen

1. In Google Sheets eine Kopie des gewünschten Tabellenblatts verwenden und **Datei → Herunterladen → Kommagetrennte Werte (.csv)** wählen. Keine Datei ins Repository kopieren.
2. Im Preview mit dem eigenen Testkonto anmelden und **Datenimport** öffnen.
3. CSV auswählen. Dateiname, UTF-8, Trennzeichen, Kopfzeile und Zeilenzähler prüfen.
4. Jede automatische Spaltenzuordnung kontrollieren. `NetLiq` oder `Netto Liquidität` auf **Nicht importieren** belassen.
5. Unbekannte Kategorien ausdrücklich einer bestehenden Kategorie zuordnen, neu anlegen oder als **Nicht zugeordnet** importieren.
6. Warnungen und Fehler lesen. Mehrere Tranchen desselben Tickers sind zulässig; fehlerhafte Zeilen werden abgelehnt.
7. Prüfen, ob die angezeigte Zahl gültiger Positionen dem erwarteten aktiven Snapshot entspricht.
8. Checkbox aktivieren, exakt `DEPOT ERSETZEN` eingeben und den Import ausführen.
9. Cockpit, Depot und Importhistorie prüfen. Fehlende Nettoliquiditäts-, Risiko- oder Marginwerte müssen als nicht berechenbar erscheinen.
10. Für einen zweiten Test erneut eine synthetische oder bereinigte CSV importieren und prüfen, dass nur der aktive Bestand ersetzt wird.
11. Einen absichtlich ungültigen Test über eine synthetische CSV durchführen; ohne gültige Positionen oder Sicherheitsbestätigung darf kein Import starten. Der Datenbank-Rollback wird zusätzlich automatisiert getestet.

## Nicht gespeichert

- ursprünglicher Dateiinhalt
- CSV-Rohzeilen
- vollständige Mapping-Vorschau
- E-Mail-Adresse im Importdatensatz
- Authentifizierungstoken
- Supabase Secret- oder Service-Role-Schlüssel
