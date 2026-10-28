# Erster brauchbarer Stand

Verbindlicher Umfang nach dem Depotalltag und den Entscheidungen vom Oktober 2026. Dieses Dokument hat für diesen Stand Vorrang vor älteren Zielbild- und Roadmapentwürfen. DepotArchitect ist eine Web-App für das eigene Depotjournal, die Übersicht und die manuelle Positionsplanung.

## Alltag

- Neue Käufe sind eigene Teilpositionen mit Instrument/Notierung, Kategorie, Richtung, Einstiegsmenge, Preis und tatsächlichem Datum. Mehrere Einstiege desselben Wertpapiers bleiben getrennt.
- Der Trading-Stopp dokumentiert eine vom Benutzer beim Broker hinterlegte Stopporder. Nur eine wirkliche Kursänderung setzt das Stoppdatum neu. Ein Kommentar oder eine Kursaktualisierung tut das nicht.
- Ein Verkauf erfasst Menge, Preis, tatsächliches Ausführungsdatum und gegebenenfalls historischen FX. Ein Teilverkauf verändert die offene Menge; eine vollständige Ausbuchung blendet die Position aus der standardmäßig offenen Depotansicht aus. Manuelles Duplizieren von Zeilen entfällt.
- Ein Doppelklick oder eine identische Wiederholung derselben Anfrage erzeugt keinen zweiten Verkauf. Überverkäufe werden atomar abgewiesen.
- Korrekturen an Verkäufen brauchen einen Grund. Frühere Werte bleiben in `position_sale_revisions` und im Eigendatenexport erhalten. Positionen mit Verkaufshistorie können nicht über die normale Depotaktion gelöscht werden.
- Kommentar und HTTPS-TradingView-Link sind optional. Dateien oder Screenshots werden nicht verarbeitet.

## Berechnungsregeln

Alle Geldberechnungen erfolgen mit Decimal. Anzeige-Rundung und Abrundung auf die zulässige Stückelung sind ausdrücklich festgelegte Endschritte. FX bedeutet stets: eine Einheit der Handelswährung in Depotbasiswährung. Die Berechnung multipliziert mit diesem Wert. Maßgeblich ist die gewählte Notierungswährung, nicht der Unternehmenssitz.

| Größe | Regel |
| --- | --- |
| Marktwert | offene Menge × aktueller Kurs × Multiplikator; zusätzlich × aktueller FX für Basiswährung |
| Long/Short/Brutto/Hebel | Bestehende zentrale Engine; Cash ausgeschlossen; Hebel = Bruttomarktwert / NetLiq |
| Stopprisiko Long | (aktueller Kurs − Brokerstopp) × offene Menge × Multiplikator × aktueller FX |
| Stopprisiko Short | (Brokerstopp − aktueller Kurs) × offene Menge × Multiplikator × aktueller FX |
| Risikobudget | NetLiq × 0,33 × Profilfaktor |
| Budgetauslastung | vollständiges Stopprisiko / Risikobudget |
| Planungsbasis | NetLiq − vollständiges bestehendes Stopprisiko |
| Risiko eines neuen Trades | Planungsbasis × eingegebener Risikosatz / 100 |
| Stückzahl | Risikobetrag / (Einstieg-Stopp-Distanz × Multiplikator × FX), abgerundet auf die konfigurierte Stückelung |
| Aktuelle Margin | aktueller offener Marktwert × aktuelle Marginquote oder ausdrücklich bestätigter direkter Betrag |
| Realisierter Kurs-G&V | Richtung × (Verkaufskurs − Einstiegskurs) × verkaufte Menge × Multiplikator × historischen Verkaufs-FX |
| Marginrendite vor Kosten | realisierter Kurs-G&V / beim Einstieg festgehaltene Margin in Basiswährung |

Ein Stopp über dem Einstieg kann weiterhin ein Rückgaberisiko für bereits vorhandene Buchgewinne bedeuten. Deshalb wird das Risiko ab dem aktuellen Kurs gemessen. Ein auf der falschen Seite des aktuellen Kurses liegender Stopp ist ungültig. Fehlende Kurse, FX oder Stopps sind keine Nullwerte. Eine vollständig leere Wertpapierliste hat dagegen tatsächlich null Risiko.

