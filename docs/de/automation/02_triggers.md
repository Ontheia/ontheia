# Trigger (Webhook)

Ein Trigger startet einen Agenten oder eine Chain, wenn ein anderes System seine Adresse aufruft. Damit reagiert Ontheia auf Ereignisse, statt auf eine Eingabe im Chat oder einen Zeitplan zu warten: ein Sensor meldet einen Wert, ein Skript ist fertig, ein Dienst hat ein neues Dokument.

Jeder Benutzer kann eigene Trigger anlegen. Der Lauf handelt als Besitzer des Triggers, mit dessen Rolle und Rechten.

## Ablauf

```
Absender (Gerät, Skript, Dienst)
  │  POST /hooks/<id>   Authorization: Bearer <Token>   JSON-Daten
  ▼
Ontheia prüft Token und Limits  →  antwortet sofort mit 202
  │
  ▼
Lauf im Hintergrund, in einem eigenen Chat
  │
  ├─ braucht ein Tool  →  Freigabe im Posteingang (Standard)
  └─ fertig oder Fehler →  Eintrag im Posteingang
```

Der Absender wartet nicht auf das Ergebnis. Er bekommt `202` mit `event_id` und `run_id`, der Lauf geht danach weiter.

## Trigger anlegen

**Pfad:** Avatar-Dropdown → Automatisierung → Trigger (Webhook) → **[Neuer Trigger]**

Nach dem Speichern zeigt Ontheia einmalig drei Dinge an, jeweils mit Kopierknopf:

- die **Adresse** (`…/hooks/<id>`)
- das **Token**
- ein fertiges **`curl`-Beispiel**

Das Token ist nur in diesem Dialog sichtbar. Ontheia speichert davon einen Fingerabdruck (SHA-256), nicht das Token selbst. Geht es verloren, erzeugt **Neues Token** (Schlüssel-Symbol) ein anderes; das bisherige ist ab dann ungültig.

Die Felder des Dialogs beschreibt die [Oberflächen-Referenz](/de/webui_navi/11_automation/).

## Aufruf

```bash
curl -X POST 'https://meine-domain.de/hooks/<id>' \
  -H 'Authorization: Bearer ontr_…' \
  -H 'Content-Type: application/json' \
  -d '{"event": "opened", "battery": 87}'
```

| Anforderung | Wert |
| --- | --- |
| Methode | `POST` |
| Token | Header `Authorization: Bearer <Token>` oder `X-Ontheia-Token: <Token>` |
| Daten | JSON (`Content-Type: application/json`), höchstens 256 KB |

Das Token wird nur im Header angenommen, nicht in der Adresse. In einer Adresse landet es in den Protokollen jedes Proxys auf dem Weg.

Die Adresse setzt sich aus der Basis-Adresse der Host-API und `/hooks/<id>` zusammen. Hinter einem Reverse Proxy muss dieser Pfad zum Host weitergeleitet werden, wenn Absender von außen kommen.

### Antworten

| Status | Bedeutung |
| --- | --- |
| `202` `{"status":"accepted", …}` | Angenommen, der Lauf ist gestartet. |
| `202` `{"status":"skipped","reason":"overlap"}` | Übersprungen, weil ein Lauf dieses Triggers noch aktiv ist und „Überlappung verhindern" gesetzt ist. |
| `401` | Token fehlt oder ist falsch, der Trigger ist unbekannt oder deaktiviert. Alle Fälle antworten gleich, damit die Antwort nichts über vorhandene Trigger verrät. |
| `404` | Trigger sind für diese Installation ausgeschaltet. |
| `413` | Daten größer als 256 KB. |
| `415` | Daten sind kein JSON. |
| `429` | Limit erreicht: Aufrufe pro Minute, gleichzeitige Läufe oder zu viele Fehlversuche von dieser Adresse. |

## Anweisung und Platzhalter

Die Anweisung ist der Text, den der Agent als Benutzernachricht bekommt. Die empfangenen Daten kommen über Platzhalter hinein:

| Platzhalter | Ergebnis |
| --- | --- |
| `{{payload}}` | Alle empfangenen Daten als abgegrenzter JSON-Block. |
| `{{payload.feld}}` | Ein einzelner Wert, auch verschachtelt (`{{payload.device.id}}`). Fehlt das Feld, bleibt die Stelle leer. Werte über 2000 Zeichen werden gekürzt. |
| `{{name}}` | Name des Triggers. |
| `{{timestamp}}` | Zeitpunkt des Aufrufs in der System-Zeitzone. |

Beispiel:

```
Der Briefkasten-Sensor meldet „{{payload.event}}" (Batterie {{payload.battery}} %).
Schreibe mir eine kurze Nachricht in den Messenger.
```

