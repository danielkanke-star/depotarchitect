# Benutzerdefinierte CSV (Meilenstein 2A)

## Einordnung

**Optionaler manueller Dateiimport. Die spätere automatische Brokeranbindung ist hiervon getrennt.**

Die benutzerdefinierte CSV ist ein brokerneutraler Fallback und nicht die geplante primäre Datenquelle von DepotArchitect. Sie übernimmt einen vom Benutzer geprüften Snapshot als aktuellen aktiven Depotbestand. Die importierten Zeilen sind neutrale CSV-Positionen, keine bestätigten Brokerpositionen, keine aktiven Brokerorders und kein automatisch synchronisierter Brokerbestand.

Es gibt keine MDSD-Spezialisierung, kein festes Google-Sheets-Format und kein Importprofil für eine private Tabelle. Eine private Tabelle kann später höchstens als fachliche Referenz oder einmalige Migrationsquelle dienen. Die geplante Brokerpositions- und Teilpositionsarchitektur ist separat in `docs/architecture/broker-position-model.md` beschrieben und wird in diesem Meilenstein nicht implementiert.

## Datenfluss

1. Der Browser prüft Dateigröße und UTF-8-Dekodierung.
2. Der Parser erkennt Semikolon, Komma oder Tabulator und versucht die Kopfzeile zu erkennen.
3. Jede Spalte wird automatisch vorgeschlagen und kann manuell umgeordnet oder ignoriert werden.
4. Alle Datenzeilen werden normalisiert und mit konkreten Warnungen beziehungsweise Fehlern angezeigt.
5. Die zentrale Berechnungsengine berechnet verfügbare Markt-, Risiko- und Marginwerte erneut. Importierte Ergebniswerte dienen nur dem Abweichungsvergleich.
6. Die Server Action prüft Sicherheitsbestätigung, Zeilenzähler, Dateiname und Authentifizierung erneut und wiederholt die Berechnung serverseitig.
7. Die Datenbankfunktion `replace_portfolio_snapshot_v3` prüft `auth.uid()`, Portfolio-Eigentum, Zähler, Kategorien und jede normalisierte Position erneut.
8. Die Datenbankfunktion ersetzt den aktiven Bestand in einer Transaktion und schreibt ausschließlich Importmetadaten in `portfolio_imports`.
9. CSV-Rohzeilen, Depotinhalte und E-Mail-Adressen werden nicht geloggt.

Die Dateigröße ist auf 2 MB und die Anzahl gültiger Positionen auf 2.000 begrenzt. Die Vorschau zeigt höchstens 50 Zeilen, verarbeitet werden jedoch alle Zeilen innerhalb dieser Grenze.

## Herkunftskennzeichnung

Neue manuelle Dateiimporte werden intern mit `custom_csv` gekennzeichnet. Die Quellen `demo` und `manual` bleiben unverändert. Der frühere Wert `csv` bleibt aus Gründen der Rückwärtskompatibilität gültig; vorhandene Datensätze werden weder geändert noch gelöscht.

Die Herkunft beschreibt nur, wie der aktuelle DepotArchitect-Datensatz angelegt wurde. `custom_csv` bedeutet ausdrücklich nicht, dass eine echte Brokerposition, Brokerorder, Brokertranche oder automatische Synchronisierung vorliegt.

## Transaktion und Rollback

`replace_portfolio_snapshot_v3` führt unter einer portfolio-spezifischen Transaktionssperre aus. Die älteren Funktionen bleiben ausschließlich für Rückwärtskompatibilität erhalten:

1. `auth.uid()` und Eigentum des Zielportfolios prüfen
2. vollständige JSON-Nutzlast prüfen
3. Importhistorie im Status `processing` anlegen
4. bestätigte neue Kategorien anlegen
5. bisherigen Bestand mit Status ungleich `closed` entfernen
6. normalisierte Positionen mit Quelle `custom_csv` einfügen
7. von der TypeScript-Engine berechnete Kompatibilitäts-Caches speichern; NetLiq und andere Depotquellen nicht überschreiben
8. Importhistorie auf `completed` setzen

Jede Exception rollt die gesamte Transaktion zurück. Dadurch bleiben der vorherige Bestand und die vorherige Importhistorie unverändert. Ein fehlgeschlagener Status kann nicht innerhalb derselben zurückgerollten Transaktion dauerhaft gespeichert werden; die Oberfläche zeigt deshalb eine neutrale Rollback-Meldung, ohne Nutzlastdaten zu loggen.

