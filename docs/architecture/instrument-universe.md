# Instrumentenuniversum, Listings und Kurscache

Stand: Meilenstein 2B, Draft-PR #3. Diese Architektur ist additiv vorbereitet. Die neue Migration wird nicht gegen das derzeit gemeinsam von Preview und Production verwendete Supabase-Projekt angewendet.

## Fachliche Trennung

- `market_instruments` beschreibt das Wertpapier beziehungsweise den Kontrakt.
- `market_listings` beschreibt eine konkrete handelbare Notierung als vollständiges Tupel aus Anbieter-Symbol, MIC und Handelswährung.
- `market_listing_provider_mappings` ordnet die konkrete Notierung einem Provider zu.
- `user_instrument_universe` liegt oberhalb einzelner Depots und Positionen. Ein Instrument kann unabhängig von einer Position beobachtet werden; mehrere Teilpositionen und Depots desselben Benutzers verwenden dieselbe Notierung.
- `positions.listing_id` verbindet eine Position mit der bestätigten Notierung. Kategorie und Strategie bleiben an der Teilposition.
- `market_listing_quotes` speichert je Benutzer, Notierung und Quelle ausschließlich den neuesten Kurs. Es entsteht keine unbeschränkte stündliche Kurshistorie.
- `market_fx_quotes` dedupliziert den neuesten FX-Wert je Benutzer, Währungspaar und Quelle über Depots hinweg. Identische Währungen benötigen keinen Abruf und verwenden mathematisch 1.

Das Modell ist vorläufig benutzerbezogen. Damit kann kein Benutzer Stammdaten oder Kurse eines anderen Benutzers beeinflussen. Eine spätere globale kanonische Instrumentenschicht darf nur über eine vertrauenswürdige Ingestion mit stabilen Kennungen gepflegt werden.

## Identität und Standardnotierung

Ein Ticker ist keine stabile Wertpapieridentität. Solange Twelve Data Free Search keine verlässlich stabile ISIN/FIGI beziehungsweise Broker-ID liefert, werden verschiedene Listing-Tupel nicht automatisch zu einem gemeinsamen Wertpapier zusammengeführt. Ein automatischer Merge ist erst mit ISIN, FIGI oder verifizierten Brokerdaten erlaubt.

Die erste Suchauswahl folgt ausschließlich der Relevanzreihenfolge des Providers. DepotArchitect behauptet damit weder „Hauptbörse“ noch höchste Liquidität. Bis zu zwei weitere eindeutige Suchtreffer werden kompakt angeboten. Ein Wechsel übernimmt Symbol, MIC und Währung gemeinsam und wird serverseitig atomar an die Position gebunden.

## Quellenpriorität

Die Berechnungsengine bleibt providerneutral. Die fachliche Reihenfolge lautet:

1. IBKR
2. anderer Broker
3. Marktdatenanbieter, derzeit optional Twelve Data
4. Google Sheets
5. CSV
6. manuell

Ein frischer höher priorisierter Wert gewinnt. Ein Ausfall einer Quelle löscht keinen vorhandenen Rückfallwert. Kurs, Quelle, Datenzeitpunkt und Status werden gemeinsam angezeigt. `is_market_open` ist nur eine konservative Providerinformation und kein eigener Handelskalender.

## Abrufablauf

Discovery (`/symbol_search`) ist nur bei erstmaliger Anlage, bewusstem Listingwechsel oder Reparatur nötig. Normale Aktualisierungen verwenden direkt die gespeicherte Provider-Zuordnung und `/quote`.

Die Oberfläche zeigt den Cache sofort. Nur bei sichtbarer beziehungsweise fokussierter angemeldeter Anwendung wird in kurzen Aufrufen höchstens eine stale Notierung aktualisiert. Die Datenbank vergibt dafür eine kurze Lease, sodass parallele Tabs und Vercel Functions denselben Abruf nicht duplizieren. Externe HTTP-Aufrufe laufen außerhalb einer Datenbanktransaktion. Erfolg oder Fehler wird anschließend atomar abgeschlossen. Bei 429 gilt eine einstündige Sperre; andere vorübergehende Fehler erhalten eine konservative Sperre. Es gibt keinen aggressiven Sofort-Retry und keinen 24/7-Cron.

Aktive Positionen: Zielalter höchstens 60 Minuten während aktiver Nutzung. Bei vom Provider als geschlossen gemeldetem Markt wird der Cache konservativ bis zu 12 Stunden verwendet. Reine Watchlist-Einträge werden deutlich seltener beziehungsweise auf Anforderung aktualisiert.

## Migration

`20260808120000_instrument_universe_quote_cache.sql` ist rein additiv. Nur vollständig verifizierte alte `position_market_data_mappings` werden anhand des exakten Tupels zurückgefüllt. Ohne stabile Wertpapierkennung entsteht zunächst eine eigene Instrumentidentität je Listing. Mehrdeutige Altpositionen bleiben `needs_confirmation`; keine Altposition wird gelöscht.

Eine spätere IBKR-Anbindung darf bestehende Providerdaten korrigieren, Identitäten mit stabilen Brokerkennungen verifizieren und wegen ihrer höheren Priorität aktive Twelve-/Sheets-/CSV-/manuelle Werte überstimmen.

