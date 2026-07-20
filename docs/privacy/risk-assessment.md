# Technische Risikoabschätzung – Meilenstein 1.1

Arbeitsunterlage, keine Datenschutz-Folgenabschätzung und keine Rechtsberatung.

| Risiko | Schutzmaßnahme | Restrisiko / nächste Maßnahme |
| --- | --- | --- |
| Kontoübernahme eines Admins | Supabase TOTP, serverseitige AAL2- und Rollenprüfung je Seite/Aktion | Recovery-/Rollenprozess und regelmäßige Revision organisatorisch festlegen |
| Benutzer sieht fremde Depotdaten | RLS mit `auth.uid()`, zusätzliche Filter, Cross-User-Tests | Tests nach jeder Migration wiederholen; Advisors prüfen |
| Offene Registrierung vor Freigabe | Standard `closed`, DB-Trigger, Production-Launch-Guard | App- und DB-Modus müssen kontrolliert synchronisiert werden |
| Secret im Frontend/Repository | nur Publishable Key öffentlich; `.env*` ignoriert; lokales Adminskript nutzt `SUPABASE_SECRET_KEY` | Secret-Scan in CI und Rotation definieren |
| Übermäßiger Adminzugriff | Adminansicht fragt nur Kontometadaten/Aggregate ab; kein Impersonation-/Depotzugriff | Späterer Supportzugriff benötigt separate Freigabe, Zeitlimit und vollständiges Audit |
| Unbeabsichtigte Löschung | Antrag und Adminbearbeitung verlangen Bestätigung; keine automatische Löschung | Rechts-/Fristenprüfung und getestete Kaskade vor Aktivierung |
| Personenbezogene Logs | generische Benutzerfehler; Auditmetadaten minimiert | Plattformlogs, Quellcode und neue Fehlerpfade regelmäßig prüfen |
| Browserangriff/XSS/Embedding | CSP, `frame-ancestors 'none'`, `nosniff`, Referrer-/Permissions-Policy | CSP in Preview mit Auth, MFA und Server Actions prüfen; perspektivisch Nonce-basierte CSP bewerten |
| Finanzielle Fehlinterpretation | neutrale Kennzahlen und selbst gesetzte Warnschwellen; ausdrücklicher Risikohinweis | Texte juristisch prüfen; keine individuelle Empfehlung oder Orderfunktion einführen |
| Drittland-/Dienstleisterrisiko | Frankfurt-Regionen konfiguriert | DPA, Unterauftragsverarbeiter und tatsächliche Transfers/Garantien prüfen |

Die von Next.js gebündelte PostCSS-Version wurde per npm-Override auf die gepatchte Reihe `>=8.5.10` gehoben. Der Override ist bei jedem Next.js-Update zu überprüfen und zu entfernen, sobald die stabile Next-Version die gepatchte Version selbst festlegt.

Die Erforderlichkeit einer formellen Datenschutz-Folgenabschätzung und eines Datenschutzbeauftragten ist vor Kundenstart fachlich zu prüfen.
