# Zugriff & Sichtbarkeit

Ontheia ermöglicht eine feingranulare Steuerung darüber, welcher Nutzer welchen Agenten sehen und nutzen darf.

## 1. Besitzer (Ownership)

Jeder Agent hat genau einen **Besitzer**. Der Besitzer sieht den Agenten immer in seinem Composer (sofern „Im Composer anzeigen" aktiv ist) und benötigt keinen Eintrag unter „Berechtigte Benutzer".

Beim Anlegen wird standardmäßig der anlegende Admin Besitzer. Legt ein Admin einen Agenten **für einen anderen Benutzer** an, sollte er im Feld **„Besitzer"** den Zielbenutzer wählen — sonst erscheint der Agent im Composer des Admins statt beim Zielbenutzer. Die Ownership lässt sich beim Bearbeiten jederzeit übertragen; Admins behalten unabhängig davon über die Admin-Konsole vollen Verwaltungszugriff auf alle Agenten.

**Faustregel:** Besitzer = der Benutzer, *dessen* Agent es ist. Berechtigte Benutzer = zusätzliche Mitnutzer.

## 2. Berechtigte Benutzer

Die Zugriffskontrolle erfolgt über das Multiselect-Feld **„Berechtigte Benutzer"** im Agent-Formular.

| Auswahl | Wirkung |
|---|---|
| `* Alle Benutzer` | Der Agent ist für alle eingeloggten Benutzer zugänglich (öffentlich). |
| Einzelne Benutzer | Zugriff nur für die explizit genannten Accounts. |
| Keine Auswahl | Nur der Owner und Administratoren haben Zugriff. |

**Schnelllinks:**
- **Alle auswählen** — setzt automatisch `* Alle Benutzer`
- **Auswahl leeren** — entfernt alle Berechtigungen (nur Owner/Admin)

## 3. Sichtbarkeit im Composer

Das Feld **„Im Composer anzeigen"** steuert, ob der Agent in der Agenten-Auswahl des Composers erscheint. Ein Agent kann zugriffsberechtigt sein, ohne im Composer aufzutauchen — etwa für reine Delegations-Agenten die nur von anderen Agenten aufgerufen werden.

Das Flag gilt **global pro Agent** — es blendet ihn bei allen sichtbarkeitsberechtigten Benutzern gleichermaßen ein oder aus, nicht pro Benutzer. Wer den Agenten im Composer sieht, ergibt sich aus Besitzer + Berechtigte Benutzer; das Flag schaltet nur die Anzeige insgesamt.

## 4. Berechtigungs-Prüfung (RLS)

Technisch wird die Sichtbarkeit über die PostgreSQL-Tabelle `app.agent_permissions` und entsprechende RLS-Policies erzwungen. Selbst wenn ein Nutzer die UUID eines Agenten kennt, kann er diesen nicht ansprechen, sofern er keine explizite Erlaubnis besitzt.