Ein fehlender FX verhindert die native Marktwert- und Risikoberechnung nicht. Basiswährungskennzahlen bleiben unvollständig. Der Positionsgrößenrechner gibt bei unvollständigem Gesamtrisiko, nichtpositiver Planungsbasis oder einem Stopp ohne positive Verlustdistanz keine Stückzahl aus. Er kappt einen bewussten Risikobetrag nicht heimlich am Depotbudget, sondern zeigt eine Überschreitung an. Bruchstücke sind möglich; Stückelung und Multiplikator müssen zum tatsächlich handelbaren Instrument passen.

Die Einstiegsmargin ist eine eigene unveränderliche Referenz. Bei einem heutigen neuen Einstieg kann sie aus dessen direkten Marginbetrag oder aus Einstiegsmarktwert, Einstieg-FX und Marginquote festgehalten werden. Bei älteren Positionen muss eine historische Referenz ergänzt werden. Eine heutige Marginquote wird dafür nicht stillschweigend übernommen. Spätere Margin- oder FX-Änderungen verändern diese Referenz nicht. Fehlende oder null Einstiegsmargin ergibt keine berechenbare Marginrendite. Nach Verkäufen muss ein direkter aktueller Marginbetrag für die Restmenge neu bestätigt werden; ein alter Betrag wird nicht als weiterhin verlässlich ausgegeben. Quotenschätzungen werden mit der Restmenge neu berechnet.

Gebühren, Finanzierungskosten und Steuern bleiben ausgeschlossen. Angezeigt wird der Kurs-G&V, umgerechnet zum Verkaufs-FX; eine vollständige Kontoperformance einschließlich FX-Effekt auf den gesamten Einstand ist nicht Bestandteil dieses Stands.

## Zählung und Statistik

Ein statistischer Trade wird durch Depot, Wertpapier/konkrete Notierung, Richtung, Einstiegstag und Kategorie bestimmt. Teilverkäufe zählen sofort zum realisierten Ergebnis, für Tradeanzahl, Trefferquote und durchschnittlichen Gewinn/Verlust erst nach vollständigem Abschluss der Gruppe. Andere Einstiegstage oder Kategorien sind eigene Trades. Bei alten Datensätzen ohne Einstiegstag wird keine gemeinsame Gruppe erfunden. Verschiedene unbestätigte Notierungen werden ohne stabile Identität nicht über Währungs- oder Vertragsgrenzen zusammengeführt.

Die Kategorienübersicht zählt ein Wertpapier innerhalb einer Kategorie einmal. Drei AMZN-Teilpositionen im Kerninvestment ergeben ein Wertpapier und drei Teilpositionen. Ziele: Kerninvestment 8, Momentumtrade 9, taktische Beimischung 4, Hedge 1–2 nach Marktlage. Die Zielzahlen sind Prüfhinweise, keine Kaufaufforderungen.

- Trefferquote = Gewinntrades / vollständig in Basiswährung bewertbare abgeschlossene Trades. Nullergebnisse zählen im Nenner. Unvollständig bewertete Abschlüsse werden separat gezählt.
- Haupt-Renditekennzahl = Summe des realisierten G&V geschlossener Trades / Summe ihrer Einstiegsmargins. Bei unvollständigen Referenzen wird keine scheinbar vollständige Rendite ausgewiesen. Dies ist eine marginbezogene Auswertung der Trades, keine Depot-TWR/IRR und keine Rendite auf einmalig eingesetztes Kontokapital.
- Durchschnittliche Haltedauer = Kalenderzeit vom Einstieg bis zum letzten Verkauf, gemittelt über datierte Abschlüsse.
- Rollierende 12 Monate zeigen realisierten Kurs-G&V anhand der Ausführungsdaten. Ohne vollständige Kontohistorie wird dafür keine Depot-Prozentrendite erfunden.
- Eine optionale p.a.-Hochrechnung ist nur für abgeschlossene Trades mit einem Verkaufstag und positiver Haltedauer vorhanden: `(1 + Marginrendite)^(365 / Tage) − 1`. Ab 100 % Verlust oder mehreren Verkaufstagen bleibt sie offen. Bei kurzen gehebelten Trades kann sie extreme Zahlen ergeben; sie steht deshalb abseits der Hauptkennzahlen und ist ausdrücklich eine rechnerische Hochrechnung.

## Farb- und Prüfregeln

