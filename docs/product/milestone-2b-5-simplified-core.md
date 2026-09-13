# Meilenstein 2B.5 – Vereinfachter Produktkern

Status: technischer Arbeitsstand im Draft-PR. Production bleibt unverändert.

## Sichtbarer Produktkern

Die reguläre Positionserfassung beschränkt sich auf Ticker, Kategorie, Produkttyp, Long/Short, Offen/Geschlossen, Menge, Instrumentwährung, Einstandskurs und -datum, Trading-Stopp, gegebenenfalls vereinfachte Verkaufsdaten, gegebenenfalls Margin sowie einen optionalen Kommentar.

Bei Cash-Konten ist Margin nicht zutreffend. Bei Margin- und Portfolio-Margin-Konten kann entweder eine Marginquote in Prozent oder ein direkter manueller Marginbetrag angegeben werden. Direkte manuelle Beträge werden nicht als Brokerdaten bezeichnet.

Ein- und Auszahlungen werden separat in `portfolio_capital_movements` gespeichert. Sie sind externe Kapitalbewegungen eines Depots und werden in diesem Meilenstein weder als Währungs-Cashbestand noch als Wertpapiertransaktion, Nettoliquidität oder Performance verbucht.

## Intern erhalten, regulär verborgen

Die Infrastruktur aus 2B.4 für aktuelle Kurse, historische und aktuelle Wechselkurse, Quellen, Zeitpunkte, Status, Brokerreferenzen und Importmetadaten bleibt erhalten. Sie wird im normalen Positions- und Einzahlungsformular nicht angezeigt. Änderungen von Ticker oder Instrumentwährung entwerten technisch abhängige Altwerte serverseitig, statt sie still weiterzuverwenden.

Fehlende aktuelle Kurse, Trading-Stopps oder für eine Bewertung notwendige Daten erzeugen keinen Ersatzwert, keinen Faktor 1 für Fremdwährungen und keinen Demo-Wert.

## Cockpit

Primär angezeigt werden:

- Nettoliquidität
- Wertpapiermarktwert
- Margin-Auslastung
- NetLiq-Hebel
- Risiko bis Trading-Stopp
- Risiko-Budget-Auslastung

Long, Short und Cash können kompakt ergänzend erscheinen. Technische Datenqualitätsmatrizen, Providerdetails und Quellenstatus gehören nicht in den primären Produktweg.

## Fachliche Grenzen

Teilverkauf und Schließung verwenden vorläufig kumulierte Verkaufsfelder. Eine transaktionsgenaue Historie folgt in 2C. Kapitalbewegungen sind nicht automatisch Cash, Gewinn oder Performance. Technische Markt- und Brokerdaten werden erst in späteren Meilensteinen automatisiert bezogen.
