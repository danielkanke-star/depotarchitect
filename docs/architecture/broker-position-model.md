# Zielbild für Brokerpositionen und DepotArchitect-Teilpositionen

Status: verbindliches fachliches Zielbild für die Abgrenzung von Depot, Brokerkonto, Brokerposition und DepotArchitect-Teilposition. Meilenstein 2B implementiert nur das additive Cashquellenmodell und vorbereitende Kurs-/FX-Metadaten. Brokerkonten, Synchronisation und Zuordnungsregeln werden **nicht** implementiert. Die Berechnungsengine arbeitet bereits auf einzelnen DepotArchitect-Teilpositionszeilen und setzt nie voraus, dass ein Ticker nur einmal vorkommt.

Ergänzende Spezifikationen:

- [Mehrdepot-Modell](multi-portfolio-model.md)
- [Positions- und Transaktionsmodell](position-transaction-model.md)
- [Meilenstein-2C-Anforderungen](../product/milestone-2c-requirements.md)

## Zielstruktur

```text
DepotArchitect-Depot
├── Cash
│   ├── EUR
│   ├── USD
│   └── CHF
├── Aktien
│   └── Instrument
│       └── DepotArchitect-Teilpositionen
├── ETFs
├── Optionen
│   └── Basiswert
│       └── konkreter Vertrag
│           └── Teilpositionen
├── Optionsscheine
└── Knock-out-Produkte
```

Beispiel:

```text
GOOG – Gesamtbestand 7 Aktien
├── Kerninvestment – 3 Aktien
└── Momentumtrade – 4 Aktien
```

Kategorie und Strategie gehören an die Teilposition, nicht dauerhaft an Ticker oder Gesamtbestand. Jedes Depot besitzt eine unveränderliche `portfolio_id` und eine eigene feste Basiswährung. Die Baumansicht selbst folgt erst in Meilenstein 2C.

## Abgrenzung zu Meilenstein 2A

Die aktuelle Tabelle `positions` enthält manuell gepflegte oder aus einer benutzerdefinierten CSV importierte Positionen. Diese Datensätze sind keine bestätigten Brokerpositionen, keine aktiven Brokerorders und keine automatisch synchronisierten Brokerbestände. Die benutzerdefinierte CSV ist lediglich ein optionaler manueller Fallback; die spätere primäre Datenquelle soll eine gesonderte Anbindung an IBKR beziehungsweise IBKR-basierte Broker sein.

## Geplante Ebenen

### Brokerkonto

Ein Brokerkonto bildet ein konkretes technisches Konto beziehungsweise eine Datenquelle bei einem Anbieter wie IBKR, Estably oder CapTrader ab. Es trägt die brokerseitige Kontoidentität und den Synchronisationsstatus, aber keine DepotArchitect-Kategorie. Vollständige Kontonummern dürfen nicht offen angezeigt werden.

Ein DepotArchitect-Depot ist davon getrennt: ein vom Benutzer benannter Auswertungsbereich mit Basiswährung, Kontotyp, Positionen, Cash, NetLiq, Kategorien, Strategien, Historie und Notizen. In der ersten technischen Version darf ein Depot genau einem Brokerkonto entsprechen. Das Modell muss später mehrere Brokerverbindungen pro Depot zulassen können, ohne diese Kardinalität bereits festzuschreiben.

### Brokerposition

Eine Brokerposition ist der vom Broker zusammengefasste Gesamtbestand eines Instruments. Ein Broker könnte beispielsweise für GOOG einen Gesamtbestand von sieben Aktien liefern. Dieser Gesamtbestand ist die brokerseitige Bestandswahrheit, aber noch keine fachliche Aufteilung innerhalb von DepotArchitect.

