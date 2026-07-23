# Zentraler Formelkatalog

Status: Berechnungsstand Meilenstein 2B.2. Fachliche Quelle ist die pure TypeScript-Bibliothek unter `src/lib/calculations/`. Geldwerte werden mit `decimal.js` ohne Zwischenrundung berechnet; gerundet wird erst in Anzeige oder Export.

## Kanonische Definitionen

- `current_fx_to_base` ist der aktuelle Wert **einer Einheit der Instrumentwährung in der Depotbasiswährung**. Umrechnung erfolgt immer durch Multiplikation.
- `entry_fx_to_base` ist ein historischer Referenzkurs beim Positionsaufbau. Bei Marginfinanzierung ist er nicht zwingend ein ausgeführter Währungstausch.
- `margin_rate` ist ausschließlich eine Dezimalquote zwischen `0` und `1`: 25 % werden als `0.25` gespeichert.
- `direction_factor` ist `1` für Long, Long Call und Long Put sowie `-1` für Short, Short Call und Short Put.
- NetLiq, Cashsalden, aktuelle Kurse und aktuelle Wechselkurse sind voneinander getrennte Quelldaten. NetLiq wird nicht aus Cash und Positionen rekonstruiert.

Eine Ausgangsquote `1 EUR = 0,929275 CHF` wird im Quellenadapter für ein EUR-Depot und ein CHF-Instrument invertiert: `1 CHF = 1 / 0,929275 EUR`.

## Positionskennzahlen

| Fachlich | Technisch | Formel / Einheit | Hinweise |
|---|---|---|---|
| Positionswert Instrumentwährung | `positionValueInstrument` | `abs(quantity) × multiplier × current_price` | Cash-Positionszeilen sind Legacyfälle und keine Wertpapierpositionen. |
| Positionswert Basiswährung | `positionValueBase` | `positionValueInstrument × current_fx_to_base` | `current_fx_to_base` ist maßgeblich; `fx_to_base` nur Legacy-Fallback beim Lesen. |
| Vorzeichenbehaftetes Engagement | `signedExposure` | `direction_factor × positionValueBase` | Short negativ, Long positiv. |
| Kurs-G&V zum aktuellen FX | `unrealizedPnl` | `direction_factor × (current_price − entry_price) × abs(quantity) × multiplier × current_fx_to_base` | Reiner Kursgewinn beziehungsweise Kursverlust, zum aktuellen FX in die Basiswährung umgerechnet. Kein vollständiger Währungs- oder Gesamtgewinn. |
| Stopprisiko Instrumentwährung | `stopRiskInstrument` | Long: `(current − stop) × abs(quantity) × multiplier`; Short umgekehrt | Keine künstliche Null bei fehlendem Stopp. |
| Stopprisiko Basiswährung | `stopRisk` | `stopRiskInstrument × current_fx_to_base` | Aktueller FX ist maßgeblich. |
| Anteil NetLiq | `netLiquidityShare` | `positionValueBase ÷ net_liquidity` | NetLiq ≤ 0 ist ungültig. |
| Margin Requirement | `marginRequirement` | direkter bestätigter Wert, sonst `positionValueBase × margin_rate` | Herkunft: `broker`, `imported_direct`, `manual_direct`, `estimated`, `missing`, `legacy_untrusted`. |

Ein manueller direkter Wert wird nie als Brokerwert bezeichnet. Ein bestätigter direkter Wert von `0` ist zulässig. Ein alter, unbestätigter Null-Platzhalter wird als `legacy_untrusted` und damit fehlend behandelt.

Ein späterer Ausbau trennt Kurs-G&V in Instrumentwährung, Kurs-G&V in Basiswährung zum aktuellen FX, den Referenzwert beim Einstieg mit `entry_fx_to_base`, den referenzierten FX-Effekt, die gesamte Wertveränderung der Wertpapierposition und die FX-Wirkung der Währungs-Cashbestände. Eine komplexe Konten-P&L- oder Finanzierungsrechnung ist noch nicht Bestandteil der Berechnungsmaschine.