Farben werden durch Text/Symbole ergänzt. Es sind persönliche Aufmerksamkeitsregeln, keine geschätzten Verlustwahrscheinlichkeiten. Fehlende Daten bleiben neutral und erzeugen einen Datenhinweis.

| Regel | Beobachten | Erhöht | Dringend |
| --- | --- | --- | --- |
| Positionsrisiko / NetLiq | ab 0,5 % × Profil | ab 1,1 % × Profil | ab 2 % × Profil |
| Stopp unverändert | ab 7 Tagen | ab 11 Tagen | ab 14 Tagen |
| Auslastung des Risikobudgets | ab 60 % | ab 90 % | ab 100 % |
| Risikokonzentration eines Wertpapiers | ab (1 + 0,5 × Profil) × Gleichverteilungsanteil | ab (1 + Profil) × Gleichverteilungsanteil | ab (1 + 2 × Profil) × Gleichverteilungsanteil |

Profilfaktoren: Stockkonservativ 0,4; Konservativ 0,6; Normal 0,8; Aggressiv 1,0; Aggro 1,2. Der Konzentrationshinweis wird unabhängig vom Stopprisiko angezeigt, mit geringerer Dringlichkeit: ab eingestellter Basisgrenze für Wertpapier/NetLiq × Profil (Vorgabe 15 %). Das Engagement wird über Teilpositionen summiert. Die Risikokonzentration nutzt `Risikoanteil × Anzahl offener Wertpapiere`; damit gelten 20 gleich riskante Wertpapiere nicht alle bereits wegen jeweils 5 % als extrem konzentriert.

Die Margin-Auslastung hat eine eigene persönliche Hinweisgrenze (Vorgabe 50 % NetLiq). Ihr Farbverlauf verwendet 60/90/100 % dieser Grenze. Der vereinfachte Margin-Puffer ist NetLiq minus aktuelle Margin. Das lineare Rückgangsszenario gilt nur für Long-Aktien/ETFs bei konstantem Marginbetrag und FX. Es wird nicht als IBKR-Margin-Call-Prognose bezeichnet. Kurslücken, tatsächliche Brokerregeln und wechselnde Marginanforderungen sind dadurch nicht abgedeckt.

## Erstübernahme und Datenlücken

Der Journalimport erkennt den fünften Tabellenkopf des bisherigen Hauptblatts, Status in Spalte F, Stoppdatum in K und Währungspaare wie EURUSD. Aktuelle Kurse und heutige Währungswerte werden als Importreferenzen übernommen. Historische Verkaufskurse und -daten bleiben erhalten. Die aktuelle Sheet-Marginquote ist kein Nachweis der Einstiegsmargin, der aktuelle Sheet-Wechselkurs kein Nachweis des Verkaufs-FX. Entsprechende Lücken sind in Vorschau und Statistik sichtbar. Eine ergänzte CSV-Vorlage kann historische Referenzen ausdrücklich angeben.

Der Import ist eine atomare Erstübernahme in ein Depot ohne echte Positionen. Bereits bekannte Zeilen können identisch wiederholt werden. Ein abweichender erneuter Bestand wird abgewiesen, um Duplikate und Überschreiben von Historie zu verhindern. Danach wird in der App gepflegt; der CSV-Import ist keine laufende Synchronisierung. Bestehende echte Depotdaten müssen vor einer Zusammenführung separat abgeglichen werden. Die Anwendung löscht sie nicht eigenständig. Die Quelldatei und die Google-Tabelle werden nicht geändert.

Derivate benötigen verifizierte Vertragsdaten und werden vom neuen Journalimport nicht pauschal als Aktien eingelesen, wenn sie ausdrücklich als Derivate gekennzeichnet sind. Alte Tabellen ohne Instrumentart werden als Aktien übernommen; entsprechende Zeilen müssen in der Importvorschau geprüft werden. Für den ersten Stand sind Aktien und ETFs der verlässliche Arbeitsbereich.

## Separat bleiben

Broker-/IBKR-Verbindung, automatische Orderänderungen, alternatives Euro-/ATH-Risikobudget, Aktienuniversum als Arbeitsbereich, Ticker-Lernanalyse, Volatilitäts- und Stoppwahrscheinlichkeitsmodelle, vollständige historische Kontoperformance und Abrechnung. Die Berechnungen und das separate Ausführungsjournal schaffen Anschlusspunkte, ohne diese Funktionen bereits einzubauen.
