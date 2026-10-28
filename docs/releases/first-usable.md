# Erster brauchbarer Stand – Abnahme und Betrieb

Stand: 28. Oktober 2026. Ausgangscode: `main` / `dc304973286ba663a9e15c65b53b3c80e65472ae`. Arbeitsbranch: `codex/first-usable`. Produktumfang: [first-usable.md](../product/first-usable.md).

## Vorbereitet

Der Stand ergänzt das vorhandene Next.js-/Supabase-Projekt um Verkaufsjournal, Trade-Statistik, eingefrorene Einstiegsmargin, Profilbudget, Warnfarben, Positionsgrößenrechnung und Erstübernahme der bisherigen Tabelle. Die Migration ist additiv; bereits angewendete Migrationen werden nicht geändert. Bestehende Verkaufs-Sammelreferenzen werden als `legacy_aggregate` erhalten, Fremdwährungs-FX dabei nicht erfunden. Neue Konten starten leer. Der Eigendatenexport enthält Journal und Korrekturhistorie und lädt längere Historien seitenweise.

Die echte Datenbank und Production wurden für diese Umsetzung nicht reaktiviert, migriert oder neu bereitgestellt. Die zuletzt lesend festgestellte Supabase-Situation war `INACTIVE`. Vor dem Livebetrieb ist deshalb ein gesonderter Freigabeschritt nötig. Die lokale Vorschau ist keine behauptete Live-Abnahme.

## Lokale Prüfung

