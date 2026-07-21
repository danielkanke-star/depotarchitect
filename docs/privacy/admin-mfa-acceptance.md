# Admin- und MFA-Abnahme

Prüfstand: 21. Juli 2026, Preview-Deployment zu Commit `5b72507ca4199efc2a5930fac5a7a936ea444a1a`.

Diese Arbeitsunterlage enthält bewusst keine E-Mail-Adresse, Passwörter, TOTP-Secrets, QR-Codes, MFA-Codes, Authentifizierungstokens oder Supabase-Schlüssel.

## Admin-Bootstrap

- Die Adminrolle wurde mit der transaktionalen Funktion `bootstrap_grant_admin` vergeben.
- Rollenvergabe und Bootstrap-Audit wurden in derselben Datenbanktransaktion ausgeführt.
- Ergebnis: genau eine Adminrolle und genau ein `role.grant.bootstrap`-Audit-Eintrag.
- Ein zweiter Aufruf lieferte `false` und erzeugte weder eine weitere Rolle noch einen weiteren Audit-Eintrag.

## TOTP und AAL2

- Admin mit `aal1` wurde beim ersten `/admin`-Aufruf serverseitig nach `/mfa/setup` umgeleitet.
- TOTP-Faktor wurde eingerichtet und mit einem gültigen sechsstelligen Code bestätigt.
- `/admin` war anschließend mit `aal2` erreichbar.
- Nach Abmeldung und erneuter Passwortanmeldung wurde `/admin` serverseitig nach `/mfa/verify` umgeleitet.
- Die erneute TOTP-Verifizierung stellte `aal2` her; `/admin` war wieder erreichbar.

## Praktische Admin-Abnahme

- Ein temporärer normaler Testbenutzer erschien mit E-Mail-Bestätigung, Registrierungsdatum, Kontostatus, Tarif und ausschließlich aggregierten Portfolio-/Positionszählern.
- Die Adminansicht enthielt keine Ticker, Positionsnamen, Marktwerte, Nettoliquidität oder Risikoangaben.
- Das Öffnen der Detailseite erzeugte einen Audit-Eintrag `user_detail.open`.
- Sperrung und Reaktivierung erzeugten je einen Audit-Eintrag `account_status.change`.
- Das gesperrte Konto wurde über die echte Login-Seite mit `account_unavailable` abgewiesen.
- Der reaktivierte normale Benutzer sah keinen Adminlink; ein direkter `/admin`-Aufruf wurde serverseitig nach `/cockpit` umgeleitet.
- Eine Löschanfrage wurde als `pending` erfasst und anschließend als `processing` markiert. Der Audit-Eintrag `deletion_request.processing_started` entstand; das Auth-Konto bestand zu diesem Zeitpunkt weiter. Es erfolgte keine automatische Löschung.
- Alle temporären Testdaten einschließlich Test-Audits wurden anschließend entfernt. Verblieben sind genau ein Auth-Benutzer, genau eine Adminrolle und genau ein Bootstrap-Audit-Eintrag.

## Offener Launch-Blocker

Leaked Password Protection ist im Free-Tarif weiterhin deaktiviert. Dies blockiert den privaten Entwicklungsbetrieb nicht, muss aber zwingend vor `REGISTRATION_MODE=invite` oder `REGISTRATION_MODE=open` aktiviert und erneut getestet werden.
