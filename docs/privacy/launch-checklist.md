# Launch-Checkliste für eine spätere Kundenöffnung

Der Meilenstein 1.1 eröffnet **keine** öffentliche Registrierung und keine öffentliche Marketingseite. Production bleibt `REGISTRATION_MODE=closed` und `PUBLIC_SITE_MODE=private`. Die Texte sind Arbeitsunterlagen und keine Rechtsberatung.

## Harte technische Freigabebedingungen

- [ ] Vollständige Anschrift in zentraler Legal-Konfiguration gesetzt.
- [ ] Kontakt-E-Mail gesetzt.
- [ ] `LEGAL_PRIVACY_APPROVED=true`, `LEGAL_IMPRINT_APPROVED=true` und `LEGAL_PROCESSORS_REVIEWED=true` erst nach tatsächlicher Freigabe gesetzt.
- [ ] App-Variable und `app_runtime_settings.registration_mode` bewusst und übereinstimmend auf `invite` oder `open` gestellt.
- [ ] `PUBLIC_SITE_MODE=public` erst nach vollständiger rechtlicher Freigabe setzen; der serverseitige Guard muss dann `public` tatsächlich erlauben.
- [ ] Einladungsablauf beziehungsweise offene Registrierung einschließlich E-Mail-Bestätigung getestet.
- [ ] Adminrolle ausschließlich über dokumentiertes Verfahren vergeben und TOTP/AAL2 getestet.
- [ ] Supabase-Tarif auf Pro oder höher umstellen und Leaked Password Protection unter Authentication → Providers → Email → Password Security aktivieren; Advisor-Warnung anschließend erneut prüfen.
- [ ] Sämtliche RLS-Cross-User-Tests und Supabase Security Advisors ohne ungeklärte kritische Hinweise.
- [ ] Preview-Build, CSP, Cookies, Server Actions, Eigendatenexport und Löschantrag getestet.
- [ ] Vercel-Deploymentmetadaten bestätigen `fra1` statt `iad1`.
- [ ] Repository- und Client-Bundle-Scan bestätigen: keine `.env`, Service-Role-/Secret-Keys oder personenbezogene Logs.

## Verbindlich manuell vor Kundenstart

- [ ] Verantwortliche Person beziehungsweise juristische Einheit festlegen; aktuell: Daniel Kanke, Rheda-Wiedenbrück, Deutschland, DepotArchitect ist keine eigene Rechtseinheit.
- [ ] Vollständiges Impressum ergänzen.
- [ ] Datenschutzerklärung juristisch prüfen.
- [ ] Rechtsgrundlagen je Verarbeitungszweck festlegen.
- [ ] Aufbewahrungsfristen festlegen.
- [ ] Supabase-DPA rechtsverbindlich anfordern und abschließen.
- [ ] Vercel-DPA beziehungsweise geeigneten Tarif prüfen und abschließen.
- [ ] Aktuelle Unterauftragsverarbeiter dokumentieren.
- [ ] Drittlandtransfers und Garantien prüfen.
- [ ] Verzeichnis der Verarbeitungstätigkeiten finalisieren.
- [ ] Technische und organisatorische Maßnahmen finalisieren.
- [ ] Zuständigkeit für Datenschutzanfragen festlegen.
- [ ] Ablauf für Datenschutzvorfälle festlegen.
- [ ] Erforderlichkeit einer Datenschutz-Folgenabschätzung prüfen.
- [ ] Prüfen, ob ein Datenschutzbeauftragter erforderlich ist.
- [ ] Finanzaufsichtsrechtlich prüfen lassen, bevor individualisierte Anlageempfehlungen eingeführt werden.
- [ ] Risikohinweis und Nutzungsbedingungen anwaltlich prüfen.

`AUFBEWAHRUNGSFRIST VOR KUNDENSTART FESTZULEGEN.` Solange Pflichtpunkte fehlen, erzwingt der Production-Launch-Guard den Modus `closed` und schreibt lediglich eine Warnung ohne personenbezogene Daten.
