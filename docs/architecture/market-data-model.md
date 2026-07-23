# Reale Markt-, FX-, Stopp- und Margindaten

Status: technische und fachliche Grundlage für Meilenstein 2B.4. Es wird keine automatische Broker- oder Marktdatenanbindung eingeführt.

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

Fachlich maßgeblich ist `positions.current_price_native` in `instrument_currency`.

Zu jedem Kurs gehören `current_price_source`, `current_price_as_of` und `current_price_status`. `positions.current_price` bleibt ein synchronisierter Kompatibilitätsspiegel für bestehende Imports und Anwendungsteile. Ein gespeicherter Legacy-Marktwert ersetzt keinen fehlenden aktuellen Kurs.

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

Nicht Bestandteil von 2B.4 sind Streaming, WebSockets, automatische Broker-Synchronisation, automatische Orderausführung, Bestellung kostenpflichtiger Marktdaten und eine ungeprüfte öffentliche Kurs-API als Production-Abhängigkeit.
