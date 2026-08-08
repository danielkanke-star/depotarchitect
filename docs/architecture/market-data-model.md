# Reale Markt-, FX-, Stopp- und Margindaten

Status: technische und fachliche Grundlage aus Meilenstein 2B.4, nun um das providerneutrale Instrumentenuniversum, konkrete Listings, zentrale Latest-Value-Caches und kostenkontrollierte Abrufe ergänzt. Details stehen in `docs/architecture/instrument-universe.md`. Twelve Data ist nur ein optionaler serverseitiger Rückfallanbieter. Eine Brokeranbindung wird noch nicht eingeführt.

Die technischen FX-, Provider-, Quellen-, Status- und Zeitfelder werden bewusst nicht im normalen Positionsformular angezeigt. Der aktuelle Kurs ist dagegen eine notwendige fachliche Eingabe: Jede neue normale Position benötigt einen manuellen Rückfallkurs. Importpfade liefern den Kurs mit ihren Positionen. Spätere Broker- und Marktdatenadapter bleiben technisch vorbereitet.

## Datenstatus

Kanonische Statuswerte:

- `live`
- `delayed`
- `end_of_day`
- `manually_updated`
- `stale`
- `missing`
- `demo`

Legacywerte `closing`, `manual` und `imported` bleiben datenbankseitig vorübergehend lesbar und werden in der Anwendung auf `end_of_day` beziehungsweise `manually_updated` normalisiert. Neue manuelle Schreibvorgänge verwenden ausschließlich die kanonischen Werte.

`demo` ist keine reale Datenquelle. Demo-Kurse und Demo-FX werden nicht für aktuelle Marktwerte, Kurs-G&V, Stopprisiko, Marginableitungen oder belastbare Depotaggregate verwendet. `stale` bleibt mit sichtbarer Einschränkung berechenbar. `missing` erzeugt keine Null und keinen Ersatzwert.

## Aktueller Kurs

`position_price_observations` speichert Kursbeobachtungen getrennt nach Position, Ticker-Snapshot, Währung, Wert, Zeitpunkt, Status und Quelle. Beobachtungen sind für normale Benutzer unveränderlich; eine neue Beobachtung ersetzt keine ältere Quellenzeile.

Die Anwendung löst daraus einen kanonischen aktuellen Kurs auf. Priorität:

1. gültiger und nicht veralteter IBKR-Kurs
2. anderer gültiger Brokerkurs
3. externer Marktdatenanbieter
4. Google-Sheets-Import
5. eigener CSV-Import
6. manuelle Eingabe
7. Legacy-Kurs

Innerhalb derselben Quellqualität gewinnt der neuere Zeitpunkt. Ein als `stale` markierter IBKR-Kurs verdrängt keine nicht veraltete Rückfallquelle. Nur wenn keine nicht veraltete Quelle existiert, darf die beste veraltete Beobachtung sichtbar eingeschränkt verwendet werden. Demo- oder fehlende Kurse werden nie als Ersatz gewählt.

`positions.current_price_native` in `instrument_currency`, `current_price_source`, `current_price_as_of` und `current_price_status` bleiben als synchronisierte Kompatibilitätsfelder für bestehende Imports und Anwendungsteile bestehen. Der Übergangstrigger historisiert echte Änderungen additiv. Ein gespeicherter Legacy-Marktwert ersetzt keinen fehlenden aktuellen Kurs.

Der spätere IBKR-Adapter schreibt neue Beobachtungen mit `source_type = 'ibkr'`. Dadurch korrigiert ein gültiger IBKR-Wert abweichende niedrigere Quellen in allen Berechnungen, ohne deren Herkunft zu vernichten. Ein Google-Sheets-Adapter verwendet `google_sheets`; der bestehende CSV-Pfad wird als `custom_csv` erfasst.

Twelve Data ist als erster optionaler `market_data_provider` implementiert. Der Schlüssel `TWELVE_DATA_API_KEY` wird ausschließlich in einem serverseitigen Adapter gelesen, im `Authorization`-Header übertragen und weder im Browser noch in URLs, Datenbankzeilen oder Logs abgelegt. Fehlt der Schlüssel, ist der Anbieter deaktiviert. Zeitüberschreitungen, Abfragelimits, fehlende Abdeckung und ungültige Antworten lassen das Speichern der Position nicht scheitern; der vorhandene Google-Sheets-/CSV-/manuelle Rückfallkurs bleibt erhalten.

## Eindeutige Instrumentzuordnung