Die Produkttypen sind erweiterbar auf `stock`, `etf`, `option`, `warrant`, `knock_out`, `cash` und `other`. Optionsscheine benötigen später mindestens ISIN, Emittent, Basiswert, Bezugsverhältnis, Strike und Verfall. Knock-outs benötigen mindestens ISIN, Emittent, Basiswert, Richtung, Knock-out-Schwelle und Bezugsverhältnis. Diese Produktdaten und Spezialberechnungen sind noch nicht umgesetzt.

### DepotArchitect-Teilposition

Eine DepotArchitect-Teilposition teilt eine Brokerposition fachlich auf. Die sieben GOOG-Aktien könnten beispielsweise aus drei Aktien „Kerninvestment“ und vier Aktien „Momentumtrade“ bestehen. Kategorie, Strategie, Kommentar und ein manueller beziehungsweise mentaler Stopp gehören an diese Teilposition.

Eine Kategorie darf nicht am Ticker hängen. Eine Brokerposition kann gleichzeitig mehrere DepotArchitect-Teilpositionen und damit mehrere Kategorien enthalten. Brokerdaten dürfen manuelle DepotArchitect-Anreicherungen nicht überschreiben.

Die Teilposition besitzt eine eigene Transaktionshistorie aus Einstieg beziehungsweise Käufen und null bis mehreren Verkäufen. Offene Menge und Status werden daraus abgeleitet. Ein Verkauf über die offene Menge ist unzulässig. Geschlossene Teilpositionen bleiben archiviert und werden bei einem späteren Neukauf desselben Instruments nicht überschrieben.

### Brokerorder

Eine Brokerorder bildet eine tatsächlich beim Broker liegende Order ab, zum Beispiel Stop, Stop-Limit oder Trailing-Stop. Ihr Status und ihre Menge stammen aus der Brokeranbindung und müssen unabhängig von manuellen DepotArchitect-Grenzen geführt werden.

### Orderzuordnung

Eine Orderzuordnung verbindet eine Brokerorder mit einer bestimmten DepotArchitect-Teilposition oder einer Teilmenge davon. Eine einzelne Brokerorder kann eine Teilposition vollständig oder teilweise absichern. Die fachlichen Regeln für mehrere Orders, Teilmengen und konkurrierende Stopps werden erst in einem späteren Meilenstein festgelegt.

## Bestandsänderungen und Abstimmung

- Eine Positionserhöhung darf nicht automatisch einer vorhandenen Kategorie oder Teilposition zugeordnet werden.
- Eine Positionsreduzierung darf nicht automatisch einer beliebigen Teilposition entnommen werden.
- Nicht eindeutig zuordenbare Änderungen benötigen einen eigenen Abstimmungszustand und eine bewusste Benutzerentscheidung.
- Broker-Synchronisation aktualisiert den Brokerbestand und Brokerorders, nicht die manuell gepflegte Strategie, Kategorie, Kommentare oder mentalen Stopps.
- Eine spätere Abstimmung muss Mengenabweichungen sichtbar machen, ohne eine fachliche Zuordnung zu erfinden.
- Cashpositionen des Brokers werden nicht als normale Wertpapierpositionen in DepotArchitect angelegt. Sie fließen in das getrennte Cashmodell je Währung.
- Instrumentwährung, Cashwährung und Depotbasiswährung bleiben getrennt. Ein Instrumentkauf beweist keinen Währungstausch.

## Stoppthematik

**Broker-Stopp:** Eine tatsächliche aktive Brokerorder. Status, Menge und Ordertyp werden brokerseitig bestätigt.

**Manueller beziehungsweise mentaler Stopp:** Eine persönliche, in DepotArchitect eingetragene Grenze. Sie muss nicht als Order beim Broker vorliegen.

**Stoppräferenz:** Für einen späteren Meilenstein ist eine Auswahl `automatic`, `broker` oder `manual` vorgesehen. `automatic` ist noch nicht fachlich definiert. Insbesondere wird in diesem Entwurf keine Regel erfunden, welcher von mehreren Brokerstopps automatisch maßgeblich ist. Brokerstopps und mentale Stopps bleiben getrennte Sachverhalte.

