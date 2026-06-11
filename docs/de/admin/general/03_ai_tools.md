# KI-Werkzeuge (Standard-Provider)

Hier legt der Administrator fest, welche AI-Modelle für systeminterne Werkzeuge verwendet werden sollen.

## 1. Prompt-Optimierer
Der Prompt-Optimierer verbessert Benutzeranfragen automatisch, bevor sie an den eigentlichen Agenten gesendet werden.
- **Konfiguration:** Auswahl von Provider (z. B. OpenAI) und Modell (z. B. GPT-5).
- **Vorbelegung:** Die Installation setzt Provider/Modell auf den Install-Default (gleicher Provider wie die Beispiel-Agenten); die zugehörige Chain bindet den Optimierungs-Schritt an den Personal Assistant.
- **Anforderung:** Da dieser Schritt der Qualitätssicherung dient, sollte hier ein leistungsfähiges Modell gewählt werden.

## 2. Kontext-Komprimierung (Rolling Summary)
Der Summarizer komprimiert ältere Chat-Verläufe automatisch, sobald der Kontext einen konfigurierten Token-Schwellenwert überschreitet. Dadurch bleibt der Chat auch bei sehr langen Gesprächen flüssig.
- **Konfiguration:** Auswahl von Provider, Modell, Token-Schwellenwert und Mindest-Klartextfenster (Standard: 20).
- **Vorbelegung:** Die Installation setzt Provider/Modell auf den Install-Default und den Token-Schwellenwert auf 8 000 — die Komprimierung ist damit ab Werk aktiv.
- **Anforderung:** Ein leistungsfähiges Modell verbessert die Summary-Qualität; ein schnelles und günstiges Modell reduziert die Latenz bei Komprimierungen.

Vollständige Beschreibung: [Kontext-Komprimierung](/de/admin/general/04_rolling_summary/)

---

### Hinweis zur Auswahl
Änderungen an diesen Providern werden sofort wirksam. Stellen Sie sicher, dass die gewählten Provider im Reiter **"AI-Provider"** korrekt konfiguriert und die zugehörigen API-Keys hinterlegt sind.
