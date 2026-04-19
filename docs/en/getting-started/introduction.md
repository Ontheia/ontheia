---
title: Introduction
description: What is Ontheia and what is it used for?
---

# What is Ontheia?

**Ontheia is a self-hosted AI agent platform.** It turns isolated language models into integrated, action-capable assistants — agents that don't just answer questions, but take on tasks, control systems, and continuously learn. All of this runs exclusively on your own infrastructure.

At the center is a **master planner** that analyzes complex requests, breaks them into subtasks, and delegates them to an orchestra of specialized agents. Each specialist has its own tools, decision logic, and persistent memory.

---

## The Challenge

Classic chat solutions like ChatGPT are powerful — but isolated.

- They don't know your internal data or systems.
- They can't take actions (e.g. create a ticket, book an appointment).
- They "forget" everything once the chat ends.
- Data privacy and sovereignty are often opaque.

**Ontheia solves these problems through orchestration:** agents that act instead of just answering, persistent memory that survives across sessions, and a fully on-premise infrastructure that keeps your data under your control.

---

## Core Principles

| Principle | Meaning |
|---|---|
| **Data sovereignty** | Your data never leaves your servers. All models, agents, and storage run on-premise or in your private cloud. |
| **Vendor independence** | Claude, ChatGPT, Gemini, Ollama, Mistral — Ontheia supports any LLM provider through a unified interface. |
| **Open standards** | Full integration of the **Model Context Protocol (MCP)**. External tools and systems are connected via isolated MCP servers. |
| **Open source** | Licensed under AGPL-3.0, transparent and extensible. |

---

## What Can I Use Ontheia For?

### 1. Personal AI Assistant

Ontheia coordinates your daily work. Typical requests the master planner executes fully autonomously:

- *"Show me the most important emails from today and automatically move spam."*
- *"Create an appointment for Thursday at 3 PM, check for conflicts first."*
- *"Write a summary of the last three meeting notes and generate a PDF."*
- *"What's on my task list today? Highlight the urgent ones."*
- *"Search the web for the current project status and create a new note with the findings."*

The master planner automatically calls the responsible specialists — without you needing to know which agent has which capability.

---

### 2. Specialized Agents in Action

The following agents illustrate exemplarily what is possible with Ontheia. Each agent has a clearly defined area of responsibility, optimized workflows (SOPs), and direct access to the relevant tools via MCP servers.
(Ontheia does not ship pre-configured agents or MCP servers — it provides the platform to define any agents you need. Each agent receives a system prompt, a selection of MCP tools, and optional visibility rules. What an agent can do is entirely up to you.)

#### Email — Agent_Email
Intelligent management of the email inbox. The agent reads, sends, and organizes emails autonomously. It automatically detects spam, immediately moves obvious junk mail, and flags suspicious messages for manual review. File attachments can be sent directly from the cloud storage.

#### Calendar & Appointments — Agent_Calendar
Strategic scheduling with conflict detection and buffer management. The agent automatically checks availability before each booking, keeps 30-minute buffers between appointments, and suggests alternative time slots when conflicts arise. Preferred times and habits are permanently stored in long-term memory.

#### Notes & Knowledge — Agent_Notes
Structured knowledge management (e.g. in Nextcloud Notes). The agent searches for existing entries before creating new notes, creates cleanly formatted Markdown documents, appends log entries with timestamps, and maintains a consistent folder structure.

#### Tasks & To-Dos — Agent_Todo
Complete task management. The agent creates prioritized tasks, manages status transitions (Open → In Progress → Done), and keeps track of deadlines.

#### File Management — Agent_Files
Intelligent file manager for cloud storage. Finds files via semantic search, moves, reads, or archives documents, and proactively maintains folder structure. Before bulk operations, it creates a safe plan in temporary memory.

#### PDF Export — Agent_md2pdf
Conversion of Markdown documents and notes into professional PDFs. Particularly useful after creating reports, proposals, or summaries.

#### Contacts & Addresses — Agent_Contacts
Management of the address book. The agent checks for duplicates before creating entries, keeps phone numbers in international format, and updates contact data completely and consistently.

#### Kanban & Project Boards — Agent_Kanban
Management of Kanban cards and boards. Suitable for project planning, backlog management, and visual task coordination.

#### Document Archive — Agent_Paperless
Integration with Paperless-ngx for digital document management. Invoices, contracts, and receipts are automatically categorized, tagged, and made searchable.