Bleibt die Anweisung leer, bekommt der Agent die Daten mit der Bitte, sie gemäß seiner Aufgabe zu verarbeiten. Das genügt, wenn der Task-Kontext des Agenten schon sagt, was mit einem Ereignis geschehen soll.

## Sicherheit

Die empfangenen Daten kommen von außerhalb der Installation. Enthalten sie Text, der wie eine Anweisung aussieht, kann ein Sprachmodell ihm folgen. Ontheia begegnet dem auf drei Ebenen:

1. **Tool-Freigabe über den Posteingang ist der Standard.** Der Lauf darf von sich aus nur Tools nutzen, die beim Agenten dauerhaft erlaubt sind. Jeder andere Aufruf wartet auf deine Antwort im [Posteingang](./03_inbox.md). Das ist die eigentliche Sicherung: Was auch immer in den Daten steht, es kann ohne dich nichts auslösen.
2. **Die Daten sind als Daten gekennzeichnet.** `{{payload}}` wird als abgegrenzter Block eingesetzt, den sein Inhalt nicht schließen kann, und der Systemhinweis des Laufs sagt dem Modell, dass dieser Block und daraus entnommene Werte nicht als Anweisung zu befolgen sind. Das senkt das Risiko, beseitigt es aber nicht.
3. **Der Lauf hat nur die Rechte des Besitzers.** Beim Speichern und bei jedem Aufruf prüft Ontheia, ob der Besitzer den Agenten, den Task und die Chain benutzen darf.

| Tool-Freigabe | Verhalten | Geeignet für |
| --- | --- | --- |
| Im Posteingang anfragen | Tool-Aufrufe warten auf Antwort, außer bei dauerhaft erlaubten Tools. | Standard, jeder Absender. |
| Alle Tools erlauben | Der Lauf nutzt jedes Tool des Agenten ohne Nachfrage. | Nur Absender, denen du vertraust und deren Daten kein Dritter beeinflussen kann. |
| Keine Tools | Der Lauf antwortet, ohne ein Tool zu nutzen. | Reine Textverarbeitung. |

## Limits

| Limit | Wert | Wirkung |
| --- | --- | --- |
| Aufrufe pro Minute | je Trigger einstellbar, Standard 10 | weitere Aufrufe: `429` |
| Gleichzeitige Trigger-Läufe | 3 je Benutzer | weitere Aufrufe: `429` |
| Fehlversuche | 20 pro Minute je Absender-Adresse | weitere Aufrufe: `429` |
| Datengröße | 256 KB | `413` |

Jeder angenommene Aufruf startet einen Lauf und verbraucht damit Tokens beim Provider. Das Limit pro Minute ist die Bremse für einen Absender, der mehr schickt als gedacht.

## Protokoll und Test

Das **Protokoll** (Uhr-Symbol) zeigt die letzten Aufrufe eines Triggers mit Zeitpunkt, Status, den empfangenen Daten, dem Fehlertext und einem Link zum Chat. Es behält die letzten 200 Einträge. Aufrufe mit falschem Token stehen nicht darin.

| Status | Bedeutung |
| --- | --- |
| Läuft | Der Lauf ist aktiv. |
| Fertig | Der Lauf ist abgeschlossen. |
| Fehler | Der Lauf ist gescheitert oder konnte nicht starten. |
| Limit erreicht | Abgewiesen wegen der Aufrufe pro Minute. |
| Übersprungen | Ein Lauf dieses Triggers war noch aktiv. |
| Zu viele Läufe | Abgewiesen wegen der gleichzeitigen Läufe. |

**Testen** (Play-Symbol) startet einen Lauf mit Beispieldaten, als hätte ein Absender die Adresse aufgerufen. Der Test läuft über deine Anmeldung und braucht das Token nicht. Er zählt gegen dieselben Limits und funktioniert auch bei einem deaktivierten Trigger.

## Betrieb

- **Globaler Schalter:** Administration → Allgemein → **Webhook-Trigger**. Ausgeschaltet antwortet jeder Aufruf mit `404`; die Trigger selbst bleiben erhalten. Die Änderung wirkt nach bis zu 30 Sekunden.
- **Neustart des Hosts:** Ein Lauf überlebt keinen Neustart. Beim Start markiert der Host die Protokolleinträge und Run-Protokolle unterbrochener Läufe als Fehler und offene Freigaben als abgelaufen. Der Absender muss das Ereignis in diesem Fall erneut senden.
- **Keine Wiederholung:** Ein gescheiterter Lauf wird nicht von selbst wiederholt.
