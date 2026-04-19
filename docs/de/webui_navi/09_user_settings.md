# Benutzereinstellungen

**Pfad:** Avatar-Dropdown → Einstellungen

Tab-Leiste: **Allgemein** · **Benutzerkonto** · **Info**

---

## Tab: Allgemein

### Oberfläche & Verhalten

| Feld | Typ | Optionen | Beschreibung |
| --- | --- | --- | --- |
| Sprache | Dropdown | `Deutsch`, `Englisch` | Sprache der Oberfläche und Rückmeldungen. |
| Theme | Dropdown | `System-Standard`, `Hell`, `Dunkel` | Erscheinungsbild der Anwendung. „System-Standard" folgt dem Betriebssystem. |
| Desktop-Benachrichtigungen | Toggle | — | Bei aktiven Benachrichtigungen werden neue Antworten und Run-Events angezeigt. |

### Sidebar Startzustand

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Linke Sidebar (Navigation) | Checkbox | Beim Start der Anwendung geöffnet. |
| Rechte Sidebar (Aktivität) | Checkbox | Beim Start der Anwendung geöffnet. |

### Sidebar Verlauf & Limits

Steuert, wie viele Einträge in der Sidebar angezeigt werden (min. 5, max. 50).

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Nachrichten (Chats) | Zahl | Maximale Anzahl angezeigter Chats in der Sidebar. |
| Status-Meldungen | Zahl | Maximale Anzahl angezeigter Status-Meldungen. |
| Warnungen | Zahl | Maximale Anzahl angezeigter Warnungen. |

### Standard-Picker

Legt die Vorauswahl beim Start eines neuen Chats fest.

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Standard Provider oder Agent | Dropdown | Welcher Provider oder Agent im Composer vorausgewählt ist. |
| Standard Tool-Freigabe | Dropdown | Voreingestellte Tool-Freigabe-Stufe (`Nachfragen`, `Voller Zugriff`, `Blockiert`). |

Button: **[Einstellungen übernehmen]**

---

## Tab: Benutzerkonto

### Profil

Aktualisiert den Anzeigenamen. Die E-Mail-Adresse ist unveränderlich (dient als eindeutige Kennung).

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Anzeigename | Text | Sichtbarer Name in der Oberfläche. |
| Admin-Zugriff auf meinen Memory erlauben | Checkbox | Gibt Admins Lesezugriff auf persönliche Namespaces (z. B. `memory/session/chat`). Zugriff wird auditiert. |

### Avatar

Buttons: **[Neues Bild wählen]** · **[Avatar entfernen]**

### Passwort aktualisieren

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Aktuelles Passwort | Passwort | Verifiziert die Identität. |
| Neues Passwort | Passwort | Mindestens 8 Zeichen. |
| Neues Passwort bestätigen | Passwort | Muss mit dem neuen Passwort übereinstimmen. |

### Daten & Datenschutz

| Aktion | Beschreibung |
| --- | --- |
| **[Export herunterladen]** | Lädt alle Chats, Runs und Memory-Einträge als JSON-Datei herunter (Art. 20 DSGVO). |
| **[Mein Konto löschen]** | Löscht Konto, alle Chats, Runs und persönlichen Memory dauerhaft. Mit Bestätigungsdialog. Nicht rückgängig machbar. |

---

## Tab: Info

Rein informative Seite.

**Kontoübersicht** — Zeigt E-Mail, Rolle und letzte Runs.

**Admin-Session-Token** — Zeigt das aktuelle Authentifizierungs-Token (standardmäßig maskiert). Buttons: **[Token anzeigen / verbergen]** · **[Token kopieren]**.
