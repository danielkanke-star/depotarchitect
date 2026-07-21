# Datenfluss – technischer Arbeitsstand

Stand: Meilenstein 1.1. Dieses Dokument ist eine technische Arbeitsunterlage und keine Rechtsberatung.

## Systemgrenzen

1. Der Browser lädt die Next.js-Anwendung von Vercel. Öffentliche Seiten benötigen kein Konto.
2. Anmeldung, E-Mail-Bestätigung und TOTP-MFA laufen über Supabase Auth. Auth-Cookies sind technisch notwendig.
3. Server Components, Server Actions und der Supabase-Client greifen mit dem Publishable Key zu. Tabellenzugriffe werden durch PostgreSQL Row Level Security auf `auth.uid()` begrenzt.
4. Portfolios, Kategorien, Positionen, Einstellungen, Profile, rechtliche Kenntnisnahmen und Löschanfragen liegen in Supabase PostgreSQL in `eu-central-1`.
5. Vercel Functions sind über `vercel.json` auf `fra1` begrenzt. Die tatsächliche Region ist nach jedem Preview-Deployment in den Metadaten zu prüfen.
6. Das lokale Skript `scripts/grant-admin.ts` nutzt nur bei bewusster Ausführung einen serverseitigen Supabase Secret Key. Dieser Schlüssel wird nicht an den Browser übertragen und nicht committed.

## Datenkategorien

- Kontodaten: E-Mail, Auth-Bestätigungszeitpunkte, letzter Login, TOTP-Faktoren bei Supabase.
- Profildaten: Kontostatus, Tarifbezeichnung, Zeitpunkte für Aktivität, Onboarding und geplante Löschung.
- Depotdaten: Portfolios, Kategorien, Positionen, selbst eingetragene Werte, Limits und Notizen.
- Risikodaten: Hebel-, Margin-, Konzentrations- und Risiko-bis-Stop-Kennzahlen sowie Warnschwellen.
- Nachweise: Dokumenttyp, Dokumentversion und Zeitpunkt einer Kenntnisnahme beziehungsweise Annahme.
- Betriebsdaten: nicht sensible Admin-Aktionen mit Request-ID; Vercel-/Supabase-Infrastrukturprotokolle im Umfang des jeweiligen Dienstes.

## Bewusste Datenminimierung

Der Adminbereich aggregiert nur Kontometadaten und Anzahlwerte. Ticker, Positionsnamen, Marktwerte, Nettoliquidität, Risikowerte, Passwörter und Tokens werden dort nicht abgefragt. Vollständige IP-Adressen werden nicht in Anwendungstabellen gespeichert. Es gibt keine Analyse-, Marketing-, Replay- oder Fingerprinting-Werkzeuge.

`AUFBEWAHRUNGSFRIST VOR KUNDENSTART FESTZULEGEN.`
