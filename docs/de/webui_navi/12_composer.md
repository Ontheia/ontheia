# Composer

Der Composer ist die Eingabeleiste am unteren Rand der Chat-Ansicht. Er besteht aus drei Bereichen.

---

## Texteingabe

Mehrzeilige Textarea für die Nachricht. Wächst automatisch mit dem Inhalt.

- **Enter** → Nachricht senden (Desktop)
- **Shift + Enter** → Zeilenumbruch
- **Button ↑ (Senden)** → Nachricht absenden
- **Button ■ (Stopp)** → Laufenden Run abbrechen (erscheint während einer Ausführung)

---

## Tool-Freigabe-Banner

Wenn ein Agent ein Tool aufrufen möchte und die Tool-Freigabe auf „Nachfragen" steht, erscheint oberhalb der Textarea ein Genehmigungsbanner mit:

| Aktion | Beschreibung |
| --- | --- |
| **Einmalig erlauben** | Tool wird für diesen Aufruf freigegeben. |
| **Immer erlauben** | Tool wird für die gesamte Session dauerhaft freigegeben. |
| **Ablehnen** | Tool-Aufruf wird verweigert. |

Tool-Name, MCP-Server und Aufruf-Argumente werden im Banner angezeigt.

---

## Untere Leiste (Composer-Bar)

Linke Seite: **Provider/Agent-Auswahl** — rechte Seite: **Aktions-Buttons**.

### Provider/Agent-Auswahl (links)

Zwei gekoppelte Dropdowns:

| Dropdown | Inhalt |
| --- | --- |
| **Primär** | Provider (z. B. „OpenAI") oder Agent (z. B. „W_Ontheia") |
| **Sekundär** | Bei Provider: Modell · Bei Agent: Task oder Chain |

Nur Einträge mit aktivem „Im Composer anzeigen"-Flag erscheinen in der Auswahl.

Die Auswahl wird pro Chat gespeichert (bleibt nach Chat-Wechsel und Neuladen erhalten). Beim Wechsel auf einen Agenten übernimmt Ontheia dessen vom Administrator konfigurierten Tool-Freigabe-Modus für diesen Chat; eine Provider-Auswahl lässt den aktuellen Tool-Freigabe-Modus unverändert.

### Aktions-Buttons (rechts)

| Button | Beschreibung |
| --- | --- |
| **Kontextgröße (z. B. „8,9k T")** | Zeigt die Tokenanzahl des Prompts der letzten Anfrage (Kontext-Auslastung). Hover zeigt den genauen Wert. |
| **Shield / ShieldCheck** | Tool-Freigabe-Modus umschalten: „Nachfragen" ↔ „Voller Zugriff". Nur sichtbar wenn ein Agent gewählt ist. |
| **Sparkles** | Prompt optimieren — sendet die aktuelle Eingabe zur KI-Umformulierung. |
| **Lesezeichen+** | Prompt-Vorlagen öffnen (siehe unten). |

---

## Prompt-Vorlagen (Popover)

Öffnet sich über den Lesezeichen-Button. Ermöglicht das Speichern und Wiederverwenden häufiger Eingaben.

**Scope-Auswahl:** Vorlagen können einem Bereich zugeordnet werden:

| Scope | Beschreibung |
| --- | --- |
| **Task** | Spezifisch für den aktuell gewählten Task. |
| **Agent** | Spezifisch für den aktuell gewählten Agenten. |
| **Chain** | Spezifisch für die aktuell gewählte Chain. |
| **Global** | Für alle Kontexte verfügbar. |

**Aktionen:** Vorlage per Klick in die Textarea einfügen · Vorlage speichern · Vorlage löschen.

---

## Warnungen & Fehler

Über dem Composer werden Warnhinweise und Fehlermeldungen als Toast-Benachrichtigungen eingeblendet. Sie können einzeln über das **×**-Symbol geschlossen werden.
