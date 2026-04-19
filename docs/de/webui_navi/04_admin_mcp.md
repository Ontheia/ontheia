# Admin-Konsole › MCP-Server

**Pfad:** Avatar-Dropdown → Administration → MCP-Server

Tab-Leiste: **Generierung JSON** · **Konfiguration**

---

## Tab: Generierung JSON

Formularbasierter Assistent, der eine gültige `mcpServers`-JSON-Konfiguration erzeugt.

| Feld | Typ | Bedingung | Beschreibung |
| --- | --- | --- | --- |
| Server-Name | Text | immer | Interner Bezeichner des Servers (z. B. `filesystem`). |
| Verbindungstyp | Dropdown | immer | `Lokales Stdio (Prozess)` — startet einen lokalen Befehl. `Remote SSE (HTTP)` — verbindet sich mit einem HTTP-Endpunkt. |
| Endpoint-URL | Text | nur SSE | Vollständige URL des entfernten MCP-Servers (z. B. `http://localhost:8000/sse`). |
| Befehl | Text | nur Stdio | Auszuführendes Programm (z. B. `npx`). |
| Argumente | Text | nur Stdio | Leerzeichen-getrennte Argumente (z. B. `-y mcp-server-filesystem /mnt/docs`). |
| Umgebungsvariable (Key) | Text | nur Stdio | Name einer Umgebungsvariablen, die dem Prozess mitgegeben wird (z. B. `API_KEY`). |
| Umgebungsvariable (Wert) | Text | nur Stdio | Wert der Umgebungsvariablen. `secret:VAR_NAME` verweist auf ein serverseitiges Secret. |

Buttons: **[Konfiguration generieren]** — erstellt die JSON-Vorschau. **[Zurücksetzen]** — setzt alle Felder auf Standardwerte zurück.

Die **Vorschau der generierten Konfiguration** zeigt das resultierende JSON, das automatisch in den Tab „Konfiguration" übernommen wird.

---

## Tab: Konfiguration

Direktbearbeitung des `mcpServers`-JSON und Lifecycle-Verwaltung aller gespeicherten Server.

**Konfigurations-Formular (oberer Bereich):**

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Server-Name | Text | Name, unter dem die Konfiguration gespeichert wird. Muss dem Schlüssel im JSON entsprechen. |
| Auto-Start | Checkbox | Startet den Server automatisch, wenn der Host-Prozess startet. |
| JSON-Textbereich | Code-Editor | Vollständiges `mcpServers`-JSON. Manuelle Änderungen werden beim Speichern validiert. |

Buttons: **[Konfiguration speichern]** · **[Validieren]** · **[Dry Run]** · **[Alle stoppen]**

**Gespeicherte MCP-Server (Akkordeon):**

Jeder gespeicherte Server wird als aufklappbarer Eintrag angezeigt. Im geöffneten Zustand sichtbar: Befehl, Letzter Start, Statuszeit, Validiert / Auto-Start und die Liste der verfügbaren Tools.

Aktionen pro Server: **Bearbeiten** (lädt Konfig in den Editor oben) · **Starten** (▶) · **Stoppen** (■) · **Löschen** (🗑).

**Temporäre Server:**

Listet laufende Server ohne gespeicherte Konfiguration. Nützlich für schnelle Tests. Aktion: **Stoppen**.
