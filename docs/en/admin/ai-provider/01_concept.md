# AI Provider Concept

AI Providers in Ontheia form the bridge to Large Language Models (LLMs). A provider defines **how** and **where** an API is addressed, while the associated models determine **which** specific AI variant can be used.

## Abstraction Layer

Ontheia uses an internal abstraction layer that makes it possible to:
- Address different providers (OpenAI, Anthropic, local LLMs) uniformly.
- Configure separate endpoints for tests or proxies (e.g., Azure OpenAI).
- Centrally manage authentication details.

## Hierarchy

1. **Provider:** The technical basis (e.g., "OpenAI Production").
2. **Model:** The available units of this provider (e.g., `gpt-4o`, `gpt-3.5-turbo`).
3. **Assignment:** Agents are not bound directly to a URL, but to a combination of provider and model.
