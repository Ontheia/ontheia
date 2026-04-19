# Der Chain-Designer

Der Designer ist das grafische Werkzeug zum Erstellen der Ablauflogik (Spec).

## 1. Schritt-Typen

- **LLM:** Ein Aufruf an ein Sprachmodell mit einem spezifischen Prompt. Unterstützt Variablen-Injection.
- **Tool:** Direkte Ausführung eines MCP-Werkzeugs (z. B. Google Kalender, Nextcloud, Time-Server).
- **Memory Search / Write:** Interaktion mit dem Langzeitgedächtnis (Vektorspeicher) für RAG-Workflows.
- **Branch:** Erlaubt Fallunterscheidungen (Wenn-Dann) mit mehreren Zweigen (Switch-Case) und einem Standard-Fall.
- **Parallel:** Führt mehrere Zweige gleichzeitig aus, um die Gesamtlaufzeit bei unabhängigen Aufgaben zu verkürzen.
- **Loop:** Wiederholt einen Block von Schritten eine definierte Anzahl oft (Iterationen).
- **Retry:** Versucht einen Block bei Fehlern automatisch erneut (mit einstellbarer Pause und Versuchsanzahl).
- **Delay:** Pausiert den Ablauf explizit für eine definierte Zeit (in Millisekunden).
- **Transform:** Formatiert Daten um oder erstellt neue Strukturen basierend auf Templates.
- **REST Call:** Führt einen HTTP-Request an eine beliebige externe API aus.

## 2. Konfiguration pro Schritt
Jeder Schritt kann individuell angepasst werden:
- **Agent/Task:** Welcher "Arbeiter" führt diesen Schritt aus?
- **Config/Args (JSON):** Hier werden die technischen Parameter hinterlegt (z. B. der Prompt für ein LLM oder die Argumente für ein Tool).

## 3. Import / Export
Specs können als JSON-Text importiert oder exportiert werden. Dies ermöglicht das Sichern von komplexen Flows in Dateien oder das Teilen von Best-Practices zwischen verschiedenen Ontheia-Instanzen.
