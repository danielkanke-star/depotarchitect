# Löschkonzept – Entwurf

Arbeitsunterlage, keine Rechtsberatung.

## Aktueller Ablauf

1. Ein angemeldeter Benutzer liest die Folgen und bestätigt den Antrag ausdrücklich unter `/konto/datenschutz`.
2. `request_account_deletion()` erstellt atomar höchstens eine offene Anfrage und setzt den Profilstatus auf `deletion_requested`.
3. Ein Admin mit TOTP/AAL2 sieht nur Status und notwendige Kontometadaten.
4. Der Admin kann nach erneuter Bestätigung die manuelle Prüfung als begonnen markieren. Dies wird auditiert.
5. Es gibt bewusst keine automatische Production-Löschung und keinen Ein-Klick-Endpunkt zur endgültigen Löschung.

## Vor Aktivierung einer Löschkaskade

- Identität und Umfang des Begehrens prüfen.
- Gesetzliche/vertragliche Aufbewahrung und Einschränkung statt Löschung klären.
- Tabellen- und Auth-Kaskade in einer isolierten Umgebung testen.
- Backups, Protokolle, rechtliche Nachweise und externe Systeme einbeziehen.
- Abschluss dokumentieren und betroffene Person nach festgelegtem Verfahren informieren.

Portfolios referenzieren `auth.users` mit `ON DELETE CASCADE`; weitere Benutzertabellen sind ebenfalls kaskadierend angebunden, Audit-Zielverweise werden dagegen minimiert auf `NULL` gesetzt. Eine Auth-Löschung wird erst nach manueller Freigabe implementiert.

`AUFBEWAHRUNGSFRIST VOR KUNDENSTART FESTZULEGEN.`
