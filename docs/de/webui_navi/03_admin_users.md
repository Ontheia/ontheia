# Admin-Konsole › Benutzer

**Pfad:** Avatar-Dropdown → Administration → Benutzer

---

## Abschnitt: Systemzugang

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Selbstregistrierung erlauben (Self-Signup) | Checkbox | Ermöglicht neuen Benutzern die eigenständige Registrierung ohne Admin-Eingriff. |
| Admin-Freigabe für neue Benutzer anfordern | Checkbox | Neu registrierte Benutzer verbleiben im Status „Ausstehend", bis ein Admin sie aktiviert. |

> Änderungen wirken sofort — kein Übernehmen-Button erforderlich.

---

## Abschnitt: Benutzerverwaltung

Tabelle aller registrierten Benutzer. Spalten: **E-Mail / Name**, **Rolle**, **Status**, **Letzter Login**, **Aktionen** (Bearbeiten / Löschen).

Button **[Benutzer anlegen]** öffnet einen modalen Dialog.

---

## Modal: Benutzer anlegen / Benutzer bearbeiten

| Feld | Typ | Pflicht | Hinweise |
| --- | --- | --- | --- |
| E-Mail | Text | ✓ (nur Anlegen) | Beim Bearbeiten eines bestehenden Benutzers deaktiviert. |
| Anzeigename | Text | | Sichtbarer Name in der Oberfläche. |
| Passwort | Passwort | ✓ (nur Anlegen) | Mind. 8 Zeichen. Beim Bearbeiten nicht angezeigt. |
| Rolle | Dropdown | ✓ | `Benutzer` oder `Administrator`. Am eigenen Konto nicht änderbar. |
| Status | Dropdown | ✓ | `Aktiv`, `Ausstehend` oder `Gesperrt`. Am eigenen Konto nicht änderbar. |
| Admin-Zugriff auf Memory erlaubt | Checkbox | | Nur-Lesen — wird vom Benutzer selbst gesteuert, nicht vom Admin änderbar. |

> Speichern über **[Speichern]** im Modal. Abbrechen mit **[Abbrechen]**.