Ein nackter Ticker reicht nicht als dauerhafte globale Instrumentidentität. Für die einfache Erfassung fragt DepotArchitect zunächst mit Ticker und Handelswährung die von Twelve Data gewählte kanonische Hauptnotierung ab. Unternehmensname, Börse, vierstelliger ISO-10383-MIC, Kursstatus und Zeitstempel werden vor dem Speichern sichtbar bestätigt. `position_market_data_mappings` bindet die Position anschließend dauerhaft an Anbieter, Anbieter-Symbol, Handelswährung und MIC. Ein Benutzer kann den MIC zur Korrektur ausdrücklich vorgeben; dann muss die Antwort exakt diesem Listing entsprechen. Jede Quote wird mindestens gegen Symbol und Währung, bei vorgegebenem MIC zusätzlich gegen den MIC geprüft.

Der Zwischenablauf ähnelt damit einer Tabellen-Kursfunktion: Ticker und Währung eingeben, „Unternehmen & Kurs suchen“ wählen und die aufgelöste Hauptnotierung prüfen. Er ersetzt keine vertraglich abgesicherte Broker-Marktdatenversorgung. Sobald valide IBKR-Daten verfügbar sind, haben sie in der Quellenauflösung höhere Priorität als Twelve Data, Google Sheets, CSV und manuelle Kurse.

Der Adapter verwendet derzeit den regulären Schluss-/letzten Kurs aus dem Quote-Endpunkt. Solange die konkrete Datenberechtigung keine belastbare Echtzeitklassifizierung liefert, wird ein Kurs bei geöffnetem Markt vorsichtig als `delayed`, bei geschlossenem Markt als `end_of_day` und nach sieben Tagen als `stale` markiert. Er wird nicht ungeprüft als `live` bezeichnet.

Vor einem produktiven Einsatz sind Abdeckung, Börsenberechtigungen, zulässige Anzeige und Weitergabe, Aktualität, API-Limits, Vertragsbedingungen und Kosten des gewählten Twelve-Data-Tarifs verbindlich zu prüfen. Die Anwendung bleibt auch danach anbieterneutral; Twelve Data kann durch einen anderen Adapter ersetzt oder ergänzt werden.

## Wechselkurs

Die kanonische Quote ist der Wert einer Einheit der Ausgangs- beziehungsweise Instrumentwährung in der Depotbasiswährung. Umrechnung erfolgt durch Multiplikation.

`portfolio_fx_rates` historisiert Ausgangswährung, Zielwährung, Quote, Quellentyp (`manual`, `broker`, `market_data_provider`), konkrete Quellenbezeichnung, Datenzeitpunkt und Datenstatus. Für identische Währungen gilt mathematisch Faktor 1; dafür ist kein Marktdatenabruf erforderlich. Für Fremdwährungen gibt es keinen stillen Faktor 1.

Ein aktueller positionsbezogener FX-Wert bleibt aus Kompatibilitätsgründen möglich. Bei mehreren realen Quellen verwendet der Adapter den neueren verwertbaren Wert. Automatische Anbieteradapter müssen später auf dieselbe kanonische Quote normalisieren.

## Trading-Stopp

`stop_price_native` ist der Trading-Stopp in Instrumentwährung. `stop_updated_at` und `stop_comment` machen die manuelle Pflege nachvollziehbar. `stop_price` bleibt ein synchronisierter Kompatibilitätsspiegel.

Ein Long-Stopp über dem aktuellen Kurs beziehungsweise ein Short-Stopp unter dem aktuellen Kurs wird nicht korrigiert. Die Berechnung markiert ihn als widersprüchlich. Fehlt der Stopp, bleibt die Position sichtbar und das Gesamtrisiko unvollständig.

## Margin

Direkte und abgeleitete Marginwerte bleiben unterscheidbar:

- direkte Brokerangabe: `broker`
- manuell bestätigter Direktwert: `manual_direct`
- importierter Direktwert: `imported_direct`
- definierte Quotenschätzung: `estimated`
- fehlend: `missing`
- nicht vertrauenswürdiger Altwert: `legacy_untrusted`

Zusätzlich dokumentieren `margin_currency`, `margin_as_of`, `margin_calculation_type` und `margin_confidence` Einheit, Zeitpunkt, Berechnungsart und Vertrauensstatus. `legacy_untrusted` fließt nicht in belastbare Marginaggregate ein. Für Cashkonten ist Margin fachlich nicht zutreffend.

## Anbieter-neutrale Grenze

Die Berechnungsengine kennt keinen konkreten Broker oder Marktdatenanbieter. Spätere Adapter dürfen Daten aus `manual`, `broker` oder `market_data_provider` liefern, müssen aber vor Speicherung auf die kanonischen Felder, Währungen, Quotes und Statuswerte normalisieren.

Nicht Bestandteil dieses Schritts sind Streaming, WebSockets, automatische Broker-Synchronisation, automatische Orderausführung und die eigenständige Bestellung kostenpflichtiger Marktdaten. Der Twelve-Data-Adapter wird erst durch einen bewusst gesetzten serverseitigen Schlüssel aktiv und ist keine ungeprüfte öffentliche Browser-API.
