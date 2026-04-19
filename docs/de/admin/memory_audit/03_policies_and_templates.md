# Policies & Templates

Um Agenten Zugriff auf das Gedächtnis zu gewähren, müssen Memory-Policies konfiguriert werden. Diese können auf Agent-Ebene (Standard) oder Task-Ebene (spezifisch) definiert werden.

## Hierarchie & Vererbung

Ontheia nutzt ein hierarchisches System für Memory-Policies, um Flexibilität bei gleichzeitiger Reduzierung des Konfigurationsaufwands zu bieten:

1.  **Agent-Policy**: Definiert die Standard-Namespaces und Parameter (`top_k`, `allow_write`) für einen Agenten.
2.  **Task-Policy**: Ermöglicht es, für spezifische Aufgabenprofile (Tasks) abweichende Einstellungen festzulegen.

**Wichtig**: Falls für einen Task eine Memory-Policy definiert ist, **überschreibt** diese die Einstellungen des Agenten vollständig für diesen Task. Dies ermöglicht es beispielsweise, einem Agenten generell Zugriff auf das Firmenwissen zu geben, aber für den Task "Privates Briefing" den Zugriff exklusiv auf den persönlichen Namespace des Benutzers zu beschränken.

## Dynamische Templates

Anstatt feste IDs zu verwenden, nutzt Ontheia Platzhalter, die zur Laufzeit durch die Daten der aktuellen Sitzung ersetzt werden:

- `${user_id}`: Die UUID des aktuellen Benutzers. **Einziger Platzhalter, der als UUID im Namespace-Pfad verwendet wird.**
- `${chat_id}`: Die ID des aktuellen Chats (z. B. für sitzungsbezogene Namespaces).
- `${session_id}`: Die ID der aktuellen Web-Sitzung.
- `${agent_id}`, `${task_id}`: Verfügbar als Metadaten-Kontext (z. B. für Policy-Filterung), aber **nicht als UUID-Segment im Namespace-Pfad** verwendet.

> **Hinweis:** Namespace-Pfade verwenden ausschließlich die `user_id` als UUID-Segment. Es gibt keine Namespaces der Form `vector.agent.<agent_id>.*` oder `vector.task.<task_id>.*`.

## Wildcards in Namespaces

In Read-Namespaces können Wildcards (`*`) verwendet werden:

```text
vector.global.*
vector.agent.${user_id}.*
```

Ein `*` am Ende wird als Präfix-Suche (`LIKE 'vector.global.%'`) ausgeführt und gibt alle passenden Sub-Namespaces zurück. Dies gilt sowohl für den automatischen Kontext-Abruf vor einem Run als auch für explizite Tool-Aufrufe (`memory-search`).

### Beispiel-Konfiguration

**Read Namespaces:**
```text
vector.agent.${user_id}.memory
vector.agent.${user_id}.howto
vector.global.business.projects
vector.global.ontheia.docs
```

**Write Namespace:**
```text
vector.agent.${user_id}.memory
```

**Allowed Write Namespaces (allowedWriteNamespaces):**
```text
vector.agent.${user_id}.memory
vector.agent.${user_id}.howto
```

## Metadaten & Steuerung

Beim Speichern von Informationen (manuell oder via Tool) können zusätzliche Steuerungsparameter angegeben werden:

- **Top-K:** Bestimmt, wie viele relevante Treffer aus dem Gedächtnis pro Anfrage an das LLM gesendet werden (Standard: 5, Max: 200).
- **TTL (ttl_seconds):** Bestimmt die Lebensdauer eines Eintrags in Sekunden. Nach Ablauf wird der Eintrag automatisch für die Suche ignoriert (Soft-Delete).
- **Tags:** Kommagetrennte Schlagworte (z. B. `rechnung, 2024, prioritär`), die eine spätere Filterung oder thematische Gruppierung ermöglichen.
- **Metadata (JSON):** Ein beliebiges JSON-Objekt für fortgeschrittene Filterungen (z. B. `{"kunde_id": 123, "status": "archiviert"}`).

## Automatisches Speichern (Auto-Memory-Write)

Nach jedem erfolgreichen Run schreibt Ontheia automatisch bis zu zwei Einträge in den konfigurierten Write-Namespace:

- **`run_input`**: Die letzte User-Anfrage (nur gespeichert wenn ≥ 80 Zeichen — kurze Befehle wie „zeige mails" werden ignoriert).
- **`run_output`**: Die Antwort des Agenten (immer gespeichert, wenn `allowWrite` aktiviert ist).

> **Hinweis:** Der Schwellwert von 80 Zeichen entspricht ca. 20 Tokens und stellt sicher, dass nur semantisch gehaltvolle Anfragen ins Memory einfließen.

## Tool-Zugriff (Schreibrechte für das LLM)

Unter "LLM Memory Tools" kann explizit gesteuert werden, ob die KI selbstständig Informationen speichern oder löschen darf.
- **Schreiben erlauben (Tool):** Aktiviert die Tools `memory-write`.
- **Löschen erlauben (Tool):** Aktiviert das Tool `memory-delete`.
- **Erlaubte Schreib-Namespaces:** Eine Liste von Patterns (Templates erlaubt), in die das LLM schreiben darf. Dies sollte aus Sicherheitsgründen restriktiver sein als der allgemeine Lesezugriff.
