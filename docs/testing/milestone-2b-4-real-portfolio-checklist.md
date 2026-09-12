# Meilenstein 2B.4 – Reale Depotabnahme

Diese Prüfliste ist nicht-destruktiv. Preview und Production verwenden derzeit dasselbe Supabase-Projekt. Deshalb ausschließlich ein dediziertes Testdepot beziehungsweise einen dedizierten Testbenutzer verwenden. Aktive Bestände niemals durch einen Snapshot-Import ersetzen.

## Vor der Prüfung

- Testbenutzer und Testdepot eindeutig benennen.
- Vorhandene Anzahl der Positionen, Cashsalden und FX-Einträge dokumentieren.
- Keine echten Zugangsdaten, vollständigen Brokerkontonummern oder API-Schlüssel dokumentieren.
- Reale Werte ausschließlich aus einer vom Benutzer kontrollierten Quelle übernehmen.
- Für jede temporäre Testzeile vorab festlegen, wie sie gezielt wieder entfernt wird.

## Prüfschritte

1. **Basiswährung prüfen:** Depotbasiswährung mit dem Brokerbericht vergleichen. Bei vorhandenen Daten nicht ändern.
2. **Instrumentwährungen prüfen:** Für jede offene Position Handels-/Instrumentwährung kontrollieren und nicht automatisch der Depotbasiswährung gleichsetzen.
3. **Reale aktuelle Kurse eintragen:** Kurs in Instrumentwährung zusammen mit Quelle, Datenzeitpunkt und Status speichern. Demo- oder fehlende Werte müssen klar erkennbar bleiben.
4. **FX-Paare eintragen:** Jedes benötigte Paar als „eine Einheit Ausgangswährung in Depotbasiswährung“ speichern. Identische Währungen verwenden Faktor 1.
5. **Trading-Stopps prüfen:** Stopp in Instrumentwährung, Aktualisierungszeitpunkt und optionalen Kommentar kontrollieren. Warnung bei Long über Kurs beziehungsweise Short unter Kurs bestätigen; Wert nicht automatisch verändern.
6. **Marginwerte prüfen:** Wert, Währung, Quelle, Zeitpunkt, Berechnungsart und Vertrauensstatus kontrollieren. `legacy_untrusted` nicht als belastbar werten. Für Cash gilt „Margin nicht zutreffend“.
7. **Positionsmarktwerte mit dem Broker vergleichen:** Offene Menge × aktueller Kurs × Multiplikator × aktueller FX. Differenzen samt Rundungs- und Zeitbezug notieren.
8. **NetLiq-Anteile vergleichen:** Berechneten Marktwert in Depotbasiswährung durch die separat gepflegte NetLiq teilen. Cash nicht zusätzlich in den Wertpapiermarktwert aufnehmen.
9. **Risiko bis Stopp stichprobenartig nachrechnen:** Long `(Kurs − Stopp) × offene Menge × Multiplikator × FX`; Short `(Stopp − Kurs) × offene Menge × Multiplikator × FX`.
10. **NetLiq-Hebel vergleichen:** Wertpapier-Bruttomarktwert durch NetLiq. Cash bleibt ausgeschlossen.
11. **Abweichungen dokumentieren:** Je Abweichung Instrument, verglichene Zeitpunkte, Datenquelle, Rundung und vermutete Ursache dokumentieren. Keine echten Depotwerte in Git committen.
12. **Fehlende Daten sichtbar bestätigen:** Kurs, FX, Stopp und Margin müssen jeweils als fehlend beziehungsweise nicht berechenbar erscheinen; keine Null- oder Demo-Ersatzwerte.

## Nach der Prüfung

- Temporäre synthetische Einzelzeilen gezielt löschen.
- Anzahl und Inhalt der zuvor bestehenden Positionen, Cashsalden und FX-Einträge erneut vergleichen.
- Bestätigen, dass keine aktiven Daten ersetzt oder gelöscht wurden.
- Nur Testergebnis und Abweichungskategorien dokumentieren, keine vertraulichen Depotwerte.
