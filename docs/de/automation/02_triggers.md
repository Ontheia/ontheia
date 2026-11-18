# Trigger (Webhook)

Ein Trigger startet einen Agenten oder eine Chain, wenn ein anderes System seine Adresse aufruft. Damit reagiert Ontheia auf Ereignisse, statt auf eine Eingabe im Chat oder einen Zeitplan zu warten: ein Sensor meldet einen Wert, ein Skript ist fertig, ein Dienst hat ein neues Dokument.

Jeder Benutzer kann eigene Trigger anlegen. Der Lauf handelt als Besitzer des Triggers, mit dessen Rolle und Rechten. Ein Admin kann über die API auch Trigger für andere Benutzer anlegen und verwalten (siehe API-Referenz); in der Oberfläche sieht jeder nur seine eigenen.

## Ablauf

```
Absender (Gerät, Skript, Dienst)
  │  POST /hooks/<id>   Authorization: Bearer <Token>   JSON-Daten
  ▼
Ontheia prüft das Token  →  antwortet sofort mit 202
  │
  ├─ Trigger frei     →  Lauf startet
  └─ Lauf noch aktiv  →  Warteschlange, einmal nachlaufen oder überspringen
  │
  ▼
Lauf im Hintergrund, in einem eigenen Chat
  │
  ├─ braucht ein Tool  →  Freigabe im Posteingang (Standard)
  └─ fertig oder Fehler →  Eintrag im Posteingang
```

Der Absender wartet nicht auf das Ergebnis. Er bekommt `202` mit `event_id` (und `run_id`, wenn der Lauf sofort startet), der Lauf geht danach weiter.

Ein Trigger arbeitet immer nur einen Aufruf zur Zeit ab. Verschiedene Trigger laufen gleichzeitig, bis zu drei je Benutzer.

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
curl -X POST 'https://meine-domain.de/api/hooks/<id>' \
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

Die Adresse setzt sich aus der Basis-Adresse der Host-API und `/hooks/<id>` zusammen. Hinter einem Reverse Proxy nach der [Anleitung](/de/configuration/04_reverse_proxy/) lautet sie `https://meine-domain.de/api/hooks/<id>`; die Oberfläche zeigt die richtige Adresse an.

### Antworten

| Status | Bedeutung |
| --- | --- |
| `202` `{"status":"accepted", …}` | Angenommen, der Lauf ist gestartet. |
| `202` `{"status":"queued", "event_id": …}` | Angenommen, der Aufruf wartet auf seinen Lauf. |
| `202` `{"status":"duplicate", "event_id": …}` | Ein Aufruf mit demselben `Idempotency-Key` ist schon angekommen; er wird nicht noch einmal ausgeführt. |
| `202` `{"status":"skipped","reason":"overlap"}` | Übersprungen (Modus „Überspringen“), weil ein Lauf dieses Triggers noch aktiv ist. `reason: "busy"`: Der Benutzer hat schon drei Trigger-Läufe aktiv. |
| `400` | Header `Idempotency-Key` leer oder länger als 200 Zeichen. |
| `401` | Token fehlt oder ist falsch, der Trigger ist unbekannt oder deaktiviert. Alle Fälle antworten gleich, damit die Antwort nichts über vorhandene Trigger verrät. |
| `404` | Trigger sind für diese Installation ausgeschaltet. |
| `413` | Daten größer als 256 KB. |
| `415` | Daten sind kein JSON. |
| `429` | `queue_full`: Es warten schon 100 Aufrufe. `rate_limited`: Limit pro Minute im Modus „Überspringen“. `too_many_failed_attempts`: zu viele Fehlversuche von dieser Adresse. |
| `503` | `queue_unavailable`: Der Aufruf konnte nicht gespeichert werden. Erneut senden. |

### Doppelte Zustellung vermeiden

Schickt der Absender einen Header `Idempotency-Key` (eindeutig je Ereignis, höchstens 200 Zeichen), führt Ontheia einen zweiten Aufruf mit demselben Schlüssel nicht noch einmal aus und antwortet mit `duplicate`. Das schützt vor doppelten Läufen, wenn der Absender wiederholt, weil eine Antwort unterwegs verloren ging. Der Schlüssel gilt, solange der erste Aufruf im Protokoll steht. Ein übersprungener oder abgewiesener Aufruf belegt ihn nicht: Die Wiederholung mit demselben Schlüssel wird ganz normal angenommen.

## Während ein Lauf aktiv ist

Was mit einem Aufruf passiert, der eintrifft, während der Trigger noch läuft, legt das Feld **Während ein Lauf aktiv ist** fest:

| Modus | Verhalten | Geeignet für |
| --- | --- | --- |
| **Warteschlange** (Standard) | Jeder Aufruf wartet und läuft der Reihe nach, in Eingangsreihenfolge. | Aufrufe, die jeweils ein eigener Auftrag sind, z. B. eine Mail. |
| **Einmal nachlaufen** | Es wartet höchstens ein Aufruf. Ein neuerer ersetzt ihn (Status „Ersetzt“); nach dem laufenden Lauf folgt genau ein weiterer, mit dem neuesten Aufruf. | Agenten, die sich ihre Arbeit selbst suchen, z. B. alle Dokumente mit einem bestimmten Tag. Ein Schub von zehn Aufrufen führt zu zwei Läufen statt zehn. |
| **Überspringen** | Der Aufruf wird verworfen, der Absender bekommt `skipped`. | Meldungen, bei denen nur die neueste zählt, oder Absender, die bei `skipped` selbst später wiederholen. |

