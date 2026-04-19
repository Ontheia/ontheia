# KI-Werkzeuge (Standard-Provider)

Hier legt der Administrator fest, welche AI-Modelle für systeminterne Werkzeuge verwendet werden sollen.

## 1. Prompt-Optimierer
Der Prompt-Optimierer verbessert Benutzeranfragen automatisch, bevor sie an den eigentlichen Agenten gesendet werden.
- **Konfiguration:** Auswahl von Provider (z. B. OpenAI) und Modell (z. B. GPT-4o).
- **Anforderung:** Da dieser Schritt der Qualitätssicherung dient, sollte hier ein leistungsfähiges Modell gewählt werden.

## 2. Agent-Builder
Der Agent-Builder unterstützt Administratoren und Nutzer beim Erstellen neuer Agenten-Definitionen und Task-Kontexten.
- **Konfiguration:** Auswahl von Provider und Modell.
- **Zweck:** Das Modell generiert basierend auf Kurzbeschreibungen komplexe System-Prompts und schlägt passende Tools vor.

---

### Hinweis zur Auswahl
Änderungen an diesen Providern werden sofort wirksam. Stellen Sie sicher, dass die gewählten Provider im Reiter **"AI-Provider"** korrekt konfiguriert und die zugehörigen API-Keys hinterlegt sind.
