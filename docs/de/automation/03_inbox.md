# Posteingang

Der Posteingang sammelt, was Läufe im Hintergrund dir vorlegen müssen: eine offene Tool-Freigabe, ein Ergebnis, einen Fehler. Hintergrundläufe sind Läufe aus einem [Zeitplan](/de/automation/01_overview/) oder einem [Trigger](/de/automation/02_triggers/). Läufe, die du im Chat startest, erzeugen keine Einträge; dort siehst du das Ergebnis direkt.

**Pfad:** Linke Sidebar → **Posteingang**. Die Zahl daneben nennt die offenen Einträge und aktualisiert sich von selbst.

## Arten von Einträgen

| Art | Entsteht, wenn | Schließt sich durch |
| --- | --- | --- |
| **Freigabe** | ein Hintergrundlauf ein Tool aufrufen will, das er nicht von sich aus nutzen darf | deine Antwort, den Ablauf der Wartezeit oder das Ende des Laufs |
| **Ergebnis** | ein Lauf fertig ist und das Melden eingeschaltet ist | **Erledigt** |
| **Fehler** | ein Lauf scheitert | **Erledigt** |

Wann ein Ergebnis gemeldet wird, legst du an der Quelle fest: beim Zeitplan mit **Ergebnis melden**, beim Trigger mit **Im Posteingang melden** (jedes Ergebnis, nur Fehler, nichts). Ein Fehler eines Zeitplan-Laufs landet immer im Posteingang.

Ergebnis und Fehler zeigen den Anfang der Antwort als reinen Text und führen mit **Zum Chat** zum vollständigen Verlauf.

## Freigaben

Eine Freigabe zeigt die Quelle, den MCP-Server und das Tool, die Argumente zum Ausklappen und den Zeitpunkt, bis zu dem der Lauf wartet. Freigaben stehen immer oben, weil auf jede ein Lauf wartet.

| Antwort | Wirkung |
| --- | --- |
| **Einmal erlauben** | Dieser eine Aufruf wird ausgeführt. Der nächste Aufruf desselben Tools fragt wieder. |
| **Für diesen Lauf erlauben** | Dieser Aufruf und alle weiteren Aufrufe desselben Tools in diesem Lauf werden ausgeführt. |
| **Ablehnen** | Der Aufruf wird abgewiesen. Der Lauf erfährt das und antwortet entsprechend. |

Keine der Antworten ändert die Einstellungen des Agenten. Soll ein Tool dauerhaft ohne Nachfrage laufen, erlaube es beim Agenten.

Eine Freigabe lässt sich nicht mit **Erledigt** wegklicken. Sie braucht eine Antwort, sonst würde der Lauf weiter warten.

### Wann eine Freigabe entsteht

- **Zeitplan:** nur, wenn beim Job **Freigaben im Posteingang anfragen** eingeschaltet ist. Ausgeschaltet genehmigt sich der Job jeden Tool-Aufruf selbst.
- **Trigger:** wenn die Tool-Freigabe auf **Im Posteingang anfragen** steht. Das ist der Standard.

Tools, die der Agent immer nutzen darf, fragen in beiden Fällen nicht nach.

### Wartezeit

Bleibt eine Freigabe unbeantwortet, gilt sie nach 24 Stunden als abgelehnt, und der Lauf geht mit der Ablehnung weiter. Die Dauer ist unter Administration → Allgemein → **Wartezeit für Freigaben im Posteingang** einstellbar (1 bis 720 Stunden).

Die Zeit, die ein Lauf auf eine Freigabe wartet, zählt nicht gegen den Tool-Loop-Timeout. Das gilt auch für Freigaben im Chat.

### Wenn der Lauf nicht mehr wartet

Ein Eintrag kann abgelaufen sein, ohne dass du geantwortet hast:

| Vermerk | Ursache |
| --- | --- |
| Nicht rechtzeitig beantwortet | Die Wartezeit ist abgelaufen. |
| Lauf wurde gestoppt | Der Lauf wurde beendet, während er wartete. |
| Host wurde neu gestartet | Ein Lauf überlebt keinen Neustart des Hosts; seine offenen Freigaben können nicht mehr beantwortet werden. |

## Benachrichtigungen

Hast du dem Browser Benachrichtigungen für Ontheia erlaubt, meldet er eine neue Freigabe. Ergebnisse von Zeitplan-Läufen mit **Ergebnis melden** melden sich wie bisher bei Abschluss.

## Sichtbarkeit

Jeder Benutzer sieht nur seine eigenen Einträge. Das gilt auch für Administratoren. Eine Freigabe kann nur der Besitzer des Laufs beantworten.