## Noch nicht implementiert

Dieser Entwurf führt weder neue Datenbanktabellen noch eine Broker-API, Ordersynchronisierung, automatische Tranchenzuordnung oder Stoppauswahl ein. Vor einer Implementierung sind Identitäten, Reconciliation, Historisierung, Fehlerzustände, RLS, Auditierung und Löschregeln separat zu spezifizieren und zu testen.

Ein späterer Estably-/IBKR-Jahresbericht kann eine historische Importquelle für Transaktionen, Stichtagspositionen, Gebühren und Ergebnisse werden. Aktuelle offene Orders und Stoporders benötigen voraussichtlich eine getrennte, zeitnahe Brokerquelle.

Aktuelle Wertpapierkurse und Wechselkurse werden im späteren Broker-/Marktdatenmeilenstein automatisch bezogen. Meilenstein 2B.1 speichert nur Wert, Quelle, Zeitpunkt und Status und implementiert weder IBKR/TWS/Client-Portal-API noch WebSocket, Marktdatenabonnements oder automatische Abfragen.

## Muss-Anforderungen

- Brokerkonto und DepotArchitect-Depot fachlich und technisch getrennt halten.
- Brokerposition als externe Bestandswahrheit von Teilpositionen und Benutzeranreicherungen trennen.
- Jede Broker- und Teilposition eindeutig einem eigenen Depot zuordnen.
- Broker-Synchronisation darf Kategorie, Strategie, Kommentare, Journal und mentale Stopps nicht überschreiben.
- Nicht eindeutig zuordenbare Bestandsänderungen benötigen einen sichtbaren Abstimmungszustand.
- Vollständige Brokerkontonummern nicht offen anzeigen.
- Cash aus Brokerquellen in das Cashmodell statt in normale Wertpapierpositionen überführen.

## Soll-Anforderungen

- Brokeridentitäten maskiert anzeigen.
- Reconciliation mit Mengenabweichungen und Zeitstempel nachvollziehbar machen.
- Brokerorder, Teilposition und abgesicherte Teilmenge später explizit zuordnen.
- Unterschiedliche Quellen für aktuelle Orders und historische Berichte unterstützen.

## Nicht-Ziele

- keine Brokeranbindung oder Synchronisation in 2B.3
- keine automatische Zuordnung von Käufen oder Reduktionen zu Teilpositionen
- keine automatische Auswahl eines maßgeblichen Stopps
- keine Orderausführung
- keine automatische Kurs- oder FX-Abfrage
- keine Baumansicht in diesem Dokumentationsauftrag

## Abnahmekriterien für die spätere Umsetzung

- Ein Broker-Gesamtbestand kann auf mehrere Teilpositionen mit verschiedenen Kategorien aufgeteilt werden.
- Eine Brokeraktualisierung verändert keine manuellen Anreicherungen.
- Eine unbekannte Bestandserhöhung oder -reduzierung wird nicht still zugeordnet.
- Broker-Cash erscheint nicht doppelt als Position und Cashsaldo.
- Daten eines Brokerkontos können nie in ein anderes Depot oder zu einem anderen Benutzer gelangen.
- Geschlossene Teilpositionen und ihre Notizen bleiben trotz neuer Brokerposition desselben Instruments erhalten.

## Offene fachliche Entscheidungen

- Langfristige Kardinalität zwischen Depot und Brokerkonto.
- Stabiler Instrument- und Vertragsidentifikator je Produkttyp und Broker.
- Reconciliation bei Splits, Ausübungen, Zuteilungen und Corporate Actions.
- Zuordnung von Brokertransaktionen zu Teilpositionen und Verkaufslosen.
- Regeln für mehrere Brokerstopps und Teilmengen.
- Konfliktauflösung zwischen Live-Brokerstand, Import und manuellen Korrekturen.
