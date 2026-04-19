# Audit-Log Referenz

Das Audit-Log ist das primäre Instrument zur Überwachung der Datensicherheit und Compliance im Ontheia-Gedächtnis. Jede Interaktion mit dem Vektorspeicher, die über die API oder interne Tools erfolgt, wird hier erfasst.

## 1. Protokollierte Aktionen

Das System unterscheidet zwischen verschiedenen Aktionstypen:

- **`read`**: Ein Lesezugriff (Suche) wurde durchgeführt.
- **`write`**: Neue Informationen wurden im Gedächtnis gespeichert.
- **`delete` / `soft_delete`**: Einträge wurden entfernt oder als gelöscht markiert.
- **`warning`**: Ein kritischer Vorfall, z. B. ein abgelehnter Zugriffsversuch durch RLS (Row Level Security).

## 2. Struktur der Einträge

Jeder Eintrag enthält neben dem Zeitstempel und dem Namespace ein `Detail`-Feld im JSON-Format.

### Auslöser (Triggers)
Das System markiert im `Detail`-Feld, wie der Zugriff zustande kam:
- **`auto_context: true`**: Das System hat automatisch vor dem Agenten-Lauf nach relevantem Wissen gesucht.
- **`tool_call: true`**: Der Agent hat explizit ein MCP-Werkzeug (`memory-search`, `memory-write`) aufgerufen.
- **`admin_actor_id`**: Ein Administrator hat über die Weboberfläche auf die Daten zugegriffen.

### Beispiel: Automatischer Lesezugriff
```json
{
  "run_id": "uuid...",
  "auto_context": true,
  "hit_count": 2,
  "top_k": 5
}
```

### Beispiel: Automatischer Schreibvorgang (Auto-Memory-Write)
```json
{
  "run_id": "uuid...",
  "auto_context": true,
  "items": 2
}
```

### Beispiel: Tool-basierter Schreibvorgang
```json
{
  "run_id": "uuid...",
  "tool_call": true,
  "items": 1,
  "agent_id": "uuid..."
}
```

## 3. Interpretation von Warnungen

Warnungen (`warning`) sollten vom Administrator regelmäßig geprüft werden. Sie treten in folgenden Szenarien auf:
1. **Fehlkonfiguration:** Ein Agent hat ein Namespace-Template, das auf Daten verweist, auf die der aktuelle Nutzer kein Recht hat.
2. **Manipulationsversuch:** Ein Nutzer oder ein kompromittierter Agent versucht gezielt, Namespaces anderer Mandanten anzusprechen.
3. **Admin-Zugriff (verweigert):** Ein Administrator versucht, auf einen nutzerbezogenen Namespace zuzugreifen, aber der Nutzer hat keine `allow_admin_memory`-Freigabe erteilt. → `warning` wird protokolliert.
   *(Wurde der Zugriff hingegen erlaubt, erscheint die Aktion `read` mit dem Feld `admin_actor_id` im Detail.)*

## 4. Aufbewahrung
Die Audit-Daten werden in der Tabelle `app.memory_audit` gespeichert. Es wird empfohlen, diese Tabelle bei sehr hoher Systemlast regelmäßig zu archivieren, um die Performance der Admin-Konsole zu erhalten.
