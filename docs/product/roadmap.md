# Produkt- und Architekturroadmap

- **Meilenstein 2A – Brokerneutraler benutzerdefinierter CSV-Import:** abgeschlossen und gemergt.
- **Meilenstein 2B – Zentrale Berechnungsmaschine und funktionales Cockpit:** dieser Arbeitsstand.
- **Meilenstein 2C – Brokerpositionen, DepotArchitect-Teilpositionen, Brokerorders und Stopzuordnungen:** als Nächstes; keine Brokerintegration in 2B.
- **Meilenstein 2D – Risikodarstellung, Farblogik, Warnungen und Risikobudget:** erst nach fachlicher Definition.
- **Meilenstein 2E – Historische Transaktionen, Performance und PDF-Historienimport:** geplant. Ein Estably-/IBKR-Jahresbericht als PDF kann später Transaktionen, Stichtagspositionen, Optionen, Gebühren, Dividenden, Zinsen, Kapitalmaßnahmen sowie realisierte und unrealisierte Ergebnisse liefern. PDF-Upload, Parser, OCR und Historienrekonstruktion sind nicht Teil von 2B.
- **Meilenstein 2F – Automatische IBKR-/Introducing-Broker-Datenquellen:** geplant für aktuelle Positionen, Kontowerte, Trades und Orders.

Aktuelle offene Orders und Stoporders benötigen voraussichtlich eine von historischen Jahresberichten getrennte Brokerquelle. Es werden keine echten PDFs, Kontonummern oder Depotdaten im Repository abgelegt.

## Zukünftige Hauptnavigation

- Cockpit
- Depot
- Risiko
- Historie
- Einstellungen

Unter **Depot** sind Depotübersicht, Positionen, Cash, Datenquellen und Import sowie Brokerkonten vorgesehen. Der Import ist eine Hilfsfunktion des Depots, kein eigenständiger Produktbereich. Die vorhandene Route `/import` bleibt bis zum Layout-Meilenstein bestehen; Meilenstein 2B.1 baut die Navigation nicht umfassend um.
