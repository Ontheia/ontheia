# Automatisierung

**Pfad:** Linke Sidebar → Automatisierung (Uhr-Icon)

Abschnitte: **Zeitpläne (Cron)** · **Trigger (Webhook)**

---

## Zeitpläne (Cron)

Zeigt alle konfigurierten Automatisierungen als Tabelle.

**Cron-Jobs-Tabelle:** Spalten: Job-Name, Agent, Task / Chain, Zeitplan, Aktionen (Bearbeiten · Löschen).

- Wiederkehrende Jobs zeigen den Cron-Ausdruck (z. B. `0 9 * * *`).
- Einmalige Jobs zeigen Datum und Uhrzeit der geplanten Ausführung.
- Agentenerstelle Jobs sind mit einem **Agent**-Badge gekennzeichnet.

Aktionen: **Löschen** (mit Bestätigungsdialog).

Button: **[Neuer Job]** — öffnet das Erstell-Modal.

---

## Modal: Job anlegen / Job bearbeiten

### Zeitplan

| Feld | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| Zeitplan-Modus | Radio | ✓ | **Wiederkehrend** (Cron-Ausdruck) oder **Einmalig** (Datum/Uhrzeit). |
| Cron-Zeitplan | Text | ✓ (Wiederkehrend) | Standard Cron-Format: `Min Std Tag Mon Woche`. Schnellauswahl: **Jede Minute** · **Täglich um 09:00** · **Sonntags um Mitternacht** · **Alle 15 Minuten**. |
| Ausführungszeit | Datum/Uhrzeit | ✓ (Einmalig) | Zeitpunkt der einmaligen Ausführung (lokale Systemzeit). Der Job wird nach Ausführung automatisch deaktiviert. |

### Prompt

| Feld | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| Prompt-Modus | Radio | ✓ | **Vorlage** (Dropdown aus gespeicherten Prompt-Vorlagen) oder **Text** (direkte Texteingabe). |
| Prompt-Vorlage | Dropdown | ✓ (Vorlage) | Vorlagen-Prompt als Benutzernachricht. Auflösung nach Scope: task → chain → agent → global. |
| Prompt-Text | Textarea | ✓ (Text) | Direkte Texteingabe als Benutzernachricht für den Agenten. |

### Ausführungskontext

| Feld | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| Job-Name | Text | ✓ | Anzeigename des Jobs (z. B. `Täglicher Wetter-Check`). |
| Agent | Dropdown | ✓ | Agent, der für den Lauf verwendet wird. |
| Task (Optional) | Dropdown | | Task des gewählten Agents. „Kein Task" = der Agent läuft direkt mit seiner Basiskonfiguration (ohne Task-System-Prompt); ein Default-Task wird nicht automatisch herangezogen. |
| Chain (Optional) | Dropdown | | Chain, die ausgeführt wird. Schließt Task aus. Angeboten werden alle Chains des Agenten — sowohl die Zuweisungen aus dem Chain-Designer (`app.chains.agent_id`) als auch Delegations-Bindungen (`app.agent_chains`) —, jeweils nur mit aktiver Version. |
| Chat-Titel Vorlage | Text | | Titelvorlage für den automatisch erstellten Chat. Platzhalter: `{{name}}`, `{{timestamp}}`. |
| Chat-Ziel | Dropdown | | Bestehenden Chat auswählen, in dem der Job fortgesetzt wird. Leer = neuer Chat bei jeder Ausführung. |
| Projekt für neue Chats | Dropdown | | Projekt, unter dem die von diesem Job angelegten Chats abgelegt werden. So füllt ein häufig laufender Job nicht die allgemeine Chat-Liste. Nur ohne Chat-Ziel wählbar; ein fester Chat behält sein Projekt. |
| Überlappung verhindern | Checkbox | | Falls aktiviert: geplanter Lauf wird übersprungen, wenn die vorherige Ausführung noch läuft. |
| Ergebnis melden | Schalter | | Legt das Ergebnis jedes Laufs in den [Posteingang](/de/webui_navi/16_inbox/). Mit aktivierten Desktop-Benachrichtigungen kommt zusätzlich eine Browser-Benachrichtigung. Ein fehlgeschlagener Lauf landet in jedem Fall im Posteingang. |
| Freigaben im Posteingang anfragen | Schalter | | Aus (Standard): Der Job genehmigt sich jeden Tool-Aufruf selbst. An: Jeder Tool-Aufruf wartet im Posteingang auf eine Antwort, außer bei Tools, die der Agent immer nutzen darf. |

Buttons: **[Speichern]** · **[Abbrechen]**

---

## Ausführungsverlauf

