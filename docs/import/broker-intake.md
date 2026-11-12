# Datenaufnahme im DepotArchitect

## Einstieg

Neue Benutzer landen nach der Anmeldung in einem leeren Hauptdepot. Sie wählen im Cockpit **Broker verbinden**, **Dateien importieren** oder **Position erfassen**. Alle Wege sind auch über **Daten hinzufügen** erreichbar. Dort lassen sich separate Depots anlegen. Der Depotwähler gilt für Bestand, Statistik, Risiko, Ein- und Auszahlungen, Einstellungen und Import.

Für historische Daten beim frühesten verfügbaren Einstieg beginnen. Laufende Berichte dürfen sich überschneiden. Buchungsnummern werden pro Quelle und Brokerkonto geprüft. Ein Verkauf ohne ausreichenden Bestand aus derselben Quelle stoppt den gesamten Import und nennt den fehlenden Einstieg. DepotArchitect verwendet für die Zuordnung das älteste verfügbare Eröffnungslos zuerst (FIFO). Auswertungen können deshalb von der steuerlichen Loszuordnung des Brokers abweichen.

| Quelle | Unterstützt |
|---|---|
| Interactive Brokers | Activity Flex Query als XML oder täglicher Abruf mit Abfrage-ID und befristetem Berichtstoken. Ausgeführte Aktien-, Fonds- und Optionskäufe und -verkäufe mit eindeutiger Eröffnungs- oder Schließungskennzeichnung. Optional Depotwert und Schlusskurse aus dem Bericht. |
| flatex | Einzelne Kauf- und Verkaufsabrechnungen mit eingebettetem Text aus demselben Verrechnungskonto. Bis zu 50 PDFs gleichzeitig. Anleihen mit Prozentkurs, Scans, Sammelabrechnungen, Stornos, Dividenden und Kapitalmaßnahmen brauchen andere Formate oder Erfassung. |
| CSV oder TSV | Spaltenzuordnung für Kauf/Verkauf, Wertpapier, Handelstag, Stückzahl, Stückkurs und Handelswährung. Eindeutige Buchungsnummern sind besonders bei identischen Teilausführungen wichtig. Ohne Nummer werden identische Zeilen über mehrere Exporte als dieselbe Buchung behandelt. |
| Manuell | Einstieg mit Wertpapier, Menge, Datum, Einstiegskurs und Handelswährung. Kategorie, Stopps, Margindaten und Kommentare lassen sich ergänzen. Verkäufe werden beim jeweiligen Los erfasst. |

Wertpapierabrechnungen liefern keine vollständige Kontohistorie. Ein- und Auszahlungen, historisch angesetzte Margin, offene Stopps, Splits und sonstige Kapitalmaßnahmen ergeben sich nicht zuverlässig aus einfachen Kauf- und Verkaufsdateien. Die Vorschau übernimmt keine erfundenen Werte. Bei importierten Positionen ohne bestätigte Kurszuordnung kann im Depot die Notierung nachgetragen werden.

## IBKR in der Private Beta

Im IBKR-Portal Flex Web Service aktivieren und für genau ein Brokerkonto eine **Activity Flex Query** konfigurieren. Ausgabeformat XML, Berichtsteil **Trades** mit Detailgrad **Executions** und allen Ausführungsfeldern. Für Broker-Umrechnung **Account Information** einbeziehen. **Open Positions** mit Detailgrad **Summary** liefert Schlusskurse, **Net Asset Value Summary in Base** liefert den datierten Depotwert in der Basiswährung des IBKR-Kontos. Für tägliche Abrufe einen rollierenden Zeitraum wählen, beispielsweise die letzten sieben Tage. Ältere Ausführungen separat als XML-Datei laden.

Der Abruf läuft serverseitig einmal täglich auf dem bestehenden Vercel-Tarif und lässt sich in der App manuell anstoßen. Das Token läuft nach der im Brokerportal gewählten Dauer ab. Der Benutzer kann es erneuern oder die Verbindung trennen. Estably- bzw. IBKR-Unterkonten müssen die Flex-Funktion im jeweiligen Portal anbieten. Der vorhandene lokale Kursdienst ist für Kursabfragen weiterhin separat verfügbar. Die Web API für Drittanbieter erfordert IBKR-Freigabe. Flex bietet keinen Zugriff auf Handelsaufträge und keine Echtzeitversorgung.

Konfiguration: `IBKR_FLEX_SECRET` als sensible Produktionsvariable in Vercel mit 32 zufälligen Bytes in Hexdarstellung, zusätzlich das vorhandene `CRON_SECRET`. Der AES-256-GCM-Schlüssel ist vom internen Abrufschlüssel getrennt abgeleitet. Pro Depot ist der verschlüsselte Inhalt an die Depot-ID gebunden. Die Scheduler-RPCs benötigen den internen Schlüssel und einen zeitlich begrenzten Job. Der Schlüssel wird serverseitig gesichert. Ein Verlust oder eine Änderung erfordert eine erneute Einrichtung der Verbindungen.

## Währungsumrechnung

Bewertungen rechnen den Kurs aus der Handelswährung in die Depotwährung um. Bei historischen Verkäufen wird der ausgewiesene Broker-Umrechnungskurs verwendet, wenn dessen Richtung und Zielwährung belegt sind. Andernfalls kann ein veröffentlichter EZB-Referenzkurs vom Handelstag oder dem letzten Veröffentlichungstag davor verwendet werden. Diese Schätzung ist kein persönlicher Devisenausführungskurs. Das Journal zeigt Kurs-Gewinn und -Verlust vor Kosten. Brokerkosten, Finanzierung und Steuern werden separat betrachtet.

## Quellen

- [IBKR Flex Token](https://www.interactivebrokers.com/docs/web-api/flex-web-service/client-portal-configuration/enable-and-create-access-token)
- [IBKR Activity Flex Query Reference](https://www.ibkrguides.com/reportingreference/reportguide/activity%20flex%20query%20reference.htm)
- [IBKR Web-API-Authentifizierung](https://www.interactivebrokers.com/docs/web-api/authentication/introduction)
- [flatex Wertpapierabrechnung](https://www.flatex.de/barrierefreiheit/)
- [Portfolio Performance PDF-Import](https://help.portfolio-performance.info/en/reference/file/import/pdf-import/)
- [GOV.UK File Upload](https://design-system.service.gov.uk/components/file-upload/) und [Check Answers](https://design-system.service.gov.uk/patterns/check-answers/)
- [NN/g Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
- [EZB-Referenzkurse](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)