Wartende Aufrufe:

- laufen auch an, wenn ein Lauf eines anderen Triggers endet und damit einer der drei Plätze des Benutzers frei wird,
- überstehen einen Neustart des Hosts,
- verfallen nach 24 Stunden (Status „Verfallen“, Eintrag im Posteingang, außer bei „Nichts“ melden),
- verfallen sofort, wenn der Trigger deaktiviert wird, damit sie nicht beim Wiedereinschalten unerwartet starten,
- lassen sich im Protokoll einzeln verwerfen.

Die Trigger-Liste zeigt, wie viele Aufrufe eines Triggers warten.

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

1. **Tool-Freigabe über den Posteingang ist der Standard.** Der Lauf darf von sich aus nur Tools nutzen, die beim Agenten dauerhaft erlaubt sind. Jeder andere Aufruf wartet auf deine Antwort im [Posteingang](/de/automation/03_inbox/). Das ist die eigentliche Sicherung: Was auch immer in den Daten steht, es kann ohne dich nichts auslösen.
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
| Läufe pro Minute | je Trigger einstellbar, Standard 10 | weitere Aufrufe warten; bei „Überspringen“: `429` |
| Läufe gleichzeitig | 1 je Trigger, 3 je Benutzer | weitere Aufrufe warten bzw. werden übersprungen |
| Wartende Aufrufe | 100 je Trigger | weitere Aufrufe: `429 queue_full` |
| Wartezeit | 24 Stunden | danach verfällt der Aufruf |
| Fehlversuche | 20 pro Minute je Absender-Adresse | weitere Aufrufe: `429` |
| Datengröße | 256 KB | `413` |

Jeder Lauf verbraucht Tokens beim Provider. Das Limit pro Minute ist die Bremse für einen Absender, der mehr schickt als gedacht: Es begrenzt, wie viele Läufe starten, ohne Aufrufe zu verlieren.

## Protokoll und Test

Das **Protokoll** (Uhr-Symbol) zeigt die letzten Aufrufe eines Triggers mit Zeitpunkt, Status, den empfangenen Daten, dem Fehlertext und einem Link zum Chat. Es behält die letzten 200 Einträge. Aufrufe mit falschem Token stehen nicht darin.

| Status | Bedeutung |
| --- | --- |
| Wartet | Der Aufruf wartet auf seinen Lauf. Mit **Verwerfen** lässt er sich entfernen. |
| Läuft | Der Lauf ist aktiv. |
| Fertig | Der Lauf ist abgeschlossen. |
| Fehler | Der Lauf ist gescheitert oder konnte nicht starten. |
| Ersetzt | Wartete und wurde von einem neueren Aufruf ersetzt („Einmal nachlaufen“). |
| Verfallen | Wartete länger als 24 Stunden, oder der Trigger wurde deaktiviert. |
| Verworfen | Von Hand aus der Warteschlange entfernt. |
| Warteschlange voll | Abgewiesen, weil schon 100 Aufrufe warteten. |
| Limit erreicht | Abgewiesen wegen des Limits pro Minute („Überspringen“). |
| Übersprungen | Ein Lauf dieses Triggers war noch aktiv („Überspringen“). |
| Zu viele Läufe | Übersprungen, weil der Benutzer schon drei Trigger-Läufe aktiv hatte („Überspringen“). |

**Testen** (Play-Symbol) startet einen Lauf mit Beispieldaten, als hätte ein Absender die Adresse aufgerufen. Der Test läuft über deine Anmeldung und braucht das Token nicht. Er unterliegt denselben Regeln wie ein echter Aufruf, wartet also gegebenenfalls in der Warteschlange, und funktioniert auch bei einem deaktivierten Trigger.

## Betrieb

- **Globaler Schalter:** Administration → Allgemein → **Webhook-Trigger**. Ausgeschaltet antwortet jeder Aufruf mit `404`; die Trigger selbst bleiben erhalten. Die Änderung wirkt nach bis zu 30 Sekunden.
- **Neustart des Hosts:** Ein Lauf überlebt keinen Neustart. Beim Start markiert der Host die Protokolleinträge und Run-Protokolle unterbrochener Läufe als Fehler, offene Freigaben als abgelaufen und meldet jeden unterbrochenen Lauf im Posteingang. Wartende Aufrufe bleiben erhalten und laufen danach an.
- **Keine Wiederholung:** Ein gescheiterter oder durch einen Neustart unterbrochener Lauf wird nicht von selbst wiederholt. Er kann einen Teil seiner Arbeit schon erledigt haben, etwa eine Antwort verschickt; ein zweiter Lauf würde das wiederholen.
