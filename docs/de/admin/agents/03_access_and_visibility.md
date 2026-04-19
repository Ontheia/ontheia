# Zugriff & Sichtbarkeit

Ontheia ermöglicht eine feingranulare Steuerung darüber, welcher Nutzer welchen Agenten sehen und nutzen darf.

## 1. Berechtigte Benutzer

Die Zugriffskontrolle erfolgt über das Multiselect-Feld **„Berechtigte Benutzer"** im Agent-Formular.

| Auswahl | Wirkung |
|---|---|
| `* Alle Benutzer` | Der Agent ist für alle eingeloggten Benutzer zugänglich (öffentlich). |
| Einzelne Benutzer | Zugriff nur für die explizit genannten Accounts. |
| Keine Auswahl | Nur der Owner und Administratoren haben Zugriff. |

**Schnelllinks:**
- **Alle auswählen** — setzt automatisch `* Alle Benutzer`
- **Auswahl leeren** — entfernt alle Berechtigungen (nur Owner/Admin)

## 2. Sichtbarkeit im Composer

Das Feld **„Im Composer anzeigen"** steuert, ob der Agent in der Agenten-Auswahl des Composers erscheint. Ein Agent kann zugriffsberechtigt sein, ohne im Composer aufzutauchen — etwa für reine Delegations-Agenten die nur von anderen Agenten aufgerufen werden.

## 3. Berechtigungs-Prüfung (RLS)

Technisch wird die Sichtbarkeit über die PostgreSQL-Tabelle `app.agent_permissions` und entsprechende RLS-Policies erzwungen. Selbst wenn ein Nutzer die UUID eines Agenten kennt, kann er diesen nicht ansprechen, sofern er keine explizite Erlaubnis besitzt.
