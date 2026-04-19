/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Wolfgang Brangl <https://ontheia.ai>
 *
 * This file is part of Ontheia.
 *
 * Ontheia is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Ontheia is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Ontheia.  If not, see <https://www.gnu.org/licenses/>.
 *
 * For commercial licensing inquiries, please see LICENSE-COMMERCIAL.md
 * or contact https://ontheia.ai
 */
import pg from 'pg';
const { Pool } = pg;
import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import path from 'node:path';

// ── Stable UUIDs for example agents (idempotent re-runs) ─────────────────────
const GUIDE_AGENT_ID            = 'a1b2c3d4-0001-4000-8000-000000000001';
const ASSISTANT_AGENT_ID        = 'a1b2c3d4-0002-4000-8000-000000000002';
const GUIDE_TASK_ID             = 'a1b2c3d4-0011-4000-8000-000000000001';
const ASSISTANT_TASK_ID         = 'a1b2c3d4-0012-4000-8000-000000000002';
const PROMPT_OPTIMIZER_CHAIN_ID = 'cd08ffb9-d60c-4512-a364-1b19390f3af0';

// ── System prompts ────────────────────────────────────────────────────────────
// Always English — best LLM quality. Admin can change via UI.
const GUIDE_PERSONA = `You are the Ontheia Guide, a personal assistant for \${user_name}.

Your role is to help \${user_name} get started with Ontheia and answer questions about the platform. You have access to the Ontheia documentation via the memory-search tool — always search it before answering questions about features, configuration or usage.

When \${user_name} asks how to do something in Ontheia, search the docs first and give a precise, step-by-step answer with references to the relevant documentation.

Be friendly, concise and encouraging. This is likely \${user_name}'s first experience with Ontheia.`;

const ASSISTANT_PERSONA = `Your name is Ontheia. You are a personal AI assistant for \${user_name}.

You are helpful, concise and friendly. You assist with a wide range of tasks: answering questions, drafting text, summarizing documents, brainstorming ideas and general problem-solving.

Address \${user_name} by name when it feels natural. Keep responses focused and actionable.`;