```bash
npm ci
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Für die echte Anmeldung müssen die öffentlichen Supabase-Konfigurationsvariablen gesetzt sein. Ein früher Build verwendete synthetische öffentliche Testwerte; auch der endgültige Build ohne Zugangsdaten war erfolgreich. Es wurden keine Produktionsgeheimnisse heruntergeladen. Die npm-Lockdatei wurde mit `npm ci --ignore-scripts` auf Reproduzierbarkeit geprüft. Next.js, TypeScript und Vitest werden aus dem Projekt aufgerufen.

Abschließend bestanden: 149 Tests in 20 Testdateien, ESLint ohne Warnungen, TypeScript und Next.js-Production-Build. Die responsive Vorschau wurde bei 390 und 1280 Pixeln ohne horizontalen Seitenüberlauf geprüft.

Die SQL-Tests führen **alle 20 Migrationen** in einer isolierten PGlite-PostgreSQL-Laufzeit aus. Die Supabase-Rollen und Auth-Hilfsfunktionen sind dort synthetische Fixtures. Geprüft werden RLS, Eigentumstrennung, atomare Verkäufe, Wiederholungen, Überverkauf, historische Margin, tatsächliche Stoppänderungen, Korrekturhistorie, vollständiger Importrollback und FX-Leases. Das ist keine Liveprüfung des Supabase-Dienstes, seiner PostgREST-Konfiguration oder realer paralleler Datenbanksessions.

Die Browserabnahme der Entwicklungsvorschau umfasst Profilwechsel, Kursübernahme, 10-%-Stopp, Abrundung auf ganze Stücke, fehlenden FX, Stoppänderung, vollständigen Abschluss einer bereits teilverkauften Position, Tradezählung und Marginrendite sowie die Vorschau einer synthetischen CSV. Berechnung und Ansichten werden mit der Anwendung geteilt. Beispielverkäufe verwenden Browserzustand, keinen echten Datenbankzugang.

Eine zusätzliche lokale Prüfung gegen den lesend übernommenen Tabellenstand blieb außerhalb des Repositorys. Der persönliche Prüfbericht liegt unter `.local/import-pruefung.md`; echte Tabellenwerte, Tickerzuordnungen und Ausführungsdaten werden nicht mit dem Code veröffentlicht. Historische Datenlücken werden nicht durch heutige Kurse aufgefüllt.

## Gesonderte Livefreigabe

1. Erst nach konkretem Auftrag das bestehende Supabase-Projekt reaktivieren. Keinen neuen Tarif buchen, keine neuen Produktionsdaten anlegen und keine Registrierung öffnen.
2. Datenbankstand und Repository über das Supabase-Migrationstool vergleichen. Vorher Backup/Export sichern; bestehende Migrationen nicht verändern. Bei Abweichungen zuerst den tatsächlich vorhandenen Stand klären.
3. Die neue Migration `20261028083022_first_usable_journal.sql` auf einer geeigneten Testdatenbank prüfen und anschließend bewusst auf das bestehende Projekt anwenden. Keine Snapshot-Ersetzung und keinen Import echter Daten ohne geprüfte Vorschau auslösen.
4. Den Branch auf Vercel als Preview prüfen. Anmeldung mit eigenem Testkonto; neue Position in EUR und Fremdwährung, Teilverkauf, Schlussverkauf, Korrektur, Stoppänderung und Profilwechsel durchlaufen. Die Anzeige nach Neuladen und in einem zweiten Tab prüfen. Danach zwei getrennte Testbenutzer gegeneinander abgrenzen.
5. Twelve-Data-Kurse und FX mit serverseitigem Schlüssel real prüfen, einschließlich Notierung/MIC/Währung und fehlender Quelle. Die neue FX-Versorgung verbraucht das vorhandene gemeinsame Limit (8/min, 800/Tag; automatisch 6/min, 650/Tag). Ein Paar erhält eine Lease; HTTP 429 führt zu einer Stunde Wartezeit. Alte Cachewerte bleiben gekennzeichnet.
6. Vor einer Production-Promotion sicherstellen: Registrierung `closed`, öffentliche Seite `private`, Region `fra1`, keine `NEXT_PUBLIC_`-Secrets und `/vorschau` HTTP 404. Die vorhandenen rechtlichen Launchblocker bleiben bestehen.

Ohne diese Live-Abnahme ist der Stand lokal implementiert und überprüfbar, aber noch nicht für die Nutzung mit echten gespeicherten Depotdaten freigegeben.

## Erster persönlicher Durchlauf

NetLiq, Datenzeitpunkt und Trading-Profil in den Einstellungen setzen. Für die Erstübernahme des Hauptblatts gekaufte und verkaufte Zeilen einblenden, CSV herunterladen und unter Import prüfen. Die Erstübernahme benötigt ein Depot ohne echte Positionen. Bereits vorhandene echte App-Daten müssen separat abgeglichen werden; sie werden nicht automatisch gelöscht oder zusammengeführt. Nach erfolgreicher Übernahme Änderungen im Depotjournal pflegen.

Historische Einstiegsmargins und Verkaufs-FX sind eigenständige Referenzen. Fehlende Werte lassen entsprechende Rendite-/Eurokennzahlen offen. Bei einem heutigen Neueinstieg kann der aktuelle ausdrücklich bestätigte Marginwert zur Einstiegsreferenz werden. Spätere Marginanforderungen ändern sie nicht. Ein nach Teilverkauf nicht mehr passender direkter Marginbetrag muss neu bestätigt werden.

## Laufende Livefreigabe vom 28. Oktober 2026

Der Benutzer hat die Veröffentlichung ausdrücklich freigegeben. Das vorhandene Supabase-Projekt wurde wiederhergestellt und als `ACTIVE_HEALTHY` bestätigt. Alle 19 bisherigen Migrationen waren synchron. Vor der additiven Journalmigration wurden die betroffenen Datensätze und die bisherige Initialisierungsfunktion lokal und außerhalb der Versionsverwaltung gesichert. Die Journalmigration ist unter der vom Supabase-Migrationstool vergebenen Version `20261028083022` angewendet; der Dateiname im Repository wurde daran angeglichen. Bestandszahlen nach Migration: ein Konto, ein Depot, vier bestehende Positionen. RLS und RPC-Zugriffsbeschränkungen wurden live geprüft.

Der Positionsrechner lädt nach einer kurzen Eingabepause automatisch Kurs und Handelswährung. Er übernimmt beim neuen Instrument den aktuellen Kurs und einen anpassbaren 10-%-Stopp. Bestehende manuelle Planungswerte werden beim Tickerwechsel nicht übernommen. Die Umrechnung läuft automatisch; technische Optionen sind eingeklappt. Twelve Data bleibt die aktuelle Währungsquelle; bei Ausfall oder fehlendem Abfragebudget wird eine geprüfte EZB-Tagesreferenz über Frankfurter verwendet. Eine Tagesreferenz ist kein Intraday-Ausführungskurs. Die Richtung ist immer Instrumentwährung zur Depotwährung; Quelle und Datum bleiben sichtbar.

Lokale Prüfung dieser Korrektur: 153 Vitest-Tests, ESLint und TypeScript erfolgreich. Die echte Anbieterprüfung erfolgt mit `node --import tsx scripts/verify-market-data.ts` in der Vercel-Buildumgebung mit hinterlegtem Schlüssel. Sie prüft echte AMZN-Notierung und Kurs, USD/EUR, CHF/EUR und die Berechnung einer Bruchstückzahl mit diesen Kursen. Die Ausgabe enthält ausschließlich öffentliche Marktdaten. Der gesonderte Release-Build führt diese Prüfung vor dem normalen Build aus.

Es wurde kein zusätzlicher Auth-Benutzer angelegt. Die automatische Freigabe lehnte eine direkte Auth-Testfixture in Production ab. Die normale Registrierung bleibt geschlossen. Ein vollständiger Browserdurchlauf mit bestehendem Konto setzt die eigene Anmeldung des Benutzers voraus; diese Prüfung darf nicht mit synthetischen Vorschauwerten als erledigt bezeichnet werden.
