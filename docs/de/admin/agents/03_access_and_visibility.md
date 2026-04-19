# Zugriff & Sichtbarkeit

Ontheia ermöglicht eine feingranulare Steuerung darüber, welcher Nutzer welchen Agenten sehen und nutzen darf.

## 1. Sichtbarkeits-Modi

### Privat (Standard)
Der Agent ist grundsätzlich nur für seinen Besitzer (Owner) und Administratoren sichtbar. 
- **Zuweisung:** Über das Feld "Zugriffsberechtigte Benutzer" können weitere Personen explizit freigeschaltet werden.
- **Vorteil:** Ideal für spezialisierte Agenten einzelner Mitarbeiter oder vertrauliche Test-Setups.

### Öffentlich (Public)
Der Agent steht **allen authentifizierten Benutzern** des Systems zur Verfügung.
- **Anzeige:** Erscheint automatisch bei jedem Nutzer in der Agenten-Auswahl.
- **Vorteil:** Perfekt für allgemeine Assistenten (z. B. "Standard Chat" oder "HR-Auskunft").

## 2. Berechtigungs-Prüfung (RLS)
Technisch wird die Sichtbarkeit über die PostgreSQL-Tabelle `app.agent_permissions` und entsprechende RLS-Policies erzwungen. Selbst wenn ein Nutzer die UUID eines Agenten kennt, kann er diesen nicht ansprechen, sofern er keine explizite Erlaubnis besitzt.
