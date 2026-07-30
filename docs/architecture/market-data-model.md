# Reale Markt-, FX-, Stopp- und Margindaten

Status: technische und fachliche Grundlage aus Meilenstein 2B.4, in 2B.5 als interne Infrastruktur fortgeführt und um eine additive Kursquellenauflösung ergänzt. Es wird noch keine automatische Broker- oder Marktdatenanbindung eingeführt.

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

Der spätere IBKR-Adapter schreibt neue Beobachtungen mit `source_type = 'ibkr'`. Dadurch korrigiert ein gültiger IBKR-Wert abweichende niedrigere Quellen in allen Berechnungen, ohne deren Herkunft zu vernichten. Ein Google-Sheets-Adapter verwendet `google_sheets`; der bestehende CSV-Pfad wird als `custom_csv` erfasst. Ein konkreter externer Marktdatenanbieter wird erst nach Klärung von Lizenz, Abdeckung, Aktualität und Zugangsdaten angebunden.

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

Nicht Bestandteil dieses Schritts sind Streaming, WebSockets, automatische Broker-Synchronisation, automatische Orderausführung, Bestellung kostenpflichtiger Marktdaten und eine ungeprüfte öffentliche Kurs-API als Production-Abhängigkeit.
