# Technische und organisatorische Maßnahmen – Entwurf

Arbeitsunterlage, keine geprüfte Rechtsberatung.

## Bereits technisch umgesetzt

- Supabase Auth, E-Mail-Bestätigung und technisch notwendige Auth-Cookies.
- RLS auf bestehenden Depot- und allen neuen Meilenstein-1.1-Tabellen.
- Eigene Rolle-/Berechtigungstabellen; normale Benutzer können Rollen weder lesen noch ändern.
- Adminzugriff nur mit serverseitiger Rollenprüfung und Supabase TOTP auf `aal2`.
- Mutationen prüfen Admin und MFA erneut, verlangen eine Bestätigung und schreiben ein minimiertes Auditereignis.
- Secret-/Service-Role-Schlüssel sind nicht im Frontend vorgesehen; `.env*` wird außer `.env.example` ignoriert.
- Sicherheitsheader: CSP, `frame-ancestors 'none'`, `nosniff`, Referrer- und Permissions-Policy; HSTS nur in Production über HTTPS.
- Geschützte Seiten und Adminseiten sind `noindex`; öffentliche Landingpage darf indexiert werden.
- Kein Analytics, Werbepixel, Session Replay, Fingerprinting oder Marketing-Cookie.
- Eigendatenexport wird per RLS und zusätzlichem `user_id`-Filter begrenzt und nicht gecacht.
- Funktionsregion `fra1`; Datenbankregion Frankfurt.

## Organisatorisch vor Kundenstart

- Berechtigungsprüfung und regelmäßige Adminrollen-Revision festlegen.
- Verantwortliche für Datenschutzanfragen und Vorfälle benennen.
- Backup-, Wiederherstellungs-, Patch- und Schlüsselrotationsverfahren dokumentieren und testen.
- Aufbewahrungs- und Löschfristen festlegen.
- Supabase- und Vercel-Verträge/DPA sowie aktuelle Unterauftragsverarbeiter prüfen.
- Sicherheitsberater, Abhängigkeiten, RLS-Cross-User-Tests und Wiederherstellung regelmäßig prüfen.

`AUFBEWAHRUNGSFRIST VOR KUNDENSTART FESTZULEGEN.`
