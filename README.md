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

## Aktueller Stand

- geschützte Anmeldung
- Cockpit
- Depotübersicht
- Positionen anlegen, bearbeiten und löschen
- Risikorechner
- Einstellungen
- Supabase-Migration mit RLS

Die anfänglichen Positionen sind Beispieldaten und werden später durch Google-Sheets- oder Brokerdaten ersetzt.
