# Verarbeitungstätigkeiten – Entwurf

Arbeitsunterlage, nicht anwaltlich oder datenschutzrechtlich geprüft.

| Tätigkeit | Zweck | Daten | Beteiligte Systeme | Rechtsgrundlage / Frist |
| --- | --- | --- | --- | --- |
| Kontoregistrierung und Anmeldung | Konto bereitstellen und schützen | E-Mail, Auth-Metadaten, technisch notwendige Cookies | Next.js, Supabase Auth | `RECHTLICH ZU ERGÄNZEN`; `AUFBEWAHRUNGSFRIST VOR KUNDENSTART FESTZULEGEN` |
| Depot- und Risikodarstellung | Vom Benutzer eingegebene Struktur und neutrale Kennzahlen darstellen | Portfolios, Positionen, Limits, Einstellungen | Vercel Functions, Supabase PostgreSQL | Vertragserfüllung vor Start konkret festlegen; Frist offen |
| Benutzerdefinierter CSV-Import | Optional einen vom Benutzer geprüften aktuellen Depotbestand manuell übernehmen | normalisierte Positionen; Importmetadaten ohne Rohdatei | Browser, Vercel Function `fra1`, Supabase PostgreSQL | Vertragserfüllung vor Start konkret festlegen; Frist offen |
| Rechtliche Nachweise | Dokumentversionen nachvollziehen | Benutzer-ID, Dokumenttyp/-version, Zeitpunkt | Supabase PostgreSQL | Rechtsgrundlage und Frist vor Start festlegen |
| Administration | Kontostatus und Löschanfragen sicher bearbeiten | E-Mail, Status, Zeitpunkte, aggregierte Anzahlen | Geschützter Adminbereich, Supabase | Berechtigung/Vertrag und Frist vor Start festlegen |
| Sicherheitsprotokoll | Administrative Eingriffe nachvollziehen | Admin-ID, Aktion, Ziel-ID, Request-ID, nicht sensible Metadaten | Supabase PostgreSQL | Berechtigtes Interesse prüfen; Frist offen |
| Eigendatenexport | Betroffenenrechte und Portabilität unterstützen | ausschließlich eigene Anwendungsdaten | Next.js Route Handler, Supabase RLS | Rechtsgrundlage/Verfahren finalisieren |
| Löschanfrage | Löschbegehren aufnehmen und manuell prüfen | Benutzer-ID, Status, Zeitpunkte, optionale Notiz | Supabase PostgreSQL, Adminbereich | Rechtsgrundlage/Frist finalisieren |

Notwendige Verarbeitung zur Leistungserbringung, Kenntnisnahme von Datenschutzinformationen und Annahme der Nutzungsbedingungen werden technisch getrennt. Eine freiwillige Marketingeinwilligung wird nicht erhoben und bleibt deaktiviert.

Vor Kundenstart sind Zwecke, Rechtsgrundlagen, Empfänger, Drittlandbezüge und Fristen durch die verantwortliche Stelle verbindlich zu finalisieren.