#### Tables & Data — Agent_Tables
Processing of tabular data. The agent creates, reads, and analyzes structured datasets — from simple lists to complex evaluations.

#### Web Research — Agent_Web
Precise internet research with complementary tools: Brave Search and Exa for current information, direct fetch for simple pages, Playwright browser for JavaScript-heavy or interactive websites. All sources are fully referenced at the end of the response.

#### Strategy & Analysis — Agent_Strategy
The thinker of the team. For complex problems, conflicting information, and decision proposals, this agent uses Sequential Thinking — a structured method for step-by-step problem decomposition — and returns a clear analysis with options and a recommendation.

#### Terminal & Commands — Agent_Command
Direct shell interaction on the server. Suitable for system administration, scripting, and automation tasks requiring command-line access.

#### Database & Events — Agent_Postgres
Direct database queries and system analysis via PostgreSQL. For technical users, debugging, and system state analysis.

---

### 3. Multi-Agent Workflows (A2A Delegation)

The core of Ontheia is **agent-to-agent delegation**. The master planner autonomously coordinates multiple specialists in a logical chain:

**Example:** *"Write a summary of the latest emails into a new note and create a PDF."*

1. Master calls **Agent_Email** → receives the last 5 emails
2. Master analyzes the content
3. Master calls **Agent_Notes** → creates note "Email Summary" with the content
4. Master calls **Agent_md2pdf** → converts the note to a PDF
5. Master reports back: task fully completed.

Delegation is possible up to 5 levels deep. The full context is seamlessly passed between agents. No intermediate step needs to be triggered manually.

---

### 4. Automated Workflows with the Chain Engine

For recurring, multi-step processes, Ontheia offers the **Chain Engine** — a visually configurable workflow designer.

- Define chains in which agents work hand in hand.
- Example: *Step 1 (Research)* → *Step 2 (Analysis)* → *Step 3 (Write Report)* → *Step 4 (Send PDF)*
- Chains can be started manually or triggered automatically.
- Each step can use the output of the previous step as input.

---

### 5. Scheduled Automation (Cron Jobs)

Agents and chains can be executed on a schedule — fully without manual intervention.

- **Daily briefing:** Every morning at 7:30 AM, an agent automatically summarizes new emails, the day's appointments, and open tasks, and sends an overview to the chat.
- **Weekly reports:** Every Friday, a status report is automatically generated from project data, notes, and calendar entries, and saved as a PDF.
- **Regular synchronization:** Hourly or daily database queries, web research, or system checks.
- **Maintenance tasks:** Automatic cleanup of temporary memory namespaces, archiving of old entries.

Cron jobs are configured using standard cron syntax and can trigger both individual agents and complete chain workflows.

---

### 6. Long-Term Memory (Vector Memory)

Ontheia never forgets — unless you want it to.

The memory system is based on semantic vector search (pgvector). With every request, relevant context knowledge is automatically retrieved from the appropriate namespace. Agents write new insights back independently.

#### Memory Namespaces (Architecture)

| Namespace | Content |
|---|---|
| `vector.agent.{user_id}.memory` | Automatic chat recordings (read only) |
| `vector.agent.{user_id}.howto` | Learned procedural knowledge, SOPs, technical guides |
| `vector.agent.{user_id}.preferences` | Facts about the user (preferences, habits, contacts) |
| `vector.user.{user_id}.ideas` | Personal ideas and brainstorming notes |
| `vector.user.{user_id}.archive` | Strictly personal documents and historical data |
| `vector.global.privat.recipes` | Shared recipe database |
| `vector.global.privat.projects` | Shared personal projects, travel plans |
| `vector.global.business.projects` | Active business projects (documents, briefings) |
| `vector.global.business.billing` | Quotes, invoices, financial data |
| `vector.global.business.marketing` | Marketing strategies, campaign assets |
| `vector.global.business.crm` | Customer history and contact notes |
| `vector.global.knowledge.llm.api-docs` | Technical documentation and API specifications |
| `vector.global.ontheia.docs` | Internal Ontheia architecture documentation |
| `vector.global.ontheia.prompts` | System prompts and agent specifications |
| `vector.global.ontheia.temp` | Short-term storage for intermediate steps (with TTL) |
| `vector.global.ontheia.feedback` | Error logs and improvement suggestions |

Tenant separation is enforced by Row-Level Security (RLS) directly in the database engine: user A never sees the data of user B.

---

### 7. MCP Integration (Model Context Protocol)