## Margin- und FX-Normalisierung

- `margin_rate` ist eine ausdrücklich als Dezimalquote definierte Spalte: `0,25` und `0.25` bedeuten 25 %.
- Werte mit Prozentzeichen wie `25%`, `25,00%` und `25.00%` werden zu `0.25`.
- Die explizite Legacy-Spalte „Margin-Prozent“ interpretiert einen nackten Wert `25` als 25 %. Ein nacktes `25` in `margin_rate` wird abgelehnt statt geraten.
- Die Vorschau zeigt Originalwert, normalisierte Quote und berechnetes Margin Requirement.
- Nur eindeutige FX-Überschriften werden automatisch zugeordnet: `fx_to_base`, „FX zur Basiswährung“ beziehungsweise „Instrumentwährung in Basiswährung“. Mehrdeutige Überschriften wie „Wechselkurs“ und „exchange rate“ bleiben unzugeordnet.
- `entry_fx_to_base` und `current_fx_to_base` bleiben getrennt. Aktueller Marktwert, aktuelles Stopprisiko und Margin verwenden ausschließlich den aktuellen FX.

## RLS und RPC-Schutz

- `portfolio_imports` hat RLS; Benutzer können nur eigene Historieneinträge lesen.
- Direkte Inserts, Updates und Deletes auf `portfolio_imports` sind für `authenticated` entzogen.
- `replace_portfolio_snapshot_v3` ist die aktuelle Schreiboberfläche für einen Snapshot.
- Die `SECURITY DEFINER`-Funktion verwendet einen leeren `search_path`, vollständig qualifizierte Relationen, `auth.uid()` und eine explizite Eigentumsprüfung.
- `anon` besitzt kein Ausführungsrecht.
- Ein normaler Benutzer kann weder in ein fremdes Portfolio importieren noch fremde Importhistorie lesen.
- Der Adminbereich erhält nur den aggregierten Zeitpunkt des letzten erfolgreichen Imports, keine CSV-Zeile und keine Depotposition.

## Preview-Abnahme mit synthetischen Dateien

Keine echte Depot-, Broker- oder private Tabellendatei für die technische Abnahme verwenden.

1. Im Preview mit einem Testkonto anmelden und **Benutzerdefinierte CSV** öffnen.
2. Synthetische Dateien mit Semikolon, Komma und Tabulator sowie deutschen und englischen Zahlenformaten prüfen.
3. Dateiname, UTF-8, Trennzeichen, Kopfzeile und Zeilenzähler kontrollieren.
4. Jede automatische Spaltenzuordnung kontrollieren. Depotweite Felder wie `NetLiq` auf **Nicht importieren** belassen.
5. Unbekannte Kategorien ausdrücklich einer bestehenden Kategorie zuordnen, neu anlegen oder als **Nicht zugeordnet** importieren.
6. Warnungen und Fehler lesen. Mehrere importierte Positionen desselben Tickers sind zulässig; fehlerhafte Zeilen werden abgelehnt.
7. Checkbox aktivieren, exakt `DEPOT ERSETZEN` eingeben und den Import ausführen.
8. Cockpit, Depot und Importhistorie prüfen. Fehlende Nettoliquiditäts-, Risiko- oder Marginwerte müssen als nicht berechenbar erscheinen.
9. Einen zweiten synthetischen Import durchführen und prüfen, dass nur der aktive Bestand ersetzt wird.
10. Einen absichtlich ungültigen Datenbankimport ausführen und bestätigen, dass Bestand und Historie vollständig zurückgerollt werden.
11. Sämtliche synthetischen Testdaten anschließend innerhalb einer sicheren Transaktion zurückrollen beziehungsweise auf den Ausgangszustand zurücksetzen.

Eine aus Google Sheets exportierte Datei ist keine Abschlussvoraussetzung für diesen PR und wird nicht als dauerhafte Hauptdatenquelle behandelt.

## Nicht gespeichert

- ursprünglicher Dateiinhalt
- CSV-Rohzeilen
- vollständige Mapping-Vorschau
- E-Mail-Adresse im Importdatensatz
- Authentifizierungstoken
- Supabase Secret- oder Service-Role-Schlüssel
