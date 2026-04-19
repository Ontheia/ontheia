# Logik & Datenfluss

Chains nutzen ein mächtiges Templating-System, um Informationen zwischen Schritten weiterzugeben und komplexe Entscheidungen zu treffen.

## 1. Variablen & Platzhalter
In der Konfiguration eines Schritts können Sie über die Syntax `${...}` auf Daten zugreifen. Die Engine unterstützt dabei die **rekursive Dot-Notation**, um tief verschachtelte JSON-Strukturen anzusprechen.

### Zugriff auf Schritte
Jeder Schritt speichert seine Ergebnisse unter seiner `id`:
- `${steps.<id>.output}`: Die rohe Textantwort (z. B. eines LLMs).
- `${steps.<id>.data.<pfad>}`: Zugriff auf das geparste JSON-Objekt. (Beispiel: `${steps.weather.data.current.temp}`).
- `${steps.<id>.result}`: Das komplette technische Ergebnis (z. B. ein MCP-Result-Objekt).

### Globale Variablen
- `${input}` / `${userInput}`: Der ursprüngliche Text des Benutzers.
- `${user_id}`: Die ID des aktuellen Benutzers.
- `${chat_id}`: Die ID des aktuellen Chats.
- `${agent_id}`: Die ID des ausführenden Agenten.

## 2. Bedingungen (`when`)
Über das Feld `when` steuern Sie, ob ein Schritt ausgeführt oder übersprungen wird. Die Engine wertet den Ausdruck nach der Variablen-Ersetzung aus.

**Unterstützte Operationen:**
- **Vergleiche:** `==` und `!=` (z. B. `"${steps.check.data.status} == 'ok'"`).
- **Booleans:** Erkennt Strings wie `"true"`, `"false"`.
- **Existenz:** Ein nicht-leerer String oder eine Zahl ungleich 0 gilt als `true`.

## 3. Datenfluss via Edges (Graphen)
Neben der Variablen-Injection können Daten auch explizit über `edges` gemappt werden. Dies ist nützlich, um Daten gezielt in die `inputs` eines Zielschritts zu injizieren:

```json
"edges": [
  {
    "from": "source_step",
    "to": "target_step",
    "map": {
      "data.user.name": "target_field"
    }
  }
]
```

## 4. Komplexe Kontrollflüsse
Die Engine unterstützt fortgeschrittene Strukturen für Logik-Graphen:
- **Branch:** Saubere Fallunterscheidung (Switch-Case).
- **Parallel:** Gleichzeitige Ausführung von Zweigen zur Performance-Optimierung.
- **Loop:** Wiederholung von Blöcken (Iterationen).
- **Retry:** Automatische Fehlertoleranz mit einstellbarem Backoff.
