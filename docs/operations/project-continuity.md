# Projektverfügbarkeit und Datensicherung

Dieses Dokument beschreibt die minimale Betriebsroutine für DepotArchitect. Sie soll verhindern, dass ein nicht genutztes Free-Projekt unbemerkt pausiert, und sie ersetzt ausdrücklich **keine** unabhängige Datensicherung.

## Eingebundene Plattformen

- **Supabase** speichert Datenbank-, Authentifizierungs- und gegebenenfalls Storage-Daten.
- **GitHub** speichert Quellcode, Migrationen und die Änderungshistorie.
- **Vercel** baut und betreibt die Next.js-Anwendung.
- Externe Marktdatenanbieter sind Datenquellen. Sie werden nicht allein zur Erzeugung künstlicher Aktivität oder zum Verbrauch eines Kontingents aufgerufen.

## Supabase Free-Projekt

Supabase kann Free-Projekte bei zu geringer Datenbankaktivität innerhalb eines Sieben-Tage-Zeitraums pausieren. Nach dem Pausieren besteht ein 90-Tage-Fenster für die Wiederherstellung per Dashboard. Die Frist bezieht sich auf das pausierte Supabase-Projekt, nicht auf GitHub-Commits oder Vercel-Deployments.

Eine sichere Betriebsprüfung besteht aus:

1. Projektstatus im Supabase-Dashboard prüfen.
2. Falls pausiert, ausschließlich das vorhandene Projekt wiederherstellen; kein Ersatzprojekt anlegen.
3. Anwendung öffnen und eine normale, lesende Datenbankabfrage über die Anwendung prüfen.
4. Datenbankmigrationen im Repository mit dem angewendeten Stand vergleichen.
5. Security- und Performance-Advisor prüfen.
6. Keine Depot-, Benutzer- oder Authentifizierungsdaten nur zur Erzeugung von Aktivität verändern.

Ein paar echte Benutzerabfragen pro Tag können laut Supabase ein Pausieren verhindern, garantieren dies im Free-Tarif aber nicht. Für dauerhaft garantierte Verfügbarkeit ist ein kostenpflichtiger, nicht automatisch pausierbarer Tarif erforderlich.

## Monatliche Wartungsprüfung

- Production-URL und Login-Seite ohne Datenänderung auf Erreichbarkeit prüfen.
- Supabase-Projektstatus und eine lesende Datenbankabfrage prüfen.
- Offene Supabase-Advisor-Hinweise kontrollieren.
- GitHub-Branch, Pull Requests und Versionsstand der Migrationen kontrollieren.
- Letztes Vercel-Deployment und fehlgeschlagene Builds kontrollieren.
- Nur bei einer fachlichen oder betrieblichen Änderung committen; keine inhaltslosen Keepalive-Commits erzeugen.
- Vorhandene Backups beziehungsweise einen getesteten Exportweg prüfen.

## Wiederanlaufprüfung vom 8. September 2026

- Das vorhandene Supabase-Projekt wurde als `INACTIVE` erkannt, wiederhergestellt und anschließend als `ACTIVE_HEALTHY` bestätigt.
- Eine ausschließlich lesende Datenbankabfrage war erfolgreich; PostgreSQL meldete Version 17.6.
- Der angewendete Datenbankstand endet bei Migration `20260726215315`. Die drei neueren Migrationen des Draft-Branches sind noch nicht angewendet. Die Datenbank ist damit nicht weiter als das Repository.
- Security- und Performance-Advisor wurden erneut ausgeführt; das Ergebnis ist in `docs/privacy/supabase-advisors.md` dokumentiert.
- Es wurde kein neues Supabase- oder Vercel-Projekt angelegt.
- Es wurden keine Depot-, Benutzer- oder Authentifizierungsdaten verändert.
- PR #3 bleibt Draft; `main` und das Production-Deployment bleiben unverändert.

## Datensicherung

Aktivität ist kein Backup. Vor externer Nutzung ist ein dokumentierter, regelmäßig getesteter Export- und Wiederherstellungsprozess für Datenbank, Auth-Benutzer und Storage festzulegen. Sicherungen müssen verschlüsselt und außerhalb des aktiven Supabase-Projekts aufbewahrt werden. Zugangsdaten, API-Schlüssel und `.env`-Dateien dürfen weder in Git noch in Wartungsprotokolle gelangen.
