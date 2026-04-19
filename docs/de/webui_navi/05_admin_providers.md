# Admin-Konsole › AI-Provider

**Pfad:** Avatar-Dropdown → Administration → AI-Provider

Tab-Leiste: **Provider** · **Modell** · **Embedding**

---

## Tab: Provider

Formular zum Anlegen oder Bearbeiten eines AI-Providers.

| Feld | Typ | Bedingung | Beschreibung |
| --- | --- | --- | --- |
| Provider ID | Text | immer | Eindeutiger interner Bezeichner (z. B. `openai`). Nach dem Anlegen nicht änderbar. |
| Anzeigename | Text | immer | Lesbarer Name, der in Dropdowns angezeigt wird. |
| Provider-Typ | Dropdown | immer | `HTTP API` — Verbindung über REST. `CLI` — nutzt ein lokales Kommandozeilenprogramm. |
| Base URL | Text | nur HTTP | Basis-URL der API (z. B. `https://api.openai.com`). |
| Test-Pfad | Text | nur HTTP | Pfad für den Verbindungstest (z. B. `/v1/models`). |
| Test-Methode | Dropdown | nur HTTP | `GET` oder `POST`. |
| Authentifizierung | Dropdown | nur HTTP | `Bearer Token`, `Custom Header`, `Query Parameter` oder `Ohne`. |
| API Key / Secret | Text | nur HTTP | API-Schlüssel oder Verweis auf ein serverseitiges Secret (`secret:KEY_NAME`). |
| Header-Name | Text | Auth = Custom Header | Name des HTTP-Headers (z. B. `X-API-Key`). |
| Parameter-Name | Text | Auth = Query Parameter | Name des URL-Query-Parameters (z. B. `api_key`). |
| Test-Modell-ID | Text | nur HTTP | Modell-ID für POST-Verbindungstests (z. B. `gpt-4o`). |
| OpenAI-kompatible API | Checkbox | nur HTTP | Markiert den Provider als OpenAI-kompatibel für die Modellabfrage. |
| CLI-Befehl | Text | nur CLI | Auszuführendes Programm (z. B. `gemini`). |
| CLI-Format | Dropdown | nur CLI | `Gemini`, `Claude` oder `Generic` — bestimmt die Ausgabe-Interpretation. |

Buttons: **[Verbindung testen]** · **[Provider speichern]** · **[Zurücksetzen]**

**Registrierte Provider (Akkordeon):**

Jeder Provider erscheint als aufklappbarer Eintrag mit: Verbindungsstatus, Base-URL, letztem Test-Zeitpunkt und registrierten Modellen mit Capabilities.

Aktionen: **Bearbeiten** · **Erneut testen** · **Composer-Sichtbarkeit umschalten** · **Löschen**.

---

## Tab: Modell

Formular zum manuellen Hinzufügen eines Modells zu einem bestehenden Provider.

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Provider wählen | Dropdown | Der Provider, dem das Modell zugeordnet wird. |
| Modell-ID | Text | Exakte Modell-Kennung wie von der API verwendet (z. B. `gpt-4o`). |
| Modell-Label | Text | Lesbarer Name, der in der Oberfläche angezeigt wird. |
| Capability | Dropdown | `Chat`, `Embedding`, `Text-to-Speech`, `Speech-to-Text` oder `Image`. |
| Metadaten (JSON) | Textarea | Optionales JSON für modellspezifische Einstellungen (z. B. `{"dimension": 1536}` für Embedding-Modelle). |

Button: **[Modell speichern]**

---

## Tab: Embedding

Konfiguriert, welche Provider und Modelle für Vektor-Embeddings (Memory-Suche) verwendet werden.

**Abschnitt: Primärer Embedding-Provider** — erforderlich für alle Memory-Schreibvorgänge und Suchen.

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Provider | Dropdown | Provider mit mindestens einem Modell der Capability `Embedding`. |
| Modell | Dropdown | Spezifisches Embedding-Modell innerhalb des gewählten Providers. |

**Abschnitt: Sekundärer Embedding-Provider** — optionaler Fallback (z. B. ein lokales Modell).

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| Provider | Dropdown | Fallback-Provider. |
| Modell | Dropdown | Fallback-Modell. |

**Abschnitt: Modus & Fallback**

| Feld | Typ | Optionen | Beschreibung |
| --- | --- | --- | --- |
| Modus | Dropdown | `Cloud (nur primär)`, `Lokal (nur sekundär)`, `Hybrid (primär + Fallback)` | Legt fest, welche Provider aktiv sind. |
| Bei Rate-Limit (429) | Dropdown | `Wiederholen`, `Lokal verwenden` | Aktion, wenn der primäre Provider HTTP 429 zurückgibt. |
| Bei Server-Fehler (5xx) | Dropdown | `Wiederholen`, `Lokal verwenden` | Aktion, wenn der primäre Provider HTTP 5xx zurückgibt. |

> Hat einen eigenen Button **[Embedding-Konfiguration speichern]**. Änderungen werden nach dem nächsten Server-Neustart wirksam.
