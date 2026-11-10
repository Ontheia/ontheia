# Posteingang

**Pfad:** Linke Sidebar → Posteingang (unter „Neuer Chat")

Konzept und Verhalten: [Posteingang](/de/automation/03_inbox/).

---

## Aufbau

```
linkes Panel (Filter)  | rechtes Panel
───────────────────────┼──────────────────────────────────────────────
Offen (Anzahl)         │ Header: Überschrift + Button [Alle erledigt]
Alle                   │ Liste der Einträge, Freigaben zuerst
                       │ [Mehr laden], wenn es weitere gibt
```

| Filter | Zeigt |
| --- | --- |
| **Offen** | Einträge, die noch nicht erledigt sind. |
| **Alle** | Auch erledigte und abgelaufene Einträge, abgeblendet. |

---

## Eintrag

| Element | Beschreibung |
| --- | --- |
| Symbol | Grüner Haken = Ergebnis · rotes Warndreieck = Fehler · gelbes Schild = Freigabe. |
| Titel | Name des Zeitplans oder Triggers. |
| Marken | Art (Ergebnis, Fehler, Freigabe) und Quelle (Zeitplan, Trigger). Bei geschlossenen Einträgen zusätzlich der Zustand, bei Freigaben die Antwort. |
| Zeitpunkt | Wann der Eintrag entstand. |
| Text | Ergebnis und Fehler: Anfang der Antwort bzw. Fehlertext. Freigabe: Server und Tool, die Argumente zum Ausklappen und bis wann der Lauf wartet. |

### Aktionen

| Button | Bei | Wirkung |
| --- | --- | --- |
| **[Zum Chat]** | allen Einträgen mit vorhandenem Chat | Öffnet den Chat des Laufs. |
| **[Erledigt]** | Ergebnis, Fehler | Schließt den Eintrag. |
| **[Einmal erlauben]** | Freigabe | Führt diesen einen Tool-Aufruf aus. |
| **[Für diesen Lauf erlauben]** | Freigabe | Erlaubt das Tool für den Rest des Laufs. |
| **[Ablehnen]** | Freigabe | Weist den Tool-Aufruf ab. |
| **[Alle erledigt]** | Kopfzeile | Schließt alle offenen Ergebnisse und Fehler. Freigaben bleiben offen. |

---

## Zähler in der Sidebar

Die Zahl neben **Posteingang** nennt die offenen Einträge (über 99: „99+"). Bei eingeklappter Sidebar zeigt ein Punkt am Symbol, dass etwas offen ist.
