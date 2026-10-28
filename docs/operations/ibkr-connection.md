# Lesende IBKR-Kursverbindung

Stand: 28. Oktober 2026. Beauftragt ist die Kursversorgung über das eigene IBKR-/Estably-Konto. Eine automatische Übernahme von Käufen, Verkäufen, Stopps, Mengen, Cash oder Nettoliquidität ist davon getrennt. Die Anwendung sendet keine Brokerorders und bestellt keine Marktdatenabonnements.

## Datenweg

1. Der offizielle IBKR Client Portal Gateway läuft auf dem eigenen Mac, Port 5055, HTTPS. Seine IP-Zulassung enthält ausschließlich 127.0.0.1. Browseranmeldung und Zwei-Faktor-Bestätigung finden beim Gateway/IBKR statt. Brokerpasswörter werden nicht in DepotArchitect gespeichert.
2. `scripts/ibkr-bridge.ts` liest über eine feste Endpunktliste Kontoverfügbarkeit, Vertragsdefinitionen, Depotbewertungen und Marktdaten. Die Liste erlaubt keine Order-, Geldtransfer-, Kontoänderungs- oder kostenpflichtigen regulatorischen Snapshot-Aufrufe. Fremde URLs und Weiterleitungen sind nicht erlaubt. Die Zertifikatsausnahme für das selbstsignierte Gateway-Zertifikat ist ausschließlich auf den lokalen HTTPS-Client begrenzt; Cloudverbindungen prüfen TLS regulär.
3. Der gekoppelte Dienst überträgt normalisierte Instrumentidentitäten und Kurse ausgehend über HTTPS an Supabase. Kontonummern, Positionsmengen, Einstandswerte und Zugangsdaten werden nicht übertragen. Es gibt keinen eingehenden Tunnel, keinen öffentlichen Broker-Endpunkt und keinen Supabase Secret/Service-Key im Dienst.
4. Angemeldete Server Actions lesen ausschließlich den eigenen Kurscache. Eindeutige Vertragszuordnungen erzeugen additive `position_price_observations` mit Quelle `ibkr`. Der Rechner nutzt denselben Cache; neue Aktienabfragen gehen als kurzlebige Aufgaben an den lokalen Dienst. Bei Ausfall bleibt der vorhandene Twelve-Data-Pfad verfügbar.

## Einrichten

Voraussetzung: Node.js und die Projektabhängigkeiten; eine vollständig eröffnete und finanzierte IBKR-Verbindung mit Zugang zum Client Portal API. Ein zusätzliches Datenabo ist keine automatische Voraussetzung für den Start: Der Dienst nutzt nur die vorhandenen Berechtigungen und kennzeichnet die tatsächlich gelieferten Daten.

Den Gateway ausschließlich aus der offiziellen Quelle laden:

<https://download2.interactivebrokers.com/portal/clientportal.gw.zip>

Das Archiv nach `.local/ibkr-gateway/` entpacken, sodass dort `bin/`, `build/`, `dist/` und `root/` liegen. Die Binärdateien sind nicht Bestandteil des Repositories oder des Vercel-Deployments. `npm run ibkr:gateway` setzt Port 5055 und die lokale IP-Zulassung. Es verwendet `IBKR_JAVA_HOME`, eine vorhandene gebündelte TWS-Java-Laufzeit oder ansonsten `java`.

```sh
npm run ibkr:gateway
```

Im normalen Browser <https://localhost:5055> öffnen und bei IBKR anmelden. Der Gateway verwendet ein selbstsigniertes Zertifikat; eine Browserwarnung muss der Benutzer selbst prüfen und bestätigen. Der integrierte Browser unterstützt diesen lokalen Login derzeit nicht. IBKR verlangt eine tägliche Neuanmeldung. Eine konkurrierende Brokersitzung wird nicht automatisch übernommen.

In DepotArchitect unter **Einstellungen → Interactive Brokers / Estably → Mac koppeln** einen einmaligen Code erzeugen. In einem zweiten Terminal:

```sh
npm run ibkr:pair
npm run ibkr:bridge
```

Der Kopplungscode gilt zehn Minuten und nur einmal. Das Gerätegeheimnis wird zufällig lokal erzeugt, unter `.local/ibkr-bridge/device.json` mit Modus 0600 gespeichert und läuft nach 30 Tagen ab. In der Datenbank liegen nur SHA-256-Hashes im unexponierten Schema `app_private`. **Verbindung trennen** widerruft das Gerät sofort. Die Konfiguration enthält lediglich den eigenen Gerätezugang und die ohnehin öffentliche Supabase-Konfiguration.

Mac, Gateway und Kursdienst müssen für neue Abrufe laufen. Für den täglichen Start nach der Einrichtung genügt `npm run ibkr:start`: Es startet fehlende Dienste im Hintergrund; das Terminal darf danach geschlossen werden. Der Kursdienst verhindert einen doppelten Start über eine private PID-Datei. Logs bleiben mit Modus 0600 unter `.local/ibkr-bridge/`. Es werden keine Login-Items, Systemdienste oder Cloudserver automatisch eingerichtet. `npm run ibkr:check` prüft die lokale Versorgung und schreibt einen privaten Diagnose-Snapshot unter `.local/ibkr-bridge/`; dieser enthält keine Kontonummern oder Mengen.

