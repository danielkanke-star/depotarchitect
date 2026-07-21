# Auftragsverarbeiter und Unterauftragsverarbeiter – Prüfstand

Arbeitsunterlage; Vertragsstände und Anbieterlisten müssen unmittelbar vor Kundenstart aktuell geprüft werden.

| Anbieter | Technische Rolle | Aktueller technischer Stand | Vor Kundenstart |
| --- | --- | --- | --- |
| Supabase | Authentifizierung, PostgreSQL, RLS | Projekt/Datenbank in `eu-central-1` | DPA rechtsverbindlich anfordern/abschließen; Unterauftragsverarbeiter, Speicherorte, Drittlandtransfers und Garantien prüfen |
| Vercel | Hosting, Build, Next.js Functions | Projektregion per Repository auf `fra1`; tatsächliche Deploymentregion noch je Preview zu bestätigen | DPA beziehungsweise geeigneten Tarif prüfen/abschließen; Unterauftragsverarbeiter, Logdaten und Drittlandtransfers prüfen |
| GitHub | Quellcode und CI/Git-Integration | Repository enthält keine vorgesehenen Kundendaten oder `.env`-Werte | Organisations-, Zugriffs-, Aufbewahrungs- und Vertragskonfiguration prüfen |

Nicht eingesetzt: Google Analytics, Meta Pixel, Marketingautomation, Nutzertracking, Session Replay und Fingerprinting.

Die jeweils aktuellen Anbieterlisten sind nicht statisch in diesem Dokument behauptet, sondern vor Start aus den offiziellen Vertragsunterlagen zu übernehmen und regelmäßig zu aktualisieren.
