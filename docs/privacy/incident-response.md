# Datenschutz- und Sicherheitsvorfälle – Entwurf

Arbeitsunterlage, keine Rechtsberatung.

## Technischer Erstablauf

1. Vorfallzeit, betroffene Systeme und eine interne Incident-ID erfassen; keine zusätzlichen personenbezogenen Daten in Tickets oder Chat kopieren.
2. Zugänge sichern, kompromittierte Schlüssel rotieren und gegebenenfalls Deployments oder Registrierungen stoppen.
3. Vercel-Runtime-/Build-Logs, Supabase Auth-/Postgres-Logs und `admin_audit_log` eng auf Zeitraum und Request-ID begrenzen und beweissicher aufbewahren.
4. Betroffene Datenkategorien, Benutzergruppen, Umfang, Vertraulichkeit, Integrität und Verfügbarkeit bewerten.
5. Wiederherstellen, Ursache beseitigen und Regressionstests ausführen.
6. Entscheidungen, Benachrichtigungen und Folgemaßnahmen dokumentieren.

## Vor Kundenstart verbindlich zu definieren

- Verantwortliche Person und Erreichbarkeits-/Vertretungsplan.
- Melde- und Benachrichtigungsfristen sowie zuständige Aufsichtsbehörde.
- Eskalationswege zu Supabase und Vercel.
- Kommunikationsvorlagen und sichere Kontaktwege.
- Nachbereitung, Lessons Learned und Maßnahmenkontrolle.

Der konkrete rechtliche Ablauf für Datenschutzverletzungen muss fachlich geprüft werden. Keine E-Mail-Adressen, Depotinhalte oder Tokens in allgemeinen Fehlerausgaben oder Anwendungslogs schreiben.