Unterhalb der Job-Tabelle: Liste der letzten Ausführungen mit Zeitstempel, Job-Name und Status.

Laufende Ausführungen lassen sich über den **Stop-Button im Run-Status der rechten Sidebar** (Aktivitäts-Panel) beenden — siehe [Rechte Sidebar](/de/webui_navi/14_sidebar_right/) — oder über den **Stop-Button am Chat-Eintrag in der linken Sidebar** — siehe [Linke Sidebar](/de/webui_navi/13_sidebar_left/).

---

## Trigger (Webhook)

Konzept, Aufruf und Sicherheit: [Trigger (Webhook)](/de/automation/02_triggers/).

Zeigt die eigenen Trigger als Karten: Name, Marke für die Tool-Freigabe, Adresse mit Kopierknopf, Ziel, letzter Aufruf und letzter Fehler.

| Aktion | Symbol | Wirkung |
| --- | --- | --- |
| Testen | Play | Öffnet einen Dialog für Beispieldaten (JSON) und startet damit einen Lauf – über die Anmeldung, ohne Token. |
| Protokoll | Uhr | Klappt die letzten Aufrufe aus: Zeitpunkt, Status, empfangene Daten, Fehler, Link zum Chat. |
| Neues Token | Schlüssel | Erzeugt nach Rückfrage ein neues Token. Das bisherige ist sofort ungültig. |
| Bearbeiten | Stift | Öffnet das Modal mit den gespeicherten Werten. |
| Löschen | Papierkorb | Löscht Trigger und Protokoll nach Rückfrage. |
| Aktiv | Schalter | Deaktiviert antwortet der Trigger wie ein unbekannter (`401`). |

Button: **[Neuer Trigger]** — öffnet das Erstell-Modal.

Sind Trigger für die Installation ausgeschaltet, steht ein Hinweis über der Liste.

### Modal: Trigger anlegen / Trigger bearbeiten

| Feld | Typ | Pflicht | Beschreibung |
| --- | --- | --- | --- |
| Name | Text | ✓ | Anzeigename, auch Titel der Posteingang-Einträge. Höchstens 120 Zeichen. |
| Agent | Dropdown | ✓ | Agent, der den Lauf ausführt. |
| Task (Optional) | Dropdown | | Task des gewählten Agents. |
| Chain (Optional) | Dropdown | | Chain statt Task. Schließt Task aus. |
| Anweisung | Textarea | | Benutzernachricht an den Agenten. Platzhalter: `{{payload}}`, `{{payload.feld}}`, `{{name}}`, `{{timestamp}}`. Leer = der Agent bekommt die Daten mit der Bitte, sie gemäß seiner Aufgabe zu verarbeiten. |
| Tool-Freigabe | Dropdown | ✓ | **Im Posteingang anfragen** (Standard) · **Alle Tools erlauben** (mit Warnhinweis) · **Keine Tools**. |
| Im Posteingang melden | Dropdown | ✓ | **Jedes Ergebnis** (Standard) · **Nur Fehler** · **Nichts**. |
| Ausgabe-Chat | Dropdown | | „Neuer Chat pro Lauf" (Standard) oder ein bestehender Chat, in dem alle Läufe fortgesetzt werden. Ein fester Chat passt nur, wenn die Ereignisse aufeinander aufbauen; siehe [Chat-Fortsetzung](/de/automation/01_overview/). |
| Chat-Titel Vorlage | Text | | Titel des neu angelegten Chats. Platzhalter: `{{name}}`, `{{timestamp}}` und Felder der empfangenen Daten wie `{{payload.id}}`. Nur bei „Neuer Chat pro Lauf". |
| Projekt für neue Chats | Dropdown | | Projekt, unter dem die Chats dieses Triggers abgelegt werden. Nur bei „Neuer Chat pro Lauf". |
| Läufe pro Minute | Zahl | ✓ | 1 – 600, Standard 10. Weitere Aufrufe warten; bei „Überspringen“ werden sie abgewiesen. |
| Während ein Lauf aktiv ist | Dropdown | ✓ | **Warteschlange** (Standard): jeder Aufruf läuft der Reihe nach · **Einmal nachlaufen**: höchstens ein Aufruf wartet, ein neuerer ersetzt ihn · **Überspringen**: der Aufruf wird verworfen. Siehe [Trigger](/de/automation/02_triggers/). |

Buttons: **[Speichern]** · **[Abbrechen]**

### Dialog nach dem Anlegen

Zeigt **Adresse**, **Token** und ein **`curl`-Beispiel**, jeweils mit Kopierknopf. Das Token ist nur hier sichtbar. Derselbe Dialog erscheint nach **Neues Token**.
