# Task-Konzept in Ontheia

Während ein Agent die grundlegende Identität und AI-Bindung (Provider/Modell) vorgibt, definiert ein **Task** die konkrete Mission.

## Die Hierarchie

Ein Agent kann mehrere Tasks besitzen. Ein Task wiederum bündelt spezifische Instruktionen, die dem Agenten erst beim Start eines Runs übergeben werden.

- **Agent:** "Wer bin ich?" (z. B. ein Senior Entwickler mit Zugriff auf das Dateisystem).
- **Task:** "Was tue ich gerade?" (z. B. "Code-Review durchführen" oder "Dokumentation schreiben").

## Vorteile der Aufteilung

1. **Wiederverwendbarkeit:** Ein Task "Datenanalyse" kann verschiedenen Agenten (mit unterschiedlichen LLMs) zugewiesen werden.
2. **Präzision:** Durch den eng gefassten Task-Kontext sinkt die Wahrscheinlichkeit, dass die KI vom Thema abweicht (Halluzinationen werden reduziert).
3. **Strukturierung:** Nutzer sehen in der WebUI klare Anwendungsfälle statt einer leeren Prompt-Eingabe.
