# Backlog für die spätere Risikodarstellung

Status: Offener fachlicher Diskussionsstand. **Die konkrete Risiko- und Farbdarstellung wird erst in einem späteren Meilenstein fachlich festgelegt.**

Zu klären sind insbesondere:

- Positionsgewicht an der Nettoliquidität
- Risiko bis zum Stopp
- Risiko in Prozent der Nettoliquidität
- Anteil einer Position am gesamten Trading-Risiko
- Anteil einer Position am Risikobudget
- Broker-Stopp gegenüber mentalem Stopp
- Risiko einer gesamten Brokerposition
- Risiko einzelner DepotArchitect-Teilpositionen
- Farbstufen
- Warnungen
- Cockpit-Priorisierung

Meilenstein 2B berechnet Risiko bis zum Stopp, Risiko in Prozent der NetLiq und den Anteil am berechenbaren Gesamtrisiko zentral. Er implementiert bewusst keine neuen Farben, Risikoampeln, Grenzwerte oder Risikobudget-Auslastung. Die Farblogik einer privaten Tabelle wird nicht übernommen. Mehrere Stopps werden nicht zusammengeführt, und es wird keine Regel erfunden, welcher Stopp automatisch maßgeblich wäre.

Die spätere Spezifikation muss zuerst Begriffe, Datenverfügbarkeit, Rechenbasis, Rundung, fehlende Werte, Prioritäten und fachliche Abnahmefälle festlegen. Erst danach dürfen Darstellung und Berechnung gemeinsam umgesetzt werden.