## Portfolio- und Cashkennzahlen

| Fachlich | Technisch | Formel / Einheit |
|---|---|---|
| Long-Marktwert | `longExposure` | Summe der Long-Wertpapiermarktwerte |
| Short-Marktwert | `shortExposure` | Summe der absoluten Short-Wertpapiermarktwerte |
| Brutto-Marktwert | `grossExposure` | `longExposure + shortExposure` |
| Netto-Marktwert | `netExposure` | `longExposure − shortExposure` |
| **NetLiq-Hebel** | `netLiquidityLeverage` | **Brutto-Marktwert der Wertpapierpositionen ÷ Nettoliquidität** |
| Gesamtmargin | `totalMarginRequirement` | Summe bestätigter direkter und geschätzter Marginwerte |
| Margin-Auslastung | `marginUtilization` | `totalMarginRequirement ÷ net_liquidity` |
| Cash je Währung | `balances` | vorzeichenbehafteter nativer Saldo |
| Cashwert Basiswährung | `valueBase` | `balance_native × current_fx_to_base`; Basiswährung verwendet FX `1` |
| Gesamtcash | `totalCashBase` | Summe der vollständigen Cashwerte in Basiswährung |

Der NetLiq-Hebel ist derzeit marktwertbasiert. Optionen werden noch nicht delta- oder nominalwertbereinigt. Cash geht weder in Long-, Short-, Brutto- oder Netto-Marktwert noch in NetLiq-Hebel oder Wertpapier-Kategoriengewichtung ein. Negative Cashsalden wirken bereits über das separate Quelldatum Nettoliquidität.

Cashberechnungen weisen positive, negative und Nullsalden sowie die FX-Vollständigkeit aus. Ein fehlender Fremdwährungs-FX macht den Gesamtcash sichtbar unvollständig.

Übergangsregel in Meilenstein 2B.2: Die Basiswährung darf nur geändert werden, solange weder Positionen noch Währungs-Cashbestände vorhanden sind. Verbindliches Zielbild ab 2C: Die Basiswährung wird bei Depoterstellung festgelegt und ist danach nicht über ein normales Eingabefeld veränderbar. Jede spätere Änderung benötigt einen kontrollierten Migrations- und Neubewertungsvorgang für Positionen, Cash, FX, Margin und Risiko.

## Status und Marktmetadaten

- `calculated`: vollständig aus Quelldaten berechnet.
- `source_fallback`: bestätigter direkter Quellenwert oder vorübergehender Legacy-Marktwert wurde verwendet.
- `incomplete`: notwendige Eingabe fehlt.
- `invalid`: Eingabe oder fachliche Beziehung ist ungültig.

Aktuelle Kurse und Wechselkurse führen jeweils Wert, Quelle, Zeitpunkt und Status. Status: `live`, `delayed`, `closing`, `imported`, `manual`, `stale`. Alte Werte dürfen nicht ohne `stale`-Hinweis als aktuell erscheinen. Automatische Kurs- und FX-Bezüge folgen erst im Broker-/Marktdatenmeilenstein.

## Legacyfelder

- `portfolios.cash_balance`: nur Rückwärtskompatibilität; fachliche Cashquelle ist `portfolio_cash_balances`.
- `positions.margin_percent`: nur Rückwärtskompatibilität; neue Anwendungsteile schreiben `margin_rate`.
- `positions.fx_to_base`: nur Rückwärtskompatibilität; aktuelle Berechnungen verwenden `current_fx_to_base`.
- `positions.market_value` und `positions.risk_amount`: Import-/Kompatibilitätscaches; die Berechnungsengine bleibt maßgeblich.
- `portfolios.margin_used_pct` und `portfolios.risk_budget_used_pct`: Legacyfelder; letzteres bleibt bis zur fachlichen Definition in Meilenstein 2D ungenutzt.
