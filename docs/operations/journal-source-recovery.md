# Nachvollziehbare Statistik aus dem bisherigen Journal

Stand: 28. Oktober 2026. Die Google-Tabelle wurde ausschließlich gelesen. Brokerzugriffe dienten der Prüfung von Instrumenten und verfügbaren Ausführungen; es wurden keine Orders erteilt oder verändert.

## Ursache und Berechnungsbasis

Der ursprüngliche Import bewahrte Verkäufe, ließ jedoch nicht belegte historische Verkaufs-Wechselkurse und Einstiegsmarginbeträge leer. Das war keine Rechenstörung: Das bisherige Hauptblatt berechnet auch alte Ergebnisse mit seinem aktuellen Google-Finance-Wechselkurs. Seine Marginspalte ist eine gespeicherte Quote, kein Beleg eines historischen Broker-Marginbetrags.

`journal_source_references` hält deshalb den beim Abgleich gelesenen Tabellenstand separat fest: Quelldokument, Blatt, Zeile, Abrufzeit, Instrument, Richtung, Kategorie, Menge in Preiseinheiten, Einstieg, Verkauf, Tabellen-Wechselkurs und Marginquote. Die im Blatt ausgewiesene Ergebniszelle bleibt zum Abgleich erhalten; gerechnet wird mit den belegten Eingaben. Persönliche Quelldaten und Sicherungen sind nicht Bestandteil des Repositorys.

- Belegte historische Ausführungs-Wechselkurse und eingefrorene echte Einstiegsmargins haben Vorrang.
- Fehlen diese, verwendet die Statistik eine ausdrücklich gekennzeichnete, feste Tabellenreferenz. Ergebnis = Richtungsfaktor × Kursdifferenz × verkaufte Preiseinheiten × erfasster Wechselkurs. Marginreferenz = Einstiegspreis × Preiseinheiten × erfasste Marginquote × erfasster Wechselkurs.
- Aktuelle Kurse, Wechselkurse oder Marginänderungen verändern diese Referenz nicht.
- Eine Referenz gilt nur, solange Instrument, Währung, Richtung, Einstiegsdatum, Preis und Menge übereinstimmen. Für Ergebnisreferenzen müssen außerdem Verkaufsdatum, Verkaufspreis und verkaufte Gesamtmenge passen. Korrekturen ziehen keine veraltete Referenz nach.
- Für die zusammengefasste Marginrendite enthalten Zähler und Nenner dieselben vollständig bewerteten abgeschlossenen Tradegruppen. Die Abdeckung steht an der Kennzahl.
- Gebühren, Finanzierungskosten und Steuern bleiben gemäß Produktumfang ausgeschlossen. Diese Auswertung ist keine historische IBKR-Kontorendite.

## Abgleich und verbleibende Grenze

Der direkte Abgleich des gespeicherten Live-Bestands bestätigt 510 Quellenreferenzen, 509 reale Positionsdatensätze und 477 datierte Verkaufsdatensätze. Die übrige abgeschlossene Quellenzeile enthält keinen Verkaufstag. Alle 459 abgeschlossenen statistischen Tradegruppen besitzen ein bewertbares Ergebnis und eine positive Marginbasis.

Zwei eindeutig zugeordnete Kategorieangaben wurden aus dem Blatt ergänzt. Eine bereits bestätigte EUR-Notierung wurde in einem historischen Datensatz korrigiert. Ein seit der Erstübernahme hinzugekommener, vollständig belegter ETF-Einstieg wurde übernommen. Bereits vorhandene Mengen, Einstiegsdaten, Einstiegspreise, Richtungen und Multiplikatoren blieben unverändert.

Für einen Abschluss fehlt der Verkaufstag sowohl im Blatt als auch in den abgeglichenen verfügbaren IBKR-Ausführungen. Die belegten Ergebnisangaben gehen in die Gesamtstatistik ein. Es wird kein Broker-Verkauf mit fiktivem Datum angelegt, keine Haltedauer erfunden und keine vollständige rollierende Zwölfmonatskennzahl angezeigt. Die Quellenprüfung macht diesen einzelnen offenen Tag sichtbar.

## Zugriff und Export

Migration `20261028181634_journal_source_references.sql` ist additiv. Die neue Tabelle verwendet Eigentümer-RLS. Angemeldete Benutzer dürfen eigene Referenzen lesen und anlegen, aber nicht nachträglich überschreiben oder löschen. Der Journalimport speichert Positionen und ihre Referenzen atomar; der ursprüngliche Importkern ist im privaten Schema und nicht direkt ausführbar. Der Eigendatenexport enthält alle Quellenreferenzen ab Exportversion `first-usable.2`.

Die lokalen SQL-Tests prüfen Fremdzugriff, Unveränderlichkeit, atomaren Rollback und die Sperre des privaten Importkerns. Fachliche Tests prüfen eingefrorene Referenzen, den Vorrang echter historischer Daten, Korrekturen, undatierte Abschlüsse und übereinstimmende Rendite-Abdeckung.
