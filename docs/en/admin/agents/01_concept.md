# Agent Concept in Ontheia

An Agent in Ontheia is more than just a connection to an AI model. It represents a configured **AI identity (Persona)**, optimized for specific roles or tasks.

## Core Components of an Agent

1. **AI Binding:** Every Agent is permanently linked to an **AI Provider** and a **default model**. This ensures that the Agent always utilizes the appropriate "intelligence" for its role.
2. **Capabilities (Tools):** Through MCP Servers, the Agent gains access to tools that allow it to perform actions in the real world or retrieve data.
3. **Permissions:** An Agent defines who is allowed to use it and how strictly tool calls must be confirmed by the user.

## The Orchestrator Approach

Agents in Ontheia are "orchestrated." This means the host service monitors every step, filters communication through security policies, and manages access to the long-term memory (Memory).
