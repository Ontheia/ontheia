# AI-Provider Konzept

AI-Provider bilden in Ontheia die Brücke zu den Large Language Models (LLMs). Ein Provider definiert **wie** und **wo** eine API angesprochen wird, während die zugehörigen Modelle festlegen, **welche** spezifische KI-Variante genutzt werden kann.

## Abstraktionsschicht

Ontheia nutzt eine interne Abstraktionsschicht, die es ermöglicht:
- Verschiedene Provider (OpenAI, Anthropic, lokale LLMs) einheitlich anzusprechen.
- Eigene Endpunkte für Tests oder Proxies (z. B. Azure OpenAI) zu konfigurieren.
- Authentifizierungs-Details zentral zu verwalten.

## Hierarchie

1. **Provider:** Die technische Basis (z. B. "OpenAI Produktion").
2. **Modell:** Die verfügbaren Einheiten dieses Providers (z. B. `gpt-5`, `gpt-5-turbo`).
3. **Zuweisung:** Agenten werden nicht direkt an eine URL, sondern an eine Kombination aus Provider und Modell gebunden.
