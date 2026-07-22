# DepotArchitect

DepotArchitect ist eine Next.js-Anwendung für Depot-, Margin- und Risikomanagement.

## Stack

- Next.js 16 / App Router
- React 19
- Supabase Auth + PostgreSQL + RLS
- Vercel

## Lokaler Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Erforderliche Variablen:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Alle weiteren Variablen sind in `.env.example` dokumentiert. Production bleibt bis zur rechtlichen und betrieblichen Freigabe im Registrierungsmodus `closed` und im öffentlichen Modus `private`. Der Registrierungsmodus muss zusätzlich bewusst in `public.app_runtime_settings` synchronisiert werden. `PUBLIC_SITE_MODE=preview` ist ausschließlich für kontrollierte Preview-Abnahmen vorgesehen; `public` wird bei fehlender rechtlicher Freigabe serverseitig auf `private` zurückgestuft.

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

DepotArchitect zeigt Depotstruktur, Hebel, Margin, Positionsgrößen, Risiko bis Stop, Konzentrationen und selbst gesetzte Warnschwellen. Es erteilt keine individuellen Kauf-/Verkaufsempfehlungen, trifft keine Orderentscheidungen, führt keine Orders aus und ersetzt keine Anlageberatung.

## Einmalig einen Admin vergeben

Nur lokal oder in einer geschützten Serverumgebung ausführen. Das Skript lädt `.env.local` über Next.js. `SUPABASE_SECRET_KEY` niemals committen oder als `NEXT_PUBLIC_*` konfigurieren.

```bash
npm run grant-admin -- --email konkrete-adresse@example.com
```

Das Skript prüft den vorhandenen Supabase-Auth-Benutzer und vergibt Rolle plus Audit-Eintrag atomar. Eine Wiederholung erzeugt weder eine zweite Rolle noch einen zweiten Vergabe-Audit. Anschließend muss dieser Benutzer unter `/mfa/setup` Supabase TOTP einrichten. Datenschutz- und Betriebsarbeitsstände liegen unter `docs/privacy/`.

Die anfänglichen Positionen sind Beispieldaten. Als spätere primäre Datenquelle ist eine gesonderte automatische Brokeranbindung vorgesehen; die benutzerdefinierte CSV bleibt ein optionaler manueller Fallback.
