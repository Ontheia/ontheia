---
title: "Compatible AI Providers"
---

Ontheia supports any **OpenAI-compatible inference server** — local or remote. As long as the endpoint implements `/v1/chat/completions`, Ontheia can communicate with it.

## Local Providers (self-hosted)

| Provider | Type | Link |
|---|---|---|
| **Ollama** | Local, self-hosted | [ollama.com](https://ollama.com) |
| **llama.cpp** | Local, self-hosted | [github.com/ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) |
| **LM Studio** | Local, desktop app | [lmstudio.ai](https://lmstudio.ai) |
| **Jan** | Local, desktop app | [jan.ai](https://jan.ai) |
| **vLLM** | Self-hosted, production | [docs.vllm.ai](https://docs.vllm.ai) |

## Cloud Providers

| Provider | Protocol | Link |
|---|---|---|
| **Anthropic Claude** | Anthropic API | [anthropic.com](https://anthropic.com) |
| **OpenAI** | OpenAI API | [openai.com](https://openai.com) |
| **Google Gemini** | Gemini API | [ai.google.dev](https://ai.google.dev) |
| **xAI / Grok** | OpenAI-compatible | [x.ai](https://x.ai) |
| **Groq** | OpenAI-compatible | [groq.com](https://groq.com) |
| **DeepSeek** | OpenAI-compatible | [deepseek.com](https://deepseek.com) |
| **OpenRouter** | OpenAI-compatible | [openrouter.ai](https://openrouter.ai) |
| **Azure OpenAI** | OpenAI-compatible | [azure.microsoft.com](https://azure.microsoft.com/en-us/products/ai-services/openai-service) |
| **Mistral AI** | OpenAI-compatible ⚠ | [mistral.ai](https://mistral.ai) |

> **⚠ Mistral AI — limited tool compatibility:** Chat and completions work reliably. Tool Calling is not fully OpenAI-compatible — parallel tool calls and some formatting details may cause errors. Recommended: `mistral-large` or `mistral-small`; other models may not support tool calling at all.

## Configuration in Ontheia

For local OpenAI-compatible providers:

| Field | Value |
|---|---|
| **Base URL** | e.g. `http://localhost:11434/v1` (Ollama) or `http://localhost:8080/v1` (llama.cpp) |
| **API Key** | Any value (ignored by local providers) |
| **Model** | Model name as shown in the respective app |

## Provider Notes

**Ollama** is the easiest starting point for local models — single-command install, automatic GPU detection, large model library.

**llama.cpp** is the inference engine behind Ollama and many other tools. Choose it directly when you need full control over quantization and server parameters.

**LM Studio** and **Jan** provide a graphical interface for model management and expose a local API server. Ideal for users who want to run Ontheia as an agent layer on top of a desktop app.

**vLLM** is optimized for production deployments with high concurrency. Recommended when running Ontheia for multiple teams in an enterprise environment.

**OpenRouter** is an aggregator — a single API key gives access to models from OpenAI, Anthropic, Google, Meta, and many other providers.
