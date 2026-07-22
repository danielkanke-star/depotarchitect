# Zentraler Formelkatalog

Status: Meilenstein 2B. Fachliche Quelle ist die pure TypeScript-Bibliothek unter `src/lib/calculations/`. Geldwerte werden mit `decimal.js` ohne Zwischenrundung berechnet. Gerundet wird erst in Anzeige oder Export.

## Kanonische Einheiten und Richtungen

- `fx_to_base` ist der Wert einer Einheit der Instrumentwährung in der Depotbasiswährung. Umrechnung erfolgt immer durch Multiplikation: `Betrag Instrumentwährung × fx_to_base`.
- `direction_factor` ist `1` für Long, Long Call und Long Put sowie `-1` für Short, Short Call und Short Put.
- `quantity_abs` ist der Absolutbetrag der Menge.
- `multiplier` ist bei Aktien üblicherweise `1`, bei Optionen der Kontraktmultiplikator, typischerweise `100`.
- NetLiq, aktuelle Kurse und Wechselkurse bleiben Quelldaten. NetLiq wird nicht aus Positionen rekonstruiert.

## Positionskennzahlen

| Fachlich | Technisch | Ausgangsdaten | Formel / Einheit | Long, Short, Option, FX | Fehlende Daten / Status | Spätere Quelle |
|---|---|---|---|---|---|---|
| Positionswert Instrumentwährung | `positionValueInstrument` | Menge, Multiplikator, aktueller Kurs | `quantity_abs × multiplier × current_price`; Instrumentwährung | Immer positiv; Option nutzt Kontraktmultiplikator | fehlender Wert `incomplete`, ungültiger Wert `invalid` | Brokerposition + Kursfeed |
| Positionswert Basiswährung | `positionValueBase` | Positionswert Instrumentwährung, `fx_to_base` | `positionValueInstrument × fx_to_base`; Basiswährung | Long/Short gleich positiv; FX immer Multiplikation | Legacy-Marktwert vorübergehend `source_fallback`, sonst `incomplete` | Broker/Kurs-/FX-Feed |
| Vorzeichenbehaftetes Engagement | `signedExposure` | Positionswert Basiswährung, Richtung | `direction_factor × positionValueBase`; Basiswährung | Short negativ, Long positiv | Status folgt Positionswert | Brokerposition |
| Unrealisiertes Ergebnis | `unrealizedPnl` | Richtung, Einstand, Kurs, Menge, Multiplikator, FX | `direction_factor × (current_price − entry_price) × quantity_abs × multiplier × fx_to_base`; Basiswährung | Fallender Kurs ist für Short positiv; Optionen nutzen Multiplikator | kein Legacy-Fallback; fehlend `incomplete` | Broker/Kursfeed |
| Anteil NetLiq | `netLiquidityShare` | Positionswert Basiswährung, NetLiq | `positionValueBase ÷ net_liquidity`; Quote | Kann summiert über 100 % liegen | NetLiq fehlt: `incomplete`; NetLiq ≤ 0: `invalid` | Broker-Kontosnapshot |
| Risiko bis Stopp | `stopRisk` | Richtung, Kurs, effektiver Stopp, Menge, Multiplikator, FX | Long: `(current − stop) × quantity_abs × multiplier × fx`; Short: `(stop − current) × …`; Basiswährung | Long-Stopp muss ≤ Kurs, Short-Stopp ≥ Kurs sein; Option nutzt Multiplikator | Stopp fehlt: `incomplete`; falsche Marktseite: `invalid`; niemals künstlich `0` | mentaler Stopp, später Brokerorder |
| Risiko / NetLiq | `riskToNetLiquidity` | Stopprisiko, NetLiq | `stopRisk ÷ net_liquidity`; Quote | richtungsneutral nach gültiger Stopprisikoformel | Status folgt Risiko/NetLiq | abgeleitet |
| Anteil am berechenbaren Gesamtrisiko | `riskShareOfCalculableTotal` | Positionsrisiko, Summe berechenbarer Risiken | `stopRisk ÷ totalCalculableStopRisk`; Quote | nur Positionen mit gültigem Risiko | fehlender/ungültiger Stopp bleibt unberechenbar; Gesamtrisiko 0 ist `invalid` | abgeleitet |
| Margin Requirement | `marginRequirement` | direkter Marginwert oder Positionswert + Margin-% | Priorität 1: direkter Wert; Priorität 2: `positionValueBase × marginPercent ÷ 100`; Basiswährung | Long/Short gleich nach jeweiligem absoluten Positionswert | Quelle `broker_or_imported`, `estimated` oder `missing` | Broker-Kontosnapshot |

