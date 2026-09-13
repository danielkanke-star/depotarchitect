# Kostenkontrolle für Marktdaten

## Aktueller Twelve-Data-Rahmen

DepotArchitect behandelt den Basic-Free-Rahmen konservativ als 8 API-Credits pro Minute und 800 pro Tag. `/quote` und `/symbol_search` werden jeweils als ein Credit gerechnet. Automatische Abrufe sind in der DB auf höchstens 6 pro Minute und 650 pro Tag begrenzt. Die verbleibende Kapazität ist für bewusste interaktive Suchen reserviert. Provider-Grenzen bleiben als zentrale Policy konfigurierbar; eine Erhöhung erfordert eine bewusste Migration und Tarifprüfung.

Ein Depot mit 50 Positionen und 35 eindeutigen Listing-Tupeln benötigt für einen vollständigen stale Durchlauf höchstens 35 Quote-Abrufe, nicht 50. Teilpositionen und mehrere Depots desselben Benutzers teilen den Listingcache. FX wird einmal je eindeutigem Ausgangs-/Zielwährungspaar geplant.

Es gibt keine kostenpflichtige Aktivierung, kein automatisches Upgrade, keine Add-ons und keine 24/7-Aktualisierung. Logs dürfen weder API-Key noch Benutzer-, Positions- oder Depotwerte enthalten. Der Key bleibt ausschließlich serverseitig; er ist kein `NEXT_PUBLIC_*` Wert.

## Verbindlicher Lizenzblocker

Twelve Data kennzeichnet Basic Free derzeit als interne Non-Display-Nutzung. Die Zulässigkeit der Anzeige in einer extern zugänglichen Kundenanwendung ist nicht bestätigt. Deshalb darf diese Integration nicht für externe Kunden in Production aktiviert werden, bevor Anzeige-/Weitergaberecht, Börsenabdeckung, Tarif, Vertragsbedingungen, DPA/Datenschutzrolle und mögliche Kosten schriftlich geprüft und freigegeben wurden.

Dieser Punkt ist ein Production- beziehungsweise Kundenlaunch-Blocker, auch wenn die technische Preview funktioniert.