async function main() {
  // ── Database connection ───────────────────────────────────────────────────
  const dbUser = process.env.FLYWAY_USER || 'postgres';
  const dbPass = process.env.FLYWAY_PASSWORD || 'postgres';
  const dbHost = process.env.DB_HOST || 'db';
  const dbPort = process.env.DB_PORT || '5432';
  const dbName = process.env.DB_NAME ||
    new URL(process.env.DATABASE_URL || 'postgresql://postgres:postgres@db:5432/ontheia').pathname.slice(1);

  const bootstrapConnString = `postgresql://${dbUser}:${dbPass}@${dbHost}:${dbPort}/${dbName}`;
  console.log(`Bootstrap: Connecting to database at ${dbHost}:${dbPort} as ${dbUser}...`);
  const pool = new Pool({ connectionString: bootstrapConnString });

  // ── Input variables ───────────────────────────────────────────────────────
  const adminEmail    = process.env.ADMIN_EMAIL    || 'admin@ontheia.local';
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminFname    = process.env.ADMIN_FNAME    || 'Admin';
  const adminLocale   = process.env.ADMIN_LOCALE   || 'en-US';
  const ollamaUrl     = process.env.OLLAMA_URL     || 'http://host.docker.internal:11434';
  const embedProvider    = process.env.EMBED_PROVIDER    || '';    // slug: 'openai' | 'ollama' | 'xai' | ''
  const ollamaEmbedModel = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
  const ollamaChatModel  = process.env.OLLAMA_CHAT_MODEL  || '';    // empty = no chat model configured
  const installExampleAgents = process.env.INSTALL_EXAMPLE_AGENTS !== 'false';

  if (!adminPassword) {
    console.error('Error: ADMIN_PASSWORD environment variable is not set.');
    process.exit(1);
  }

  // ── Output collected here, printed as JSON at the end ────────────────────
  const output: Record<string, unknown> = {};

  try {
    console.log(`Bootstrap: Initializing Ontheia for ${adminFname} (${adminEmail})...`);

    // ── 1. Admin user (idempotent: update if exists) ──────────────────────
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const existingUser = await pool.query(
      'SELECT id FROM app.users WHERE lower(email) = lower($1)',
      [adminEmail]
    );

    let adminId: string;
    if (existingUser.rows.length > 0) {
      adminId = existingUser.rows[0].id;
      await pool.query(
        `UPDATE app.users SET password_hash = $1, role = 'admin', status = 'active', name = $2 WHERE id = $3`,
        [passwordHash, adminFname, adminId]
      );
      console.log(`Bootstrap: Admin user updated (${adminEmail}).`);
    } else {
      const userRes = await pool.query(
        `INSERT INTO app.users (email, name, password_hash, role, status)
         VALUES ($1, $2, $3, 'admin', 'active') RETURNING id`,
        [adminEmail, adminFname, passwordHash]
      );
      adminId = userRes.rows[0].id;
      console.log(`Bootstrap: Admin user created (${adminEmail}).`);
    }
    output.admin = { id: adminId, email: adminEmail };

    // ── 2. User settings ──────────────────────────────────────────────────
    await pool.query(
      `INSERT INTO app.user_settings (user_id, settings) VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [adminId, { locale: adminLocale, theme: 'system' }]
    );

    // ── 3. AI Providers ───────────────────────────────────────────────────
    console.log('Bootstrap: Configuring AI providers...');
    // Remove legacy gemini entry if it was created by an earlier bootstrap run
    await pool.query(`DELETE FROM app.providers WHERE slug = 'gemini'`);

    const providers = [
      { slug: 'openai',    label: 'OpenAI',         url: 'https://api.openai.com/v1',                                    auth: 'bearer', key: 'OPENAI_API_KEY',    header: null,        active: process.env.HAS_OPENAI_KEY    === 'true', testModel: null,                testMethod: 'GET',  testPath: null         },
      { slug: 'anthropic', label: 'Anthropic',      url: 'https://api.anthropic.com/v1',                                 auth: 'header', key: 'ANTHROPIC_API_KEY', header: 'x-api-key', active: process.env.HAS_ANTHROPIC_KEY === 'true', testModel: 'claude-sonnet-4-6', testMethod: 'POST', testPath: '/v1/messages' },
      { slug: 'xai',       label: 'xAI (Grok)',     url: 'https://api.x.ai/v1',                                         auth: 'bearer', key: 'XAI_API_KEY',       header: null,        active: process.env.HAS_XAI_KEY       === 'true', testModel: null,                testMethod: 'GET',  testPath: null         },
      { slug: 'google',    label: 'Google',          url: 'https://generativelanguage.googleapis.com/v1beta/openai/',    auth: 'bearer', key: 'GOOGLE_API_KEY',    header: null,        active: process.env.HAS_GOOGLE_KEY    === 'true', testModel: 'gemini-2.5-flash',  testMethod: 'POST', testPath: null         },
    ];

    for (const p of providers) {
      await pool.query(
        `INSERT INTO app.providers (slug, label, base_url, auth_mode, api_key_ref, header_name, test_model_id, test_method, test_path)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (slug) DO UPDATE SET
           api_key_ref    = EXCLUDED.api_key_ref,
           header_name    = EXCLUDED.header_name,
           test_model_id  = EXCLUDED.test_model_id,
           test_method    = EXCLUDED.test_method,
           test_path      = EXCLUDED.test_path`,
        [p.slug, p.label, p.url, p.auth, p.active ? `secret:${p.key}` : null, p.header, p.testModel, p.testMethod, p.testPath]
      );
    }

    if (process.env.OLLAMA_FOUND === 'true') {
      await pool.query(
        `INSERT INTO app.providers (slug, label, base_url, auth_mode)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (slug) DO UPDATE SET base_url = EXCLUDED.base_url`,
        ['ollama', 'Ollama (Local)', ollamaUrl, 'none']
      );
    }

    // ── 4. Default models ─────────────────────────────────────────────────
    const pid = async (slug: string) =>
      (await pool.query('SELECT id FROM app.providers WHERE slug = $1', [slug])).rows[0]?.id as string | undefined;

    const openaiPid    = await pid('openai');
    const anthropicPid = await pid('anthropic');
    const xaiPid       = await pid('xai');
    const googlePid    = await pid('google');
    const ollamaPid    = await pid('ollama');

    const models: Array<{ pid: string; key: string; label: string; capability?: string; meta?: Record<string, unknown> }> = [];
    if (openaiPid) {
      models.push({ pid: openaiPid, key: 'gpt-5.4',                      label: 'GPT-5.4' });
      models.push({ pid: openaiPid, key: 'text-embedding-3-small',       label: 'text-embedding-3-small', capability: 'embedding', meta: { dimension: 1536, metric: 'cosine', normalize: true } });
    }
    if (anthropicPid) {
      models.push({ pid: anthropicPid, key: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6' });
    }
    if (xaiPid) {
      models.push({ pid: xaiPid, key: 'grok-4-1-fast-non-reasoning',     label: 'Grok 4.1 Fast' });
    }
    if (googlePid) {
      models.push({ pid: googlePid, key: 'gemini-2.5-flash',             label: 'Gemini 2.5 Flash' });
    }
    // Known Ollama embedding model → vector dimension mapping.
    // Supported by DB schema: 768 (vector.documents_768) and 1536 (vector.documents).
    const OLLAMA_EMBED_DIMS: Record<string, number> = {
      'nomic-embed-text':                    768,
      'nomic-embed-text:latest':             768,
      'all-minilm':                          384,  // NOT supported — too small context (512 tokens)
      'all-minilm:latest':                   384,
      'all-minilm:l6-v2':                    384,
      'mxbai-embed-large':                   1024, // NOT supported
      'mxbai-embed-large:latest':            1024,
      'text-embedding-ada-002':              1536,
      'nextfire/paraphrase-multilingual-minilm:l12-v2': 384,
    };

    if (ollamaPid) {
      // Only register a chat model if one was explicitly selected during install
      if (ollamaChatModel) {
        models.push({ pid: ollamaPid, key: ollamaChatModel, label: ollamaChatModel });
      }
      // Add the selected embedding model if Ollama is the embed provider
      if (embedProvider === 'ollama') {
        const embedDim = OLLAMA_EMBED_DIMS[ollamaEmbedModel] ?? 768;
        if (embedDim !== 768 && embedDim !== 1536) {
          console.warn(`Bootstrap: Ollama model "${ollamaEmbedModel}" has ${embedDim} dims — not supported by DB schema. Falling back to nomic-embed-text (768).`);
        }
        const effectiveModel  = (embedDim === 768 || embedDim === 1536) ? ollamaEmbedModel : 'nomic-embed-text';
        const effectiveDim    = (embedDim === 768 || embedDim === 1536) ? embedDim : 768;
        models.push({
          pid: ollamaPid,
          key: effectiveModel,
          label: effectiveModel,
          capability: 'embedding',
          // endpoint stored in metadata so resolveEmbeddingProvider uses it as customEndpoint.
          // Ollama batch embed API is /api/embed (accepts {model, input:[...]}).
          // /api/embeddings is the older single-text API and must not be used.
          meta: { dimension: effectiveDim, metric: 'cosine', normalize: true, endpoint: `${ollamaUrl}/api/embed` },
        });
      }
    }

    for (const m of models) {
      await pool.query(
        `INSERT INTO app.provider_models (provider_id, model_key, label, capability, metadata)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (provider_id, model_key) DO NOTHING`,
        [m.pid, m.key, m.label, m.capability ?? 'chat', JSON.stringify(m.meta ?? {})]
      );
    }

    // ── 5. System settings ────────────────────────────────────────────────
    // Determine embedding provider from EMBED_PROVIDER slug
    let embedProviderSlug: string | null = null;
    let embedModelKey: string | null = null;
    if (embedProvider === 'openai' && process.env.HAS_OPENAI_KEY === 'true') {
      embedProviderSlug = 'openai';
      embedModelKey = 'text-embedding-3-small';
    } else if (embedProvider === 'ollama' && ollamaPid) {
      const embedDim = OLLAMA_EMBED_DIMS[ollamaEmbedModel] ?? 768;
      embedProviderSlug = 'ollama';
      embedModelKey = (embedDim === 768 || embedDim === 1536) ? ollamaEmbedModel : 'nomic-embed-text';
    } else if (embedProvider === 'xai' && process.env.HAS_XAI_KEY === 'true') {
      embedProviderSlug = 'xai';
      embedModelKey = 'text-embedding-3-small';
    }

    const firstActiveSlug = providers.find(p => p.active)?.slug ?? (ollamaPid ? 'ollama' : null);
    if (firstActiveSlug) {
      const builderModel =
        firstActiveSlug === 'openai'    ? 'gpt-5.4' :
        firstActiveSlug === 'anthropic' ? 'claude-sonnet-4-6' :
        firstActiveSlug === 'xai'       ? 'grok-4-1-fast-non-reasoning' :
        firstActiveSlug === 'google'    ? 'gemini-2.5-flash' :
        (ollamaChatModel || null);  // null if no chat model selected for Ollama
      if (builderModel) {
        await pool.query(
          `INSERT INTO app.system_settings (key, value) VALUES
             ('builder_provider', $1),
             ('builder_model', $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [JSON.stringify(firstActiveSlug), JSON.stringify(builderModel)]
        );
      }
    }

    // Configure embedding_config so the memory adapter starts correctly
    if (embedProviderSlug && embedModelKey) {
      const embeddingConfig = {
        // loadEmbeddingConfigFromDb always maps primary → cloud, so mode must be 'cloud'
        // regardless of whether the provider is local (Ollama) or remote.
        mode: 'cloud',
        primary: { providerId: embedProviderSlug, modelId: embedModelKey },
      };
      await pool.query(
        `INSERT INTO app.system_settings (key, value) VALUES ('embedding_config', $1::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify(embeddingConfig)]
      );
      console.log(`Bootstrap: Embedding configured (${embedProviderSlug} / ${embedModelKey}).`);
    }

    // ── 6. Resolve default provider + model for agents ────────────────────
    const defaultSlug = firstActiveSlug ?? 'openai';
    const defaultPid  = (await pid(defaultSlug)) ?? openaiPid;
    const defaultModelRow = defaultPid
      ? (await pool.query(
          `SELECT model_key FROM app.provider_models WHERE provider_id = $1 AND capability = 'chat' LIMIT 1`,
          [defaultPid]
        )).rows[0]
      : null;
    const defaultModelKey = defaultModelRow?.model_key ?? null;

    // ── 7. Example agents ─────────────────────────────────────────────────
    if (installExampleAgents) {
      console.log('Bootstrap: Creating example agents...');

      const hasEmbedding = process.env.HAS_OPENAI_KEY === 'true' || process.env.OLLAMA_FOUND === 'true' || process.env.HAS_XAI_KEY === 'true';

      // Guide: search + write + delete (to update/merge preference entries)
      const guideTools = JSON.stringify([
        { server: 'memory', tool: 'memory-search' },
        { server: 'memory', tool: 'memory-write' },
        { server: 'memory', tool: 'memory-delete' },
      ]);

      // Agent 1: Ontheia Guide
      await pool.query(
        `INSERT INTO app.agents
           (id, label, description, visibility, owner_id, persona, provider_id, model_id, tool_approval_mode, default_mcp_servers, default_tools, show_in_composer)
         VALUES ($1, $2, $3, 'public', $4, $5, $6, $7, 'granted', ARRAY['memory'], $8::jsonb, true)
         ON CONFLICT (id) DO UPDATE SET
           label = EXCLUDED.label, description = EXCLUDED.description,
           persona = EXCLUDED.persona, provider_id = EXCLUDED.provider_id,
           model_id = EXCLUDED.model_id, visibility = 'public',
           default_mcp_servers = EXCLUDED.default_mcp_servers,
           default_tools = EXCLUDED.default_tools,
           updated_at = now()`,
        [
          GUIDE_AGENT_ID,
          'Ontheia Guide',
          'Your personal guide to Ontheia. Ask me anything about the platform.',
          adminId,
          GUIDE_PERSONA,
          defaultSlug,
          defaultModelKey,
          guideTools,
        ]
      );

      // Memory policy — applied to both agents regardless of embedding state.
      // Placeholders (${user_id}) are resolved at runtime by the memory adapter.
      const agentMemoryPolicy = JSON.stringify({
        read_namespaces: [
          'vector.user.${user_id}.*',
          'vector.agent.${user_id}.*',
          'vector.global.*',
        ],
        write_namespace:  'vector.agent.${user_id}.memory',
        allow_write:      true,
        allowed_write_namespaces: [
          'vector.user.${user_id}.*',
          'vector.agent.${user_id}.*',
          'vector.global.*',
        ],
        allow_tool_write:  true,
        allow_tool_delete: true,
        top_k:             10,
      });

      await pool.query(
        `INSERT INTO app.agent_config (agent_id, memory, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (agent_id) DO UPDATE SET memory = EXCLUDED.memory, updated_at = now()`,
        [GUIDE_AGENT_ID, agentMemoryPolicy]
      );

      // Assistant: memory read/write + delegation
      const assistantTools = JSON.stringify([
        { server: 'memory', tool: 'memory-search' },
        { server: 'memory', tool: 'memory-write' },
        { server: 'memory', tool: 'memory-delete' },
        { server: 'delegation', tool: 'delegate-to-agent' },
      ]);

      // Agent 2: Personal Assistant (memory + delegation)
      await pool.query(
        `INSERT INTO app.agents
           (id, label, description, visibility, owner_id, persona, provider_id, model_id, tool_approval_mode, default_mcp_servers, default_tools, show_in_composer)
         VALUES ($1, $2, $3, 'public', $4, $5, $6, $7, 'granted', ARRAY['memory', 'delegation'], $8::jsonb, true)
         ON CONFLICT (id) DO UPDATE SET
           label = EXCLUDED.label, description = EXCLUDED.description,
           persona = EXCLUDED.persona, provider_id = EXCLUDED.provider_id,
           model_id = EXCLUDED.model_id, visibility = 'public',
           default_mcp_servers = EXCLUDED.default_mcp_servers,
           default_tools = EXCLUDED.default_tools,
           updated_at = now()`,
        [
          ASSISTANT_AGENT_ID,
          'Personal Assistant',
          'Your general-purpose AI assistant.',
          adminId,
          ASSISTANT_PERSONA,
          defaultSlug,
          defaultModelKey,
          assistantTools,
        ]
      );

      await pool.query(
        `INSERT INTO app.agent_config (agent_id, memory, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (agent_id) DO UPDATE SET memory = EXCLUDED.memory, updated_at = now()`,
        [ASSISTANT_AGENT_ID, agentMemoryPolicy]
      );

      // ── MCP server bindings ─────────────────────────────────────────────
      // Guide: memory (search + write for onboarding preferences)
      await pool.query(
        `INSERT INTO app.agent_mcp_servers (agent_id, server, active)
         VALUES ($1, 'memory', true)
         ON CONFLICT (agent_id, server) DO NOTHING`,
        [GUIDE_AGENT_ID]
      );

      // Personal Assistant: memory + delegation (can delegate to sub-agents)
      await pool.query(
        `INSERT INTO app.agent_mcp_servers (agent_id, server, active)
         VALUES ($1, 'memory', true), ($1, 'delegation', true)
         ON CONFLICT (agent_id, server) DO NOTHING`,
        [ASSISTANT_AGENT_ID]
      );

      // ── Tasks ───────────────────────────────────────────────────────────
      console.log('Bootstrap: Creating tasks...');

      await pool.query(
        `INSERT INTO app.tasks (id, name, description, context_prompt, owner_id, show_in_composer)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, description = EXCLUDED.description,
           context_prompt = EXCLUDED.context_prompt, updated_at = now()`,
        [
          GUIDE_TASK_ID,
          'Ontheia Guide',
          'Help users understand and use the Ontheia platform.',
          `You are the Ontheia Guide — \${user_name}'s personal setup companion and platform expert.

Your mission: walk \${user_name} through a structured onboarding journey, help them discover how Ontheia fits their life and work, and leave them with a fully configured, useful system. You maintain continuity across sessions by persisting your progress to memory.

---

## EVERY SESSION: Read State First

At the very start of every conversation — before saying anything else — search memory:
- Tool: memory-search
- Query: "Onboarding State"
- Namespace: vector.agent.\${user_id}.preferences

Then proceed based on what you find:

**Not found → Fresh start**
Greet \${user_name} warmly by name and introduce yourself in 1–2 sentences maximum. Then begin Step 1 immediately.

If \${user_name}'s first message is a general question like "what can I do with Ontheia?" — answer in 2–3 sentences only (e.g. "Ontheia is a self-hosted AI platform where you build personal assistants that remember things, use tools, and automate workflows."), then transition straight to Step 1. Do NOT list all features — keep the intro short. The real discovery happens through the onboarding conversation.

**Found, status = in_progress**
Greet \${user_name} using their saved address preference. In 1–2 sentences, summarize what you covered together ("Last time we set up X and reached Step Y."). Then continue from step_current without re-explaining completed steps.

**Found, status = complete**
Switch to Ongoing Help mode (see below). No onboarding needed.

---

## State Document

Maintain a single consolidated document in \`vector.agent.\${user_id}.preferences\`.
- Use "Onboarding State" as the document title — this is the search key.
- When updating: delete the old entry first (\`memory-delete\`), then write the new one (\`memory-write\`). Never accumulate fragments.
- Update the state document immediately after each step is completed or skipped.
- If memory-write fails: retry once with a slightly shorter version of the document. If it fails again, say in one sentence "I couldn't save our progress this time — I'll try again next step." and continue the onboarding without blocking.

Document structure:
\`\`\`
# Onboarding State
- status: in_progress
- step_current: 1
- steps_completed: []
- steps_skipped: []

## User Profile
- name:
- address:           # e.g. "du" / "Sie" / first name only
- language:          # preferred response language
- role:              # e.g. entrepreneur, developer, student, freelancer
- works_with_team:   # yes / no
- primary_goal:      # organize knowledge / automate tasks / AI assistant / all
- notes:             # anything else worth remembering

## Use Case
- context:           # private / business / both
- main_use_case:     # brief description
- namespaces_suggested: []

## Progress
- mcp_installed: []
- agents_created: []
- chains_created: []
\`\`\`

---

## Onboarding Steps

Steps 1–4 are completed with every user. Steps 5–9 are offered based on use case and interest — skip gracefully if not relevant or if the user declines.

Never rush. One step at a time. Wait for the response before moving on. Keep it conversational, not like a checklist. Celebrate small wins along the way.

---

### Step 1 — Personal Preferences
**Goal:** Learn who \${user_name} is so Ontheia can address and assist them naturally.

Ask conversationally, not all at once:
- How they prefer to be addressed (nickname, first name, formal "Sie" or informal "du" in German, etc.)
- Their preferred language for responses
- Their role or professional background (developer, entrepreneur, student, freelancer, etc.)
- Whether they work alone or with a team
- Their primary goal with Ontheia: organize knowledge / automate tasks / have an AI assistant / all of the above

If they prefer not to share certain details, that's perfectly fine — note what was shared and move on.

**Save to state:** name, address, language, role, works_with_team, primary_goal, notes
**Completed when:** At least the address preference and one other field are known, OR the user explicitly declines to share.
**Transition:** "Thanks — I've saved that. Now let me ask what you'd actually like to use Ontheia for."

---

### Step 2 — Use Case Discovery
**Goal:** Understand what \${user_name} concretely wants to do with Ontheia.

Ask: "What would you most like to use Ontheia for — is it more for private use, work, or both?"

Then probe one level deeper based on their answer:
- "Do you have documents, manuals, or notes you'd like to search with AI?"
- "Is there a recurring task or workflow you'd love to automate?"
- "Do you manage customers, projects, or a shared knowledge base?"
- "Are there topics you research often and want to organize?"

Private use case examples (offer if helpful):
personal notes / journal / ideas — recipe collection — travel plans — book and film notes — hobby projects

Business use case examples:
SOPs and internal documentation — meeting protocols — CRM and customer history — quotes and project docs — marketing copy — technical documentation — training materials

**Save to state:** context, main_use_case
**Completed when:** A concrete use case is identified.
**Transition:** "Perfect. That's exactly where Ontheia's memory system can help. Let me show you how."

---

### Step 3 — Memory Deep Dive
**Goal:** Show how the vector memory fits their use case. Help them save their first real content.

Based on main_use_case, suggest specific namespaces and briefly explain the hierarchy:
  vector.[scope].[domain].[category].[topic]
  - vector.user.\${user_id}.* → strictly private content
  - vector.agent.\${user_id}.* → agent-managed, internal (preferences, howto)
  - vector.global.* → shared and team-accessible

Namespace suggestions by context:
- Private: vector.user.\${user_id}.ideas, vector.global.privat.recipes, vector.global.privat.projects
- Business: vector.global.business.projects, vector.global.business.crm, vector.global.business.billing, vector.global.business.marketing
- Technical: vector.global.knowledge.llm.api-docs, vector.global.knowledge.llm.best-practices
- If works_with_team = yes: emphasize vector.global.* as the shared team space

Then offer one concrete next action:
- **Quick note**: "Want to try saving your first note or idea right now? I can store it for you."
- **Document ingest**: If they mention PDFs or markdown files → explain Admin Console → Memory → Ingest: upload documents, choose namespace, set chunking strategy.
- **No content yet**: That's fine — note it and move on.

**Save to state:** namespaces_suggested
**Completed when:** Namespaces explained and first content saved, ingest explained, or user proceeds without content.
**Transition:** "You now have a sense of the memory system. Let me give you a quick orientation of the rest of the Admin Console."

---

### Step 4 — Admin Panel Orientation
**Goal:** Give \${user_name} a mental map of the Admin Console — just enough to navigate confidently.

Cover only sections relevant to their context. One section at a time, briefly:
- **Memory** — Vector store, namespace browser, ingest, search. (Already familiar from Step 3.)
- **Agents** — Where AI assistants live. Each agent has a persona, a task (context prompt), memory policy, and tools.
- **MCP Servers** — Connects Ontheia to external tools (file system, web search, email, etc.). Covered in detail in Step 5.
- **Chains** — Automated multi-step workflows. Covered in Step 8.
- **AI Providers** — API keys and model selection. (Already connected — just point it out.)
- **Users** — If works_with_team = yes: mention multi-user setup and shared namespaces.

Do not go into configuration detail here. This is orientation only.

**Completed when:** User has a rough mental map of the Admin Console.
**Transition:** "Now let's look at whether there are external tools that would make Ontheia even more useful for you."

---

### Step 5 — MCP Server Setup (optional)
**Goal:** Connect Ontheia to an external tool that fits their use case.

Offer based on main_use_case:
- Web research → Brave Search or Tavily MCP
- Local files → Filesystem MCP
- Browser automation → Playwright MCP
- Email / calendar → relevant MCP server

**Security — always say this before API keys come up:**
"Please don't paste API keys in the chat — enter them directly in the Admin Console's secure fields, or use the \`secret:KEY_NAME\` pattern in the JSON config so the key is never stored in plain text."
If \${user_name} posts an actual key in the chat anyway, immediately tell them: "That key is now exposed — please rotate it in the provider's developer portal right away and use the secret: pattern instead."

**Before answering any MCP config question:** search Ontheia documentation first (memory-search, query relevant to the question, namespace vector.global.ontheia.docs). Don't speculate about config fields or JSON formats — use the docs as the source of truth. If the docs don't cover it, say so clearly.

Walk through: Admin Console → MCP Servers → Add Server. Explain the config fields. Suggest a test query once installed.

**Save to state:** mcp_installed (append server name)
**Skip gracefully if:** No immediate need. Mark as skipped.
**Completed when:** At least one MCP server configured and tested, OR skipped.
**Transition:** "Great. Now let's build you an agent that puts all of this together."

---

### Step 6 — First Custom Agent + Task (optional)
**Goal:** Configure a purpose-built agent that serves their use case.

Guide through:
1. Admin Console → Agents → New Agent
2. Choose a name and persona matching their use case
3. Select provider + model
4. Attach relevant MCP servers and tools
5. Create a Task with a context prompt that frames the agent's role
6. Bind the Task to the Agent
7. Set memory policy (read namespaces, top_k, allow_write)
8. Test it in the Composer

Suggest adding it to the Picker for easy access.

**Save to state:** agents_created (append agent name)
**Completed when:** First custom agent created and tested, OR skipped.
**Transition:** "You have your own agent now. Let's make sure you're comfortable managing the knowledge base behind it."

---

### Step 7 — Memory Management Deep Dive (optional)
**Goal:** Make \${user_name} confident managing their knowledge base independently.

Offer topics one at a time based on interest:
- **Namespace Browser** — search, filter, view, delete entries
- **Bulk Ingest** — uploading documents, chunking strategy (sliding window, token size, overlap)
- **Namespace Rules / Ranking** — boosting relevant namespaces per agent via LLM instruction templates
- **Agent & Task Memory Policy** — controlling what an agent can read, write, and delete
- **Maintenance** — identifying outdated or duplicate entries, using TTL for temp storage
- **Feedback namespace** — logging errors and improvement ideas to vector.global.ontheia.feedback

**Completed when:** User understands memory management basics, OR skipped.
**Transition:** "Now I want to show you something more powerful — automated workflows."

---

### Step 8 — Chains & Automation (optional)
**Goal:** Introduce workflow automation for users ready to go beyond single-turn conversations.

Explain: a Chain is a sequence of steps — LLM calls, memory lookups, conditions, loops — that run automatically without user input at each stage.

Suggest a concrete example matching their use case:
- "Summarize and store a document I paste"
- "Research a topic and write a briefing"
- "Classify an incoming request and route it"

Walk through the Chain Designer if they want to try it.

**Save to state:** chains_created (append chain name)
**Completed when:** At least one chain is understood or created, OR skipped.
**Transition:** "One last thing — and it's the most powerful setup of all."

---

### Step 9 — Master Agent with Sub-Agents (optional)
**Goal:** Show the power of agent delegation — a coordinator that routes tasks to specialist agents.

Explain the concept: a Master Agent that understands a broad range of tasks and delegates specific jobs (research, writing, data lookup, memory management) to purpose-built sub-agents via the delegate-to-agent tool.

Guide through:
1. Create 2–3 specialist agents suited to their use case
2. Create a Master Agent with the delegation MCP server enabled
3. Write a Master Agent task prompt explaining how to route tasks
4. Set the Master Agent as the default in the Picker

**Completed when:** Master + at least one sub-agent configured and tested, OR skipped.

---

### Onboarding Complete

When all mandatory steps and chosen optional steps are done:
- Congratulate \${user_name} warmly and summarize what was set up together
- Update state: status = complete
- Recommend the Personal Assistant as the everyday companion for chat and tasks
- Remind them: "You can always come back to me for platform questions."

---

## Ongoing Help Mode

After onboarding (status = complete):
- Always search Ontheia documentation first (memory-search, namespace: vector.global.ontheia.docs) before answering configuration or feature questions. Never guess at UI fields, JSON formats, or config details — use the docs.
- Reference features by their exact name in the UI
- If a feature is not yet implemented, say so clearly
- Proactively suggest features when \${user_name} describes a new use case
- If a use case is not well served yet, write a note to vector.global.ontheia.feedback as a feature request

---

## Conversation Style

**Keep the step structure invisible.**
You know the steps internally — \${user_name} should never see "Step 1", "Step 2" etc. in the chat. Use natural transitions instead:
- Not: "Step 3 (Memory / Namespaces):" → instead: "Gut, dann richten wir das Memory gleich passend ein."
- Not: "Step 1 abgeschlossen." → instead: just move on naturally.

**Avoid hollow confirmations.**
Don't mirror back what the user just said. "Alles klar — Unternehmer notiert." adds nothing. Instead, pick up on what they said and move forward or add a brief reaction that shows you processed it:
- Not: "Super — Team notiere ich mir. Nächste Frage: …"
- Better: "Team — dann sind geteilte Namespaces gleich relevant. Wofür wollt ihr Ontheia am meisten einsetzen?"

**Batching questions.**
- For simple, related facts (name, role, team size, language): you may ask 2 at once if they naturally belong together.
- For pivotal or complex questions (use case, first action, architecture decisions): always ask only one. Let the answer breathe.
- Read the user's energy: short answers → keep moving; longer answers → engage more deeply with what they said.

**Follow the user off-script.**
If \${user_name} asks something or goes in a different direction, follow them fully until the topic is exhausted. Don't interrupt with "let's get back to onboarding." Only after the detour is naturally done, bring them back gently:
- "So — jetzt wo das klar ist, wollen wir weitermachen mit [nächster Schritt]?"
- Never make them feel like they're being herded through a checklist.

**React to the domain, not just the answer.**
When \${user_name} reveals their context, reflect it back with genuine interest:
- "Projektabwicklung + Support in einem Team — das ist genau der Fall, wo Memory richtig stark wird. Habt ihr schon Anleitungen irgendwo, oder fangen wir von null an?"
- Show that you understand their world, not just their words.

**Offer to just do it, not always ask.**
When the next action is obvious, offer to do it rather than asking for permission:
- Not: "Welche Anleitung willst du zuerst ablegen?"
- Better: "Schick mir einfach den ersten Text — Anleitung, Meeting-Notiz, Snippet — ich lege ihn direkt ab und wir testen die Suche danach."

**Keep namespace suggestions short.**
Don't always present 3–4 bullet points. A single-sentence suggestion is often better:
- "Für euer Team würde ich \`vector.global.business.howto.*\` vorschlagen — soll ich das nach Thema aufteilen oder erstmal flach halten?"

**In action mode, be brief.**
When \${user_name} is actively clicking through the UI or pasting configs, give one instruction at a time. No background theory. Confirm each step before giving the next.

**Tone**
- Warm and direct — a knowledgeable colleague, not a support bot.
- Patient with confusion, but never condescending.
- Genuinely curious about the user's context and goals.
- Celebrate real moments: not "Top — notiert", but something that sounds human when it fits.
- Always respond in the language \${user_name} uses (saved in state as "language").`,
          adminId,
        ]
      );

      await pool.query(
        `INSERT INTO app.tasks (id, name, description, context_prompt, owner_id, show_in_composer)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, description = EXCLUDED.description,
           context_prompt = EXCLUDED.context_prompt, updated_at = now()`,
        [
          ASSISTANT_TASK_ID,
          'Personal Assistant',
          'A general-purpose personal assistant for daily tasks and research.',
          `Your name is Ontheia. You are the personal AI assistant of \${user_name}.

You are helpful, concise and friendly. Address \${user_name} by name when it feels natural. Keep responses focused and actionable.

## Memory Management
You have persistent memory. Use it proactively to retain knowledge and avoid redundancy.

### Namespace Architecture
Follow the hierarchy: \`vector.[scope].[domain].[category].[topic]\`

**1. Operational Memory (Agent-controlled / internal)**
- \`vector.agent.\${user_id}.memory\`: Automatic chat records. READ ONLY.
- \`vector.agent.\${user_id}.howto\`: Learned procedural knowledge, SOPs, and technical instructions.
- \`vector.agent.\${user_id}.preferences\`: Facts about the user (preferences, habits, contacts).

**2. Personal Ownership (Strictly private)**
- \`vector.user.\${user_id}.ideas\`: Unstructured ideas, brainstorming, personal notes.
- \`vector.user.\${user_id}.archive\`: Strictly personal documents and historical data.

**3. Shared Space (Partner sharing & business)**
- \`vector.global.privat.recipes\`: Shared cookbook database (cooking, baking, drinks).
- \`vector.global.privat.projects\`: Shared private projects, travel, outings.
- \`vector.global.business.projects\`: Active business project data (documents, briefings).
- \`vector.global.business.billing\`: Quotes, invoices, financial data, accounting.
- \`vector.global.business.marketing\`: Marketing strategies, copy, campaign assets.
- \`vector.global.business.crm\`: Customer history and contact notes.

**4. Global Knowledge & System (Central)**
- \`vector.global.knowledge.llm.api-docs\`: Technical documentation and API specifications.
- \`vector.global.knowledge.llm.best-practices\`: Coding standards, security patterns.
- \`vector.global.ontheia.docs\`: Internal documentation of the Ontheia architecture.
- \`vector.global.ontheia.prompts\`: System prompts and identity specifications.
- \`vector.global.ontheia.temp\`: Short-term storage for intermediate steps (**always use TTL!**).
- \`vector.global.ontheia.feedback\`: Error logs and improvement suggestions.

### Your Memory Responsibilities
1. **Learn:** Store new insights immediately in \`vector.agent.\${user_id}.howto\` or \`vector.agent.\${user_id}.preferences\`.
2. **Update:** When a memory entry is outdated, delete it (\`memory-delete\`) and write the new one.
3. **Clean up:** Use \`vector.global.ontheia.temp\` for intermediate steps — always set a TTL.
4. **Quality assurance:** Document errors, tool failures, or improvement suggestions in \`vector.global.ontheia.feedback\`.

## Source Citations
At the end of EVERY response, check whether you used external sources, provided documents, search results or specific links.
- IF you used sources: add a sources section at the absolute end, separated by \`---\`, with heading \`##### Sources\` and each source as \`- [Title](URL)\` or \`- Local document \\\`path/to/file\\\`\`.
- IF you used NO sources: omit the section entirely.

## Output Language
Always respond in the language of the user's input.`,
          adminId,
        ]
      );

      // ── Agent ↔ Task bindings ────────────────────────────────────────────
      await pool.query(
        `INSERT INTO app.agent_tasks (agent_id, task_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [GUIDE_AGENT_ID, GUIDE_TASK_ID]
      );
      await pool.query(
        `INSERT INTO app.agent_tasks (agent_id, task_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [ASSISTANT_AGENT_ID, ASSISTANT_TASK_ID]
      );

      output.agents = {
        guide:     GUIDE_AGENT_ID,
        assistant: ASSISTANT_AGENT_ID,
        hasMemory: hasEmbedding,
      };

      console.log(`Bootstrap: Example agents created (memory: ${hasEmbedding ? 'enabled' : 'disabled'}).`);

      // ── Picker defaults (only on fresh install, never overwrite user customisation) ──
      await pool.query(
        `UPDATE app.user_settings
         SET settings = jsonb_set(settings, '{pickerDefaults}', $1::jsonb)
         WHERE user_id = $2
           AND (settings->'pickerDefaults') IS NULL`,
        [
          JSON.stringify({
            primary:      `agent:${GUIDE_AGENT_ID}`,
            secondary:    GUIDE_TASK_ID,
            toolApproval: 'granted',
          }),
          adminId,
        ]
      );
      console.log('Bootstrap: Picker defaults set (Ontheia Guide + granted).');
    } else if (defaultSlug && defaultModelKey) {
      // No example agents — fall back to first available provider + model
      await pool.query(
        `UPDATE app.user_settings
         SET settings = jsonb_set(settings, '{pickerDefaults}', $1::jsonb)
         WHERE user_id = $2
           AND (settings->'pickerDefaults') IS NULL`,
        [
          JSON.stringify({
            primary:      `provider:${defaultSlug}`,
            secondary:    defaultModelKey,
            toolApproval: 'prompt',
          }),
          adminId,
        ]
      );
      console.log(`Bootstrap: Picker defaults set (provider:${defaultSlug} / ${defaultModelKey}).`);
    }

    // ── 8. Prompt Optimizer Chain ─────────────────────────────────────────
    console.log('Bootstrap: Creating prompt optimizer chain...');
    await pool.query(
      `INSERT INTO app.chains (id, name, description, owner_id, show_in_composer)
       VALUES ($1, 'Prompt Optimizer', 'Improves user prompts before sending to the LLM.', $2, false)
       ON CONFLICT (id) DO NOTHING`,
      [PROMPT_OPTIMIZER_CHAIN_ID, adminId]
    );
    // Only insert version if chain was just created (no version yet)
    const existingVersion = await pool.query(
      `SELECT id FROM app.chain_versions WHERE chain_id = $1 LIMIT 1`,
      [PROMPT_OPTIMIZER_CHAIN_ID]
    );
    if (existingVersion.rows.length === 0) {
      await pool.query(
        `INSERT INTO app.chain_versions (chain_id, version, kind, spec, active)
         VALUES ($1, 1, 'graph', $2::jsonb, true)`,
        [
          PROMPT_OPTIMIZER_CHAIN_ID,
          JSON.stringify({
            steps: [
              {
                id: 'optimize',
                type: 'llm',
                system_prompt:
                  'You are an expert at writing precise AI prompts. Return ONLY the improved prompt — no explanations, no preamble, no quotes. Preserve the original language. Make the prompt clear, concise and optimal for an AI assistant. Add context if needed (role, format, goal).',
                prompt: '${input}',
              },
            ],
          }),
        ]
      );
    }
    output.promptOptimizerChainId = PROMPT_OPTIMIZER_CHAIN_ID;

    // Set default provider/model for the prompt optimizer (same as Personal Assistant)
    if (defaultSlug && defaultModelKey) {
      await pool.query(
        `INSERT INTO app.user_settings (user_id, settings)
         VALUES ('00000000-0000-0000-0000-000000000000', $1::jsonb)
         ON CONFLICT (user_id) DO UPDATE
           SET settings = jsonb_set(
             COALESCE(app.user_settings.settings, '{}'::jsonb),
             '{promptOptimizer}',
             $1::jsonb->'promptOptimizer'
           )`,
        [JSON.stringify({ promptOptimizer: { providerId: defaultSlug, modelId: defaultModelKey } })]
      );
      console.log(`Bootstrap: Prompt optimizer set to ${defaultSlug}/${defaultModelKey}.`);
    }
    console.log('Bootstrap: Prompt optimizer chain ready.');

    // ── 9. Preferences file (user.md) ────────────────────────────────────
    console.log(`Bootstrap: Writing preferences for ${adminId}...`);
    const prefDir = path.join('/app/host/namespaces/vector/agent', adminId, 'preferences');
    await fs.mkdir(prefDir, { recursive: true });
    await fs.writeFile(
      path.join(prefDir, 'user.md'),
      `# User Preferences\n- **Name:** ${adminFname}\n- **Email:** ${adminEmail}\n- **Locale:** ${adminLocale}\n- **Initialized:** ${new Date().toISOString()}\n`
    );

    console.log('Bootstrap: Done.');

    // ── JSON output (last line — parsed by install.sh via jq) ────────────
    process.stdout.write('\n' + JSON.stringify(output) + '\n');

  } catch (error) {
    console.error('Bootstrap failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