Ontheia is fully built on the open MCP standard. Any external system can be connected as an MCP server:

- **Nextcloud** — files, notes, calendars, contacts, tasks, boards
- **Email servers** — IMAP/SMTP via MCP email server
- **Databases** — PostgreSQL, SQLite, any SQL source
- **Web tools** — Brave Search, Fetch, Playwright, Exa
- **Document archive** — Paperless-ngx
- **AI tools** — Sequential Thinking, Memory
- **Custom** — Any HTTP API or local application can be implemented as an MCP server

Each MCP server runs in its own Docker container (rootless, without root privileges, read-only filesystem). The isolation protects the host system even if a server is compromised.

> **Claude Desktop compatibility:** The MCP server JSON format in Ontheia is compatible with Claude Desktop. Existing configurations can be imported directly. The JSON format is the default; alternatively, MCP servers can also be configured via the graphical form in the Admin Console.

---

### 8. Enterprise Use & Multi-Tenancy

Ontheia is designed from the ground up for multi-user operation:

- **RBAC** (Role Based Access Control): Admins and users have clearly separated permissions.
- **Agent visibility**: Agents can be public, visible to specific users, or private to the creator.
- **Audit logging**: Every action — chat message, tool call, memory access — is logged in a tamper-proof manner.
- **Row Level Security**: Data separation directly in the database. Backend programming errors cannot cause data leaks, as the database itself denies access.
- **Multiple AI providers**: Different teams can use different LLMs (Claude, GPT-4, local models) — all through the same platform.

---

### 9. Use Cases

#### Personal Productivity
A user delegates their entire office routine: checking emails, coordinating appointments, structuring notes, managing tasks — all in one chat interface, without switching between apps.

#### Knowledge Management
Internal documentation, policies, and handbooks are loaded into the vector store. Employees receive precise, source-referenced answers to questions like *"What is the onboarding process?"* — without hallucinations, as the model answers exclusively from stored knowledge.

#### Customer Service Automation
A support agent checks the status in the ERP system, compares errors with similar cases in memory, and creates ticket drafts. The human agent only needs to approve.

#### Software Development
A coding agent has access to the filesystem, Git, and database schema. Question: *"Why is the build failing?"* — Ontheia reads the logs, analyzes the relevant code, finds the error, and proposes a fix.

#### Document Workflows
Incoming documents (invoices, contracts) are automatically categorized via Paperless-ngx, stored in the billing namespace, and recorded in structured spreadsheets.

#### Strategy & Decision Support
Complex planning tasks are delegated to Agent_Strategie: the agent decomposes the problem with Sequential Thinking, searches relevant namespaces, and delivers a structured decision proposal with options and a clear recommendation.

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Web Interface                        │
│                   (React, TypeScript)                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                      API Backend                            │
│              (Node.js, TypeScript, Fastify)                 │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Master Agent │  │ Chain Engine │  │   Run Service    │   │
│  │  (Planner)   │  │  (Workflows) │  │  (Execution)     │   │
│  └──────┬───────┘  └──────────────┘  └──────────────────┘   │
│         │ delegate-to-agent                                 │
│  ┌──────▼───────────────────────────────────────────────┐   │
│  │              Specialized Agents                      │   │
│  │  Email │ Calendar │ Notes   │ Files    │ Web         │   │
│  │  Todo  │ Contacts │ Kanban  │ Strategy │ ...         │   │
│  └──────┬───────────────────────────────────────────────┘   │
└─────────┼───────────────────────────────────────────────────┘
          │ MCP
┌─────────▼───────────────────────────────────────────────────┐
│                   MCP Servers (Docker, rootless)            │
│  Nextcloud │ Email │ Brave Search │ Exa │ Playwright        │
│  PostgreSQL│ Memory │ Sequential Thinking │ Shell │ ...     │
└─────────────────────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────────┐
│           PostgreSQL + pgvector (Single Source of Truth)    │
│   Relational data: users, chats, agents, chains             │
│   Vector data: long-term memory (RLS-protected)             │
└─────────────────────────────────────────────────────────────┘
```

---

## Next Steps

- [Installation](/en/getting-started/installation) — set up Ontheia on your server in under 30 minutes
- [Configure agents](/en/admin/agents/05_agent_delegation) — define custom agents and delegation rules
- [Connect MCP servers](/en/admin/ai-provider/05_cli_provider) — integrate external tools
- [Chain Designer](/en/admin/chains/03_designer) — visually create automated workflows
