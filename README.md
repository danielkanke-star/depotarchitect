# DepotArchitect

DepotArchitect ist eine Next.js-Anwendung für Depot-, Margin- und Risikomanagement.

Der erste brauchbare Stand ersetzt das Depotjournal und den Positionsgrößenrechner der bisherigen Tabelle. Verbindlicher Umfang, Formeln und Farben stehen in [docs/product/first-usable.md](docs/product/first-usable.md). Frühere Roadmaps bleiben Kontext und sind kein zusätzlicher Umsetzungsauftrag. Brokeranbindung und Zukunftsideen sind weiterhin separat.

## Stack

- Next.js 16 / App Router
- React 19
- Supabase Auth + PostgreSQL + RLS
- Vercel

## Lokaler Start

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Ohne Zugangsdaten lässt sich nach `npm ci` und `npm run dev` die lokale Entwicklungsvorschau unter `http://localhost:3000/vorschau` ansehen. Sie verwendet erfundene Daten und unterstützt Profilwechsel, Stoppänderungen, Beispielverkäufe, Statistik, Positionsplanung und CSV-Vorschau. Sie verändert keine echten Depots. Im Production-Build liefert diese Route HTTP 404.

Für die echte Anwendung ist zusätzlich die additive Migration `20261028083022_first_usable_journal.sql` erforderlich. Der lokale SQL-Test spielt alle Migrationen in einer isolierten PostgreSQL-Testlaufzeit mit synthetischer Auth-Fixture durch. Das ersetzt keine Live-Abnahme von Supabase Auth und PostgREST. Betrieb und Freigabe: [docs/releases/first-usable.md](docs/releases/first-usable.md).

Erforderliche Variablen:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Alle weiteren Variablen sind in `.env.example` dokumentiert. Production bleibt bis zur rechtlichen und betrieblichen Freigabe im Registrierungsmodus `closed` und im öffentlichen Modus `private`. Der Registrierungsmodus muss zusätzlich bewusst in `public.app_runtime_settings` synchronisiert werden. `PUBLIC_SITE_MODE=preview` ist ausschließlich für kontrollierte Preview-Abnahmen vorgesehen; `public` wird bei fehlender rechtlicher Freigabe serverseitig auf `private` zurückgestuft.

`TWELVE_DATA_API_KEY` aktiviert optional den serverseitigen Kursadapter. Der Schlüssel darf nie als `NEXT_PUBLIC_*` gesetzt werden. Ohne Schlüssel bleiben Google-Sheets-/CSV-/manuelle Kurse verfügbar. Die Kurspriorität lautet: IBKR, anderer Broker, Twelve Data beziehungsweise ein anderer Marktdatenanbieter, Google Sheets, CSV, manuell.

## Aktueller Stand

- geschützte Anmeldung
- Cockpit
- Depotübersicht
- Positionen anlegen, bearbeiten und löschen
- Risikorechner
- Einstellungen
- Supabase-Migration mit RLS
- öffentliche Landingpage und rechtliche Arbeitsstände
- geschlossenes, einladungsbasiertes oder offenes Registrierungsmodell mit Production-Launch-Guard
- versionierte Kenntnisnahmen, Rollenmodell und Admin-TOTP
- Eigendatenexport und manuell geprüfte Löschanfragen
- brokerneutraler benutzerdefinierter CSV-Snapshot
- zentrale, dezimalgenaue Positions- und Portfolioberechnung mit sichtbarer Datenvollständigkeit
- nachvollziehbare Kursquellen mit optionaler Twelve-Data-Abfrage und eindeutiger MIC-Börsenzuordnung
- Teil- und Schlussverkäufe mit eigenem Ausführungsjournal, Wiederholungsschutz und nachvollziehbaren Korrekturen
- Trade-Gruppen nach Wertpapier, Richtung, Einstiegstag und Kategorie; Abschlusszählung erst nach vollständiger Schließung
- eingefrorene Einstiegsmargin und Marginrendite vor Gebühren, Finanzierungskosten und Steuern
- Profilbudget aus 33 % NetLiq, getrennte Konzentrationshinweise und Stoppalter
- Positionsplanung nach Abzug des bestehenden Stopprisikos, mit automatischer Währungsumrechnung und konfigurierbarer Bruchstückelung
- additive Erstübernahme des Google-Sheets-Journals mit Vorschau und sichtbaren historischen Datenlücken

DepotArchitect zeigt Depotstruktur, Hebel, Margin, Positionsgrößen, Risiko bis Stop, Konzentrationen und selbst gesetzte Warnschwellen. Es erteilt keine individuellen Kauf-/Verkaufsempfehlungen, trifft keine Orderentscheidungen, führt keine Orders aus und ersetzt keine Anlageberatung.

## Einmalig einen Admin vergeben

Nur lokal oder in einer geschützten Serverumgebung ausführen. Das Skript lädt `.env.local` über Next.js. `SUPABASE_SECRET_KEY` niemals committen oder als `NEXT_PUBLIC_*` konfigurieren.

```bash
npm run grant-admin -- --email konkrete-adresse@example.com
```

Das Skript prüft den vorhandenen Supabase-Auth-Benutzer und vergibt Rolle plus Audit-Eintrag atomar. Eine Wiederholung erzeugt weder eine zweite Rolle noch einen zweiten Vergabe-Audit. Anschließend muss dieser Benutzer unter `/mfa/setup` Supabase TOTP einrichten. Datenschutz- und Betriebsarbeitsstände liegen unter `docs/privacy/`.

Neue Konten starten ohne Beispielbestände und ohne erfundene Nettoliquidität. Frühere Demozeilen bleiben gespeichert, werden aber aus dem echten Depotbereich herausgehalten. Die Brokeranbindung ist eine spätere gesonderte Aufgabe.
