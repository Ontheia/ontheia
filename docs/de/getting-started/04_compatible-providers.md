---
title: "Kompatible AI-Provider"
---

Ontheia unterstützt jeden **OpenAI-kompatiblen Inference-Server** — lokal oder remote. Solange der Endpoint `/v1/chat/completions` implementiert, kann Ontheia damit kommunizieren.

## Lokale Provider (selbst-gehostet)

| Provider | Typ | Link |
|---|---|---|
| **Ollama** | Lokal, selbst-gehostet | [ollama.com](https://ollama.com) |
| **llama.cpp** | Lokal, selbst-gehostet | [github.com/ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) |
| **LM Studio** | Lokal, Desktop-App | [lmstudio.ai](https://lmstudio.ai) |
| **Jan** | Lokal, Desktop-App | [jan.ai](https://jan.ai) |
| **vLLM** | Selbst-gehostet, Produktion | [docs.vllm.ai](https://docs.vllm.ai) |

## Cloud-Provider

| Provider | Protokoll | Link |
|---|---|---|
| **Anthropic Claude** | Anthropic API | [anthropic.com](https://anthropic.com) |
| **OpenAI** | OpenAI API | [openai.com](https://openai.com) |
| **Google Gemini** | Gemini API | [ai.google.dev](https://ai.google.dev) |
| **xAI / Grok** | OpenAI-kompatibel | [x.ai](https://x.ai) |
| **Groq** | OpenAI-kompatibel | [groq.com](https://groq.com) |
| **DeepSeek** | OpenAI-kompatibel | [deepseek.com](https://deepseek.com) |
| **OpenRouter** | OpenAI-kompatibel | [openrouter.ai](https://openrouter.ai) |
| **Azure OpenAI** | OpenAI-kompatibel | [azure.microsoft.com](https://azure.microsoft.com/de-de/products/ai-services/openai-service) |
| **Mistral AI** | OpenAI-kompatibel ⚠ | [mistral.ai](https://mistral.ai) |

> **⚠ Mistral AI — eingeschränkte Tool-Kompatibilität:** Chat und Completion funktionieren zuverlässig. Tool Calling ist nicht vollständig OpenAI-kompatibel — parallele Tool Calls und einige Formatdetails können zu Fehlern führen. Empfohlen: `mistral-large` oder `mistral-small`, andere Modelle unterstützen Tool Calling möglicherweise nicht.

## Konfiguration in Ontheia

Für lokale OpenAI-kompatible Provider:

| Feld | Wert |
|---|---|
| **Base URL** | z.B. `http://localhost:11434/v1` (Ollama) oder `http://localhost:8080/v1` (llama.cpp) |
| **API Key** | Beliebiger Wert (wird ignoriert) |
| **Modell** | Modellname wie in der jeweiligen App angegeben |

## Hinweise zu den Providern

**Ollama** ist der einfachste Einstieg für lokale Modelle — Installation in einem Befehl, automatische GPU-Erkennung, große Modell-Bibliothek.

**llama.cpp** ist das Fundament hinter Ollama und vielen anderen Tools. Wer maximale Kontrolle über Quantisierung und Server-Parameter will, setzt direkt auf llama.cpp.

**LM Studio** und **Jan** bieten eine grafische Oberfläche für die Modellverwaltung und starten einen lokalen API-Server. Praktisch für Nutzer, die Ontheia als Agent-Layer über einer Desktop-App betreiben.

**vLLM** ist für Produktions-Deployments mit vielen gleichzeitigen Nutzern optimiert. Empfehlenswert wenn Ontheia im Unternehmen für mehrere Teams betrieben wird.

**OpenRouter** ist ein Aggregator — ein einziger API-Key gibt Zugriff auf Modelle von OpenAI, Anthropic, Google, Meta und vielen weiteren Anbietern.
