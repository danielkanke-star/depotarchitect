# Supabase Security- und Performance-Advisors

Prüfstand nach der brokerneutralen Meilenstein-2A-Ergänzung am 22. Juli 2026. Arbeitsunterlage.

## Behoben

- Fehlende Indizes auf `user_invitations.invited_by` und `account_deletion_requests.processed_by` ergänzt.
- Doppelte permissive Select-Policies für Profile und Löschanfragen jeweils zu einer Policy zusammengeführt.
- Auf internen Konfigurations-, Rollen-, Berechtigungs- und Einladungstabellen explizite Deny-Policies ergänzt. Zusätzlich bleiben die Tabellenrechte für `anon`/`authenticated` entzogen.

## Bewusst verbleibend

Der Security Advisor meldet ausführbare `SECURITY DEFINER`-Funktionen als Warnung. Jede Funktion verwendet `SET search_path = ''`, qualifizierte Tabellenbezüge und explizit entzogene Standardrechte. Die direkte RPC-Abnahme umfasst `anon`, normalen Benutzer, Admin mit AAL1 und Admin mit AAL2.

| Funktion | Ausführbar durch | Interne Prüfung | Minimale Rückgabe |
| --- | --- | --- | --- |
| `is_admin` | `authenticated` | `auth.uid()` und vorhandene Adminrolle | Boolean |
| `is_admin_aal2` | `authenticated` | `is_admin()` und JWT-Claim `aal2` | Boolean |
| `get_my_role` | `authenticated` | ausschließlich Rollen zu `auth.uid()` | einzelne Rolle |
| `get_my_account_status` | `authenticated` | ausschließlich Profil zu `auth.uid()` | einzelner Status |
| `touch_user_profile` | `authenticated` | ausschließlich `auth.uid()`, zeitlich gedrosselt | keine Daten |
| `request_account_deletion` | `authenticated` | ausschließlich `auth.uid()` | eigene Anfrage-ID |
| `replace_portfolio_snapshot` | `authenticated` | `auth.uid()`, Eigentum des Zielportfolios, vollständige normalisierte Nutzlast, Zähler und Kategorien | Import-ID und ausschließlich aggregierte Importzähler; Bestandsersatz und Historie atomar |
| `validate_invitation` | nur `anon` | Modus `invite`, normalisierte E-Mail, exakt 64-stelliger hexadezimaler SHA-256-Hash, Ablauf und Nichtverwendung müssen gemeinsam stimmen | ausschließlich Boolean |
| `get_admin_summary` | `authenticated` | Adminrolle und JWT-AAL2 | ausschließlich aggregierte Zähler |
| `get_admin_user_directory` | `authenticated` | Adminrolle und JWT-AAL2 | fest definierte Konto-Metadaten, keine Depotfelder |
| `get_admin_user_detail` | `authenticated` | Adminrolle und JWT-AAL2; Öffnen wird auditiert | fest definierte Konto- und Löschanfrage-Metadaten |
| `admin_set_account_status` | `authenticated` | Adminrolle und JWT-AAL2; zulässiger Status; kein Selbstsperren | keine Daten; Änderung und Audit atomar |
| `admin_set_role` | `authenticated` | Adminrolle und JWT-AAL2; nur Adminrolle; letzte Adminrolle geschützt | keine Daten; Änderung und Audit atomar |
| `admin_process_deletion_request` | `authenticated` | Adminrolle und JWT-AAL2; nur offene Anfrage | keine Daten; Status und Audit atomar |
| `bootstrap_grant_admin` | ausschließlich `service_role` | vorhandener Auth-Benutzer; eindeutige Rolle | Boolean; Rollenvergabe und Audit atomar |
| `handle_new_user` | kein API-Rollenrecht, nur Auth-Trigger | Registrierungsmodus und gegebenenfalls einmalige Einladung | Triggerdatensatz |

`anon` besitzt kein Ausführungsrecht auf Admin-RPCs. Normale Benutzer und AAL1-Admins erreichen zwar die für `authenticated` freigegebenen Endpunkte, werden aber innerhalb der Funktion vor jedem Lesen oder Schreiben mit SQLSTATE `42501` abgewiesen. Dadurch entsteht auch bei einem direkten REST-RPC-Aufruf keine Umgehung.

Diese Warnungen sind daher geprüft, nicht ignoriert. Eine spätere Härtung kann interne Definer-Funktionen in ein nicht exponiertes Schema verschieben und schmale Invoker-Wrapper einsetzen.

Der Auth-Advisor meldet außerdem deaktivierte „Leaked Password Protection“. Das Projekt verwendet derzeit den Free-Tarif; die Funktion ist laut Supabase erst ab Pro verfügbar. Für den privaten Entwicklungsbetrieb mit `REGISTRATION_MODE=closed` und `PUBLIC_SITE_MODE=private` wird dieser Hinweis bewusst nicht als Merge-Blocker behandelt. Er bleibt jedoch ein zwingender Launch-Blocker: Vor jeder Aktivierung von `REGISTRATION_MODE=invite` oder `REGISTRATION_MODE=open` muss die Funktion aktiviert, erneut geprüft und dokumentiert werden.

Exakter manueller Schritt:

1. Supabase Dashboard → Organization Settings → Billing/Subscription → auf Pro oder höher wechseln.
2. Projekt `jpvbqcfppsalpgvmpdnm` → Authentication → Providers → Email.
3. Im Bereich Password Security „Leaked Password Protection“ aktivieren und speichern.
4. Security Advisor erneut ausführen und normale Anmeldung, falsches Passwort, Passwortregeln, geschlossene Registrierung und Betreiberkonto prüfen.

Dokumentation: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Der Performance Advisor meldet derzeit ausschließlich INFO-Hinweise zu noch unbenutzten Indizes:

- `positions_sector_idx`
- `account_deletion_requests_status_idx`
- `positions_source_import_id_idx`
- `positions_external_position_id_idx`

Die beiden noch gemeldeten neuen Importindizes sind vor dem ersten dauerhaften Import erwartungsgemäß unbenutzt. Der Advisor meldet den Index für die chronologische Importhistorie nach den Preview-Abnahmen nicht mehr. Hinweise zu unbenutzten Indizes werden nach realer Nutzung erneut bewertet; sicherheits-, Historien- und FK-relevante Indizes werden nicht vorschnell entfernt.
