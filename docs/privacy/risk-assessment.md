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

Der npm-Audit vom 23. Juli 2026 meldet für die über Next.js transitive Abhängigkeit `sharp <0.35.0` die libvips-Hinweise CVE-2026-33327, CVE-2026-33328, CVE-2026-35590 und CVE-2026-35591. Dies ist für Meilenstein 2B kein Mergeblocker, weil DepotArchitect derzeit keine Bilddateien verarbeitet und der angebotene automatische Fix ein breaking Downgrade von Next.js auslösen würde. Vor Einführung geplanter Screenshot- oder Bildnotizen ist die gesamte serverseitige Bildverarbeitung erneut sicherheitstechnisch zu prüfen und auf eine nicht verwundbare Version zu aktualisieren. Nicht vertrauenswürdige Bilder dürfen niemals über eine verwundbare serverseitige `sharp`-Version verarbeitet werden.

Der erneute npm-Audit am 31. Juli 2026 führt zusätzlich die transitive `brace-expansion`-DoS-Warnung ohne verfügbaren nicht-brechenden automatischen Fix auf. Der betroffene Pfad gehört zur lokalen ESLint-/Build-Werkzeugkette; die Anwendung verarbeitet darüber keine vom Benutzer gelieferten Glob-Muster zur Laufzeit. Die Abhängigkeit bleibt bis zu einem kompatiblen Upstream-Update zu beobachten. Die 11 als „high“ gezählten Pakete beruhen auf diesen beiden transitiven Wurzelhinweisen (`sharp` und `brace-expansion`), nicht auf 11 unabhängigen Laufzeitlücken.

Beim Audit am 8. August 2026 wurden die kompatibel behebbaren `nanoid`-, `postcss`-, `brace-expansion`- und `js-yaml`-Versionen im Lockfile aktualisiert. `npm audit --omit=dev` meldet danach nur noch zwei High-Zählungen aus demselben transitiven `sharp <0.35.0`-/libvips-Wurzelhinweis. Ein erzwungener Fix würde Next.js außerhalb des freigegebenen Versionsbereichs verändern und wird in diesem Draft nicht vorgenommen. Der oben genannte verbindliche Bildverarbeitungsblocker bleibt bestehen.

Die Erforderlichkeit einer formellen Datenschutz-Folgenabschätzung und eines Datenschutzbeauftragten ist vor Kundenstart fachlich zu prüfen.
