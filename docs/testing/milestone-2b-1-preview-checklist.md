# Manuelle Preview-Abnahme Meilenstein 2B.1

Preview und Production nutzen derzeit dasselbe Supabase-Projekt. Deshalb nur synthetische, eindeutig identifizierbare und anschließend gezielt löschbare Einzelzeilen verwenden. Keine echte Brokerdatei, Kontonummer, private Tabelle oder Zugangsdaten in Screenshots oder Fehlermeldungen aufnehmen.

Vor jeder manuellen Prüfung Anzahl und fachlichen Inhalt der vorhandenen Positionen und Cashbestände dokumentieren. Nach der Prüfung erneut abgleichen und bestätigen, dass Anzahl und Inhalt der bestehenden Positionen unverändert sind. Aktive Depotdaten dürfen für einen UI-Test weder ersetzt noch bereinigt werden.

## Authentifizierte Kernprüfung

1. Am neuen Vercel-Preview mit einem Testkonto anmelden.
2. `/cockpit` öffnen: **NetLiq-Hebel** muss Brutto-Marktwert der Wertpapierpositionen geteilt durch NetLiq zeigen; Cash und Legacy-Cash-Positionszeilen dürfen ihn nicht erhöhen.
3. `/einstellungen` öffnen und ausschließlich einzeln identifizierbare synthetische Cashsalden anlegen:
   - EUR nahe null, FX automatisch `1`;
   - negativer USD-Saldo mit positivem FX;
   - negativer CHF-Saldo mit positivem FX.
4. Einzelwerte, Gesamtcash, Anzahl positiver/negativer Salden und FX-Vollständigkeit im Cockpit prüfen.
5. Bei einem Fremdwährungssaldo den FX entfernen beziehungsweise einen neuen Saldo ohne FX anlegen: Gesamtcash muss als unvollständig erscheinen.
6. Cash-Testdaten gezielt anhand ihrer zuvor dokumentierten Währung/Quelle löschen; keine Sammelbereinigung ausführen.
7. Prüfen, dass die Basiswährung bei vorhandenen Positionen oder Cashbeständen schreibgeschützt ist und ein manipuliertes Formular serverseitig abgelehnt wird. Unverändertes Speichern muss funktionieren.

## Positionen und Marktdaten

1. `/depot` öffnen und höchstens eine eindeutig identifizierbare synthetische Wertpapierposition anlegen.
2. Kurs, Kursquelle, Zeitpunkt und Status gemeinsam prüfen.
3. Entry-FX und aktuellen FX verschieden setzen; der aktuelle Positionswert muss den aktuellen FX verwenden.
4. Marginquote im Formular als `25,00 %` anzeigen lassen; gespeicherter kanonischer Wert ist `0.25`.
5. Einen bestätigten manuellen direkten Marginwert `0` speichern: Er bleibt zulässig und wird als manuell direkt, nicht als Brokerwert, gekennzeichnet.
6. Einen alten oder fehlenden Kurs mit Status `stale` prüfen; er darf nicht ohne Hinweis aktuell wirken.
7. Prüfen, dass „Cash“ bei einer neuen Position nicht auswählbar ist und ein manipulierter `savePosition`-Aufruf mit `instrument_type=cash` abgelehnt wird.
8. Eine bereits vorhandene Legacy-Cash-Positionszeile darf gelesen werden, bleibt unveränderbar Cash und ist aus Marktwert, NetLiq-Hebel, Margin, Risiko und Kategorien ausgeschlossen. Für diesen Test keine Legacydaten erzeugen oder löschen.
9. Die synthetische Wertpapierposition gezielt löschen und den dokumentierten Ausgangsbestand abgleichen.

## CSV-Snapshot und Rollback

1. `/import` mit einer synthetischen CSV öffnen.
2. `25%`, `25,00%`, `25.00%` sowie eine ausdrücklich als Quote definierte Spalte mit `0,25` prüfen.
3. In der Vorschau Originalwert, normalisierte Marginquote und berechnetes Margin Requirement prüfen.
4. Prüfen, dass „Wechselkurs“ und „exchange rate“ nicht automatisch zugeordnet werden.
5. Mit dem normalen Benutzerkonto ausschließlich Parsing, Mapping, Vorschau und Validierungsfehler prüfen. Keinen vollständigen Snapshot importieren.
6. Einen tatsächlichen Snapshot-Import ausschließlich mit einem getrennten Testbenutzer oder einem eigens dafür angelegten Testportfolio durchführen.
7. Nur in diesem isolierten Testkontext einen absichtlich ungültigen RPC-Import ausführen; Positionen, Kategorien und Importhistorie müssen vollständig unverändert bleiben.
8. Synthetische Importdaten im isolierten Testkontext gezielt entfernen. Aktive Depotdaten des normalen Benutzerkontos niemals durch einen UI-Test ersetzen.

## Routen und Regression

- `/cockpit`, `/depot`, `/risiko`, `/einstellungen`, `/import`
- Anmeldung und Abmeldung
- Position anlegen, bearbeiten, löschen
- Einstellungen speichern
- bestehende Meilenstein-1.1-, 2A- und 2B-Funktionen

## Abschlusskontrolle

- Vorher/nachher-Zahl der bestehenden Positionen identisch.
- Vorher/nachher-Inhalt der bestehenden Positionen identisch.
- Keine aktiven Depotdaten ersetzt.
- Alle synthetischen Einzelzeilen gezielt entfernt.
- Kein Snapshot-Import mit dem normalen Benutzerkonto ausgeführt.

Wenn Browserautomation durch Authentifizierung oder Sicherheitsrichtlinien technisch nicht möglich ist, wird diese Liste im Draft-PR als ausstehende manuelle Abnahme verlinkt. Das ist transparent als Mergevorbehalt zu behandeln.