## Vertrags- und Preisregeln

- Aktien/ETFs werden anhand von Symbol, nativer Währung und bestätigtem Börsen-MIC zugeordnet. Widersprüchliche oder mehrdeutige Treffer werden nicht automatisch übernommen.
- Optionen werden zusätzlich anhand von Verfall, Strike, Call/Put und Multiplikator abgeglichen. Fehlende Portfolio-Vertragsfelder werden aus der OCC-Kennung des Brokers aufgelöst. Angepasste Optionswurzeln werden ohne gesonderte Prüfung nicht automatisch gleichgesetzt.
- Ein Vertrag versorgt alle entsprechenden DepotArchitect-Teilpositionen mit demselben Kurs. Broker-Gesamtmengen werden dabei nicht auf Kategorien oder Einstiegstage verteilt.
- IBKR-Kennzeichnung `R` bedeutet Echtzeitversorgung, `D` verzögerte Versorgung und `Z`/`Y` eingefrorene Kurse. Mit `C`/`H` markierte letzte Preise werden als Schlusskurse behandelt. Der angezeigte IBKR-Zeitpunkt ist die **Abrufzeit**, keine erfundene Ausführungszeit.
- Bei Optionen mit gültigem aktuellem Geld-/Briefpaar wird dessen Mittelwert verwendet und benannt. Andernfalls wird der verfügbare letzte Kurs verwendet. Fehlende Preise und negative Sentinelwerte erzeugen keine Nullkurse.
- Gibt der Kursendpunkt keine verwertbare Notierung zurück, kann eine vorhandene Depotbewertung dienen. Sie heißt ausdrücklich **IBKR-Depotbewertung · Kurszeit unbestätigt** und ist kein bestätigter Echtzeitkurs. Ein aktueller separater Kursanbieter hat gegenüber dieser Bewertungsreferenz Vorrang.
- Der Planungscache wird nach fünf Minuten als veraltet behandelt. Geschriebene aktuelle IBKR-Beobachtungen verlieren spätestens nach 15 Minuten ihre aktuelle Einstufung; Schlusskursreferenzen nach sieben Tagen. Gespeicherte Rückfallquellen werden nicht gelöscht.
- Wechselkurse verwenden weiterhin den vorhandenen automatischen Währungsdienst. Gleiche Währungen haben Faktor 1. Der IBKR-Adapter ändert keine historische Einstiegsmargin und keine historische Renditereferenz.

## Begrenzungen und Sicherheit

Der Dienst fragt während sichtbarer App-Nutzung ungefähr alle zwei Sekunden nach Aufgaben, sonst alle zehn Sekunden. Dies geht direkt an Supabase und belegt keine ständig wartenden Vercel-Funktionen. Depotkurse werden bei aktiver Nutzung etwa einmal pro Minute gelesen. Interaktive Aufgaben sind auf 20 neue Abfragen pro Minute begrenzt, laufen nach zwei Minuten ab und verwenden kurzlebige, verbindungsgebundene Leases.

Die drei Machine-RPCs `ibkr_bridge_pair`, `ibkr_bridge_poll` und `ibkr_bridge_complete` sind bewusst für `anon` aufrufbar, weil der lokale Dienst keine Benutzersitzung übernimmt. Sie sind durch den einmaligen Kopplungscode beziehungsweise das zufällige Gerätegeheimnis authentifiziert. Geheimnis, Verbindung, Eigentümer, Kontostatus, Laufzeit und bei Antworten auch Aufgaben-Lease werden serverseitig geprüft. Sie liefern keine beliebigen Benutzerzeilen und stellen keine allgemeine SQL- oder Broker-Proxy-Schnittstelle bereit. Supabase Advisor kann diese RPCs entsprechend als exponierte SECURITY-DEFINER-Funktionen melden. Alle Suchpfade sind leer, alle öffentlichen Tabellen verwenden Eigentümer-RLS, direkte Schreibrechte sind entzogen. Die SQL-Tests prüfen diesen Vertrag einschließlich Widerruf und Cross-User-Zugriffen.

Die API selbst hat keinen zusätzlichen IBKR-Zugangspreis. Vorhandene Kursrechte können ohne zusätzliches Anbieterabo verwendet werden. Kostenlose Brokeroberflächenkurse garantieren keine kostenlose API-Berechtigung. Der Adapter verwendet niemals `regulatorySnapshot` und bucht keine Berechtigungen nach. Individuelle IBKR-/Estably-Abonnements und Gebühren bleiben Kontoeinstellungen des Benutzers.

Referenzen: [IBKR Gateway](https://www.interactivebrokers.com/docs/web-api/authentication/cpgw/installation-authentication), [tägliche Anmeldung](https://www.interactivebrokers.com/docs/web-api/authentication/cpgw/client-portal-gateway-faq), [Datenberechtigungen](https://ibkrcampus.com/docs/general/market-data-subscriptions/tws-data-vs-api-data), [Datenkennzeichnungen](https://ibkrcampus.com/docs/web-api/v1/endpoints/market-data/market-data-availability).