## Portfoliokennzahlen

| Fachlich | Technisch | Formel / Einheit | Unvollständigkeit |
|---|---|---|---|
| Long-Exposure | `longExposure` | Summe Long-Positionswerte; Basiswährung | verfügbare Teilsumme mit Status `incomplete`/`invalid` |
| Short-Exposure | `shortExposure` | Summe absoluter Short-Positionswerte; Basiswährung | wie Long-Exposure |
| Brutto-Exposure | `grossExposure` | `longExposure + shortExposure`; Basiswährung | Status der Eingangssummen |
| Netto-Exposure | `netExposure` | `longExposure − shortExposure`; Basiswährung | Status der Eingangssummen |
| Depot-Hebel | `leverage` | `grossExposure ÷ net_liquidity`; Faktor | NetLiq fehlt/ungültig oder Exposure unvollständig wird sichtbar |
| Gesamtmargin | `totalMarginRequirement` | Summe direkter und geschätzter Marginwerte; Basiswährung | Teilsumme plus Anzahl fehlender Positionen |
| Margin-Auslastung | `marginUtilization` | `totalMarginRequirement ÷ net_liquidity`; Quote | Status folgt Gesamtmargin und NetLiq |
| Berechenbares Stopprisiko | `totalCalculableStopRisk` | Summe gültiger Stopprisiken; Basiswährung | Teilsumme bleibt sichtbar, zugleich `riskIsComplete=false` |
| Risikoabdeckung | `riskValueCoverage` | Marktwert gültig risikoberechenbarer Positionen ÷ gesamter berechenbarer Marktwert; Quote | fehlende Marktwerte werden als unvollständig ausgewiesen |
| Kategoriengewicht | `categories` | Marktwert je Kategorie; Anteil NetLiq; Anteil Brutto-Exposure | keine Grenzwerte oder Farben in 2B |
| Aktive Teilpositionen | `activePositionRowCount` | Anzahl aktiver Datensätze | gleiche Ticker werden separat gezählt |
| Unterschiedliche Instrumente | `distinctInstrumentCount` | Anzahl normalisierter eindeutiger Ticker | unabhängig von Teilpositionen |

## Status und Quellenrangfolge

- `calculated`: vollständig aus Quelldaten berechnet.
- `source_fallback`: direkter Quellenwert beziehungsweise vorübergehender Legacy-Fallback wurde verwendet.
- `incomplete`: notwendige Eingabe fehlt; ein vorhandener Teilwert kann als unvollständige Summe sichtbar bleiben.
- `invalid`: Eingabe oder fachliche Beziehung ist ungültig.

Margin verwendet strikt `broker_or_imported` vor `estimated` vor `missing`. Ein geschätzter Wert wird nie als Brokerwert bezeichnet.

## Legacy-/Cachefelder

`positions.market_value`, `positions.risk_amount`, `portfolios.margin_used_pct` und `portfolios.risk_budget_used_pct` bleiben zunächst schema- und datenkompatibel. Die ersten drei können später als explizit versionierte Cachefelder neu modelliert oder entfernt werden. `risk_budget_used_pct` wird nicht verwendet, bis Meilenstein 2D eine fachlich abgenommene Budgetdefinition liefert. Keine destruktive Bereinigung erfolgt in 2B.
