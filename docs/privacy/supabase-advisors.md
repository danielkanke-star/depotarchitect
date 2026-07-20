# Supabase Security- und Performance-Advisors

Prüfstand nach Meilenstein-1.1-Migration. Arbeitsunterlage.

## Behoben

- Fehlende Indizes auf `user_invitations.invited_by` und `account_deletion_requests.processed_by` ergänzt.
- Doppelte permissive Select-Policies für Profile und Löschanfragen jeweils zu einer Policy zusammengeführt.
- Auf internen Konfigurations-, Rollen-, Berechtigungs- und Einladungstabellen explizite Deny-Policies ergänzt. Zusätzlich bleiben die Tabellenrechte für `anon`/`authenticated` entzogen.

## Bewusst verbleibend

Der Security Advisor meldet ausführbare `SECURITY DEFINER`-Funktionen als Warnung. Diese RPCs sind für das aktuelle Supabase-/Next.js-Modell absichtlich erreichbar, aber auf einen engen Zweck begrenzt:

- Selbstabfragen/-aktionen verwenden ausschließlich `auth.uid()`.
- Admin-RPCs prüfen intern Rolle und JWT-AAL2 und brechen sonst mit `42501` ab.
- `validate_invitation` liefert nur einen booleschen Wert für die Kombination aus normalisierter E-Mail, 256-Bit-Token-Hash, Modus, Ablauf und Nichtverwendung; es gibt keine Einladung aus.
- Jede `SECURITY DEFINER`-Funktion verwendet einen festen leeren `search_path`; Tabellen werden qualifiziert referenziert und Ausführungsrechte sind explizit begrenzt.

Diese Warnungen sind daher geprüft, nicht ignoriert. Eine spätere Härtung kann interne Definer-Funktionen in ein nicht exponiertes Schema verschieben und schmale Invoker-Wrapper einsetzen.

Der Auth-Advisor meldet außerdem deaktivierte „Leaked Password Protection“. Diese Supabase-Auth-Projekteinstellung ist vor Kundenstart zu aktivieren und anschließend mit Registrierung und Passwortänderung zu testen: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Hinweise zu unbenutzten Indizes sind bei neu angelegten Tabellen erwartbar und nach realer Nutzung erneut zu bewerten; sicherheits- und FK-relevante Indizes werden nicht vorschnell entfernt.
