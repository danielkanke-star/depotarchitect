# Manuelle Preview-Abnahme Meilenstein 2B.1

Nur synthetische Daten verwenden. Keine echte Brokerdatei, Kontonummer, private Tabelle oder Zugangsdaten in Screenshots oder Fehlermeldungen aufnehmen.

## Authentifizierte Kernprüfung

1. Am neuen Vercel-Preview mit einem Testkonto anmelden.
2. `/cockpit` öffnen: **NetLiq-Hebel** muss Brutto-Marktwert der Wertpapierpositionen geteilt durch NetLiq zeigen; Cash und Legacy-Cash-Positionszeilen dürfen ihn nicht erhöhen.
3. `/einstellungen` öffnen und synthetische Cashsalden anlegen:
   - EUR nahe null, FX automatisch `1`;
   - negativer USD-Saldo mit positivem FX;
   - negativer CHF-Saldo mit positivem FX.
4. Einzelwerte, Gesamtcash, Anzahl positiver/negativer Salden und FX-Vollständigkeit im Cockpit prüfen.
5. Bei einem Fremdwährungssaldo den FX entfernen beziehungsweise einen neuen Saldo ohne FX anlegen: Gesamtcash muss als unvollständig erscheinen.
6. Cash-Testdaten anschließend löschen.

## Positionen und Marktdaten

1. `/depot` öffnen und eine synthetische Wertpapierposition anlegen.
2. Kurs, Kursquelle, Zeitpunkt und Status gemeinsam prüfen.
3. Entry-FX und aktuellen FX verschieden setzen; der aktuelle Positionswert muss den aktuellen FX verwenden.
4. Marginquote im Formular als `25,00 %` anzeigen lassen; gespeicherter kanonischer Wert ist `0.25`.
5. Einen bestätigten manuellen direkten Marginwert `0` speichern: Er bleibt zulässig und wird als manuell direkt, nicht als Brokerwert, gekennzeichnet.
6. Einen alten oder fehlenden Kurs mit Status `stale` prüfen; er darf nicht ohne Hinweis aktuell wirken.
7. Optional eine Legacy-Cash-Positionszeile prüfen: Sie muss als Übergangsfall markiert und aus Wertpapieraggregationen ausgeschlossen sein.
8. Synthetische Positionen anschließend löschen oder den Ausgangszustand wiederherstellen.

## CSV-Snapshot und Rollback

1. `/import` mit einer synthetischen CSV öffnen.
2. `25%`, `25,00%`, `25.00%` sowie eine ausdrücklich als Quote definierte Spalte mit `0,25` prüfen.
3. In der Vorschau Originalwert, normalisierte Marginquote und berechnetes Margin Requirement prüfen.
4. Prüfen, dass „Wechselkurs“ und „exchange rate“ nicht automatisch zugeordnet werden.
5. Einen gültigen Snapshot importieren und Cockpit/Depot kontrollieren.
6. Einen absichtlich ungültigen RPC-Import ausführen; Positionen, Kategorien und Importhistorie müssen vollständig unverändert bleiben.
7. Synthetische Importdaten anschließend auf den Ausgangszustand zurücksetzen.

## Routen und Regression

- `/cockpit`, `/depot`, `/risiko`, `/einstellungen`, `/import`
- Anmeldung und Abmeldung
- Position anlegen, bearbeiten, löschen
- Einstellungen speichern
- bestehende Meilenstein-1.1-, 2A- und 2B-Funktionen

Wenn Browserautomation durch Authentifizierung oder Sicherheitsrichtlinien technisch nicht möglich ist, wird diese Liste im Draft-PR als ausstehende manuelle Abnahme verlinkt. Das ist transparent als Mergevorbehalt zu behandeln.
