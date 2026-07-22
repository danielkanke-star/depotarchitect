# Zielbild für Brokerpositionen und DepotArchitect-Teilpositionen

Status: Architekturentwurf für Meilenstein 2C. Auch Meilenstein 2B implementiert die beschriebenen Tabellen, Synchronisationsprozesse und Zuordnungsregeln **nicht**. Die Berechnungsengine arbeitet bereits korrekt auf einzelnen DepotArchitect-Teilpositionszeilen und setzt nie voraus, dass ein Ticker nur einmal vorkommt.

## Abgrenzung zu Meilenstein 2A

Die aktuelle Tabelle `positions` enthält manuell gepflegte oder aus einer benutzerdefinierten CSV importierte Positionen. Diese Datensätze sind keine bestätigten Brokerpositionen, keine aktiven Brokerorders und keine automatisch synchronisierten Brokerbestände. Die benutzerdefinierte CSV ist lediglich ein optionaler manueller Fallback; die spätere primäre Datenquelle soll eine gesonderte Anbindung an IBKR beziehungsweise IBKR-basierte Broker sein.

## Geplante Ebenen

### Brokerkonto

Ein Brokerkonto bildet ein konkretes Konto bei einem Anbieter wie IBKR, Estably oder CapTrader ab. Es trägt die brokerseitige Kontoidentität und den Synchronisationsstatus, aber keine DepotArchitect-Kategorie.

### Brokerposition

Eine Brokerposition ist der vom Broker zusammengefasste Gesamtbestand eines Instruments. Ein Broker könnte beispielsweise für GOOG einen Gesamtbestand von sieben Aktien liefern. Dieser Gesamtbestand ist die brokerseitige Bestandswahrheit, aber noch keine fachliche Aufteilung innerhalb von DepotArchitect.

### DepotArchitect-Teilposition

Eine DepotArchitect-Teilposition teilt eine Brokerposition fachlich auf. Die sieben GOOG-Aktien könnten beispielsweise aus drei Aktien „Kerninvestment“ und vier Aktien „Momentumtrade“ bestehen. Kategorie, Strategie, Kommentar und ein manueller beziehungsweise mentaler Stopp gehören an diese Teilposition.

Eine Kategorie darf nicht am Ticker hängen. Eine Brokerposition kann gleichzeitig mehrere DepotArchitect-Teilpositionen und damit mehrere Kategorien enthalten. Brokerdaten dürfen manuelle DepotArchitect-Anreicherungen nicht überschreiben.

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

## Stoppthematik

**Broker-Stopp:** Eine tatsächliche aktive Brokerorder. Status, Menge und Ordertyp werden brokerseitig bestätigt.

**Manueller beziehungsweise mentaler Stopp:** Eine persönliche, in DepotArchitect eingetragene Grenze. Sie muss nicht als Order beim Broker vorliegen.

**Stoppräferenz:** Für einen späteren Meilenstein ist eine Auswahl `automatic`, `broker` oder `manual` vorgesehen. `automatic` ist noch nicht fachlich definiert. Insbesondere wird in diesem Entwurf keine Regel erfunden, welcher von mehreren Brokerstopps automatisch maßgeblich ist. Brokerstopps und mentale Stopps bleiben getrennte Sachverhalte.

## Noch nicht implementiert

Dieser Entwurf führt weder neue Datenbanktabellen noch eine Broker-API, Ordersynchronisierung, automatische Tranchenzuordnung oder Stoppauswahl ein. Vor einer Implementierung sind Identitäten, Reconciliation, Historisierung, Fehlerzustände, RLS, Auditierung und Löschregeln separat zu spezifizieren und zu testen.

Ein späterer Estably-/IBKR-Jahresbericht kann eine historische Importquelle für Transaktionen, Stichtagspositionen, Gebühren und Ergebnisse werden. Aktuelle offene Orders und Stoporders benötigen voraussichtlich eine getrennte, zeitnahe Brokerquelle.
