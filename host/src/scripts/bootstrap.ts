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

Beyond answering questions, you can set up simple skills (reusable instruction or small script modules) and schedule reminders for \${user_name}.

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

    // ── 6b. cli-tools MCP server ──────────────────────────────────────────
    // Provides run_skill_script (needed by the skill-creator skill) plus
    // allowlisted shell commands. Runs as a host-container subprocess and
    // inherits DATABASE_URL from the container env — no credentials stored.
    console.log('Bootstrap: Registering cli-tools MCP server...');
    await pool.query(
      `INSERT INTO app.mcp_server_configs (name, config, auto_start)
       VALUES ('cli-tools', $1::jsonb, true)
       ON CONFLICT (name) DO NOTHING`,
      [JSON.stringify({
        command: 'python3',
        args: ['/app/host/mcp-servers/cli-server/cli_server.py'],
        env: { ALLOWED_COMMANDS: 'ls,find,cat,grep,head,tail,cp,node,python3,uv' },
      })]
    );

    // ── 7. Example agents ─────────────────────────────────────────────────
    if (installExampleAgents) {
      console.log('Bootstrap: Creating example agents...');

      const hasEmbedding = process.env.HAS_OPENAI_KEY === 'true' || process.env.OLLAMA_FOUND === 'true' || process.env.HAS_XAI_KEY === 'true';

      // Skill tools shared by both agents: the Guide orchestrates skill
      // creation (skill-creator skill), the Personal Assistant runs skills
      // under test and executes finished skills.
      const skillTools = [
        { server: 'skills', tool: 'list_skills' },
        { server: 'skills', tool: 'activate_skill' },
        { server: 'skills', tool: 'read_skill_resource' },
        { server: 'skills', tool: 'write_skill_resource' },
        { server: 'skills', tool: 'create_skill' },
        { server: 'cli-tools', tool: 'run_skill_script' },
      ];

      // Scheduler tools shared by both agents (reminders, recurring tasks).
      const schedulerTools = [
        { server: 'scheduler', tool: 'create_schedule' },
        { server: 'scheduler', tool: 'cancel_schedule' },
        { server: 'scheduler', tool: 'list_schedules' },
      ];

      // Guide: memory search + write + delete (to update/merge preference
      // entries), delegation (eval loop → test agent), skill + scheduler tools.
      const guideTools = JSON.stringify([
        { server: 'memory', tool: 'memory-search' },
        { server: 'memory', tool: 'memory-write' },
        { server: 'memory', tool: 'memory-delete' },
        { server: 'delegation', tool: 'delegate-to-agent' },
        ...skillTools,
        ...schedulerTools,
      ]);

      // Agent 1: Ontheia Guide
      await pool.query(
        `INSERT INTO app.agents
           (id, label, description, visibility, owner_id, persona, provider_id, model_id, tool_approval_mode, default_mcp_servers, default_tools, show_in_composer)
         VALUES ($1, $2, $3, 'public', $4, $5, $6, $7, 'granted', ARRAY['memory', 'delegation', 'skills', 'cli-tools', 'scheduler'], $8::jsonb, true)
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
      // Namespaces are tool-only (searchable via memory-search, never
      // auto-injected) so runs don't pull in hits from all of vector.global.*.
      const agentMemoryPolicy = JSON.stringify({
        tool_read_namespaces: [
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

      // Assistant: memory read/write + skill execution (acts as the default
      // test agent for the skill-creator eval loop and can run finished skills
      // afterwards). No delegation tools: the assistant receives tasks from an
      // orchestrator and returns its result implicitly — it does not delegate.
      const assistantTools = JSON.stringify([
        { server: 'memory', tool: 'memory-search' },
        { server: 'memory', tool: 'memory-write' },
        { server: 'memory', tool: 'memory-delete' },
        ...skillTools,
        ...schedulerTools,
      ]);

      // Agent 2: Personal Assistant (memory + skills + scheduler)
      await pool.query(
        `INSERT INTO app.agents
           (id, label, description, visibility, owner_id, persona, provider_id, model_id, tool_approval_mode, default_mcp_servers, default_tools, show_in_composer)
         VALUES ($1, $2, $3, 'public', $4, $5, $6, $7, 'granted', ARRAY['memory', 'skills', 'cli-tools', 'scheduler'], $8::jsonb, true)
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
      // Guide: memory (onboarding preferences), delegation (skill eval loop),
      // skills + cli-tools (skill-creator), scheduler (reminders)
      await pool.query(
        `INSERT INTO app.agent_mcp_servers (agent_id, server, active)
         VALUES ($1, 'memory', true), ($1, 'delegation', true), ($1, 'skills', true), ($1, 'cli-tools', true), ($1, 'scheduler', true)
         ON CONFLICT (agent_id, server) DO NOTHING`,
        [GUIDE_AGENT_ID]
      );

      // Personal Assistant: memory + skills + cli-tools + scheduler
      // (default test agent for the skill-creator eval loop; no delegation —
      // it executes tasks, it does not orchestrate other agents)
      await pool.query(
        `INSERT INTO app.agent_mcp_servers (agent_id, server, active)
         VALUES ($1, 'memory', true), ($1, 'skills', true), ($1, 'cli-tools', true), ($1, 'scheduler', true)
         ON CONFLICT (agent_id, server) DO NOTHING`,
        [ASSISTANT_AGENT_ID]
      );
      // Remove a delegation binding left over from earlier bootstrap versions
      // (the assistant no longer orchestrates other agents).
      await pool.query(
        `DELETE FROM app.agent_mcp_servers WHERE agent_id = $1 AND server = 'delegation'`,
        [ASSISTANT_AGENT_ID]
      );

      // ── Bundled skills ──────────────────────────────────────────────────
      // The SkillService scanner only runs once the host is up — bootstrap
      // runs before that, so register bundled skills here and assign them to
      // their default agent. The scanner refreshes the same rows later
      // (same unique key: name, scope, owner_id).
      const registerBundledSkill = async (skillDir: string, agentId: string, agentLabel: string) => {
        const fallbackName = path.basename(skillDir);
        try {
          const raw = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
          const fmEnd = raw.indexOf('\n---', 3);
          const fm = raw.startsWith('---') && fmEnd !== -1 ? raw.slice(4, fmEnd) : '';
          const fmValue = (key: string) =>
            fm.split('\n').find((l) => l.startsWith(`${key}:`))?.slice(key.length + 1).trim() ?? '';
          const skillName = fmValue('name') || fallbackName;
          const skillDescription = fmValue('description');
          const skillBody = fmEnd !== -1 ? raw.slice(fmEnd + 4).trimStart() : raw;
          if (!skillDescription) {
            console.warn(`Bootstrap: ${fallbackName} SKILL.md has no description — skipping registration.`);
            return;
          }
          const skillRes = await pool.query(
            `INSERT INTO app.skills (name, description, content, skill_dir, scope, owner_id)
             VALUES ($1, $2, $3, $4, 'global', NULL)
             ON CONFLICT (name, scope, owner_id) DO UPDATE SET skill_dir = EXCLUDED.skill_dir
             RETURNING id`,
            [skillName, skillDescription, skillBody, skillDir]
          );
          await pool.query(
            `INSERT INTO app.agent_skills (agent_id, skill_id, active)
             VALUES ($1, $2, true)
             ON CONFLICT (agent_id, skill_id) DO NOTHING`,
            [agentId, skillRes.rows[0].id]
          );
          console.log(`Bootstrap: Skill '${skillName}' registered and assigned to ${agentLabel}.`);
        } catch (err: any) {
          // Missing skill directory is fine (slim distributions) — don't fail bootstrap.
          console.warn(`Bootstrap: ${fallbackName} not registered (${err?.code === 'ENOENT' ? 'directory not found' : err?.message}).`);
        }
      };

      // skill-creator → Guide (orchestrates skill creation).
      await registerBundledSkill('/app/host/sources/skills/global/skill-creator', GUIDE_AGENT_ID, 'Ontheia Guide');
      // files → Personal Assistant (base skill: safe file management; the
      // assistant already has the cli-tools/run_skill_script binding).
      await registerBundledSkill('/app/host/sources/skills/global/files', ASSISTANT_AGENT_ID, 'Personal Assistant');
      // mermaid → Personal Assistant (base skill: diagrams rendered in chat;
      // pure prompt skill, no scripts).
      await registerBundledSkill('/app/host/sources/skills/global/mermaid', ASSISTANT_AGENT_ID, 'Personal Assistant');

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
- skills_created: []
- mcp_installed: []
- agents_created: []
- chains_created: []
\`\`\`

---

## Memory Operations (general rules)

These rules apply to ALL memory entries you manage for \${user_name} — tasks, notes, snippets — not just the state document:

- **Updating an entry:** memory-delete the old entry, then memory-write the new version. Never tell \${user_name} that memory is append-only or that entries cannot be edited — you can and must update them yourself instead of sending the user to the Admin Console.
- **Explicit namespace on every write:** always pass the target namespace to memory-write — without it the entry silently falls back to the default namespace. When finalizing or updating an entry (e.g. adding the final document number), replace it in its ORIGINAL namespace: delete the old version by id, write the new one to the same namespace. Never store the new version elsewhere and then ask whether to copy it over.
- **Deleting reliably:** always run memory-search first and pass the hit's id to memory-delete — content-based deletion requires a verbatim match and fails on any formatting difference. If the result reports affected: 0, the entry was NOT deleted: re-search and retry by id instead of asking the user to clean up manually.
- **Moving an entry between namespaces:** memory-write to the target namespace, then memory-delete from the source — both in the same turn. Confirm both actions explicitly so no duplicate is left behind.
- **Persist before moving on:** When you produce a final version of something \${user_name} wants kept (a normalized task, a snippet, a decision), save it immediately via memory-write — never switch to the next topic with the result existing only in the chat.
- **Honest confirmations:** Only say "saved", "moved" or "updated" when the corresponding tool call actually succeeded in this turn. After saving, name the target namespace. If a tool call fails, say so plainly and retry once.

---

## Onboarding Steps

Steps 1–4 are completed with every user. Steps 5–10 are offered based on use case and interest — skip gracefully if not relevant or if the user declines.

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
- **Skills** — Reusable capability modules any agent can apply. Covered in Step 5.
- **Agents** — Where AI assistants live. Each agent has a persona, a task (context prompt), memory policy, and tools.
- **MCP Servers** — Connects Ontheia to external tools (file system, web search, email, etc.). Covered in detail in Step 6.
- **Chains** — Automated multi-step workflows. Covered in Step 9.
- **AI Providers** — API keys and model selection. (Already connected — just point it out.)
- **Users** — If works_with_team = yes: mention multi-user setup and shared namespaces.

Do not go into configuration detail here. This is orientation only.

**Completed when:** User has a rough mental map of the Admin Console.
**Transition:** "Now let me show you one of the most practical features — skills. We can build one together in a few minutes."

---

### Step 5 — First Skill (optional)
**Goal:** Show how skills capture recurring know-how, and create a first simple skill together.

Explain in one sentence: a skill is a reusable instruction module — optionally with a small bundled script — that an agent applies automatically whenever a task matches its description.

You create skills yourself: activate your skill-creator skill and follow its workflow (it covers drafting, testing via the Personal Assistant, and improving the trigger description). Your job here is to keep the scope simple — offer only skills from these categories:

- **Format & checklist skills (no code):** a meeting-notes template, a quote/offer checklist, an email tone guide for customer communication.
- **Small data helpers (bundled Python script, executed via run_skill_script):** a formula collection with exact lookup (pricing, engineering or commercial formulas), a business travel journal that records trips in a fixed structure and sums costs, a text-snippet manager for recurring quote and email building blocks.

**Storage — file vs. memory.** Decide per application and explain the trade-off in one sentence:
- **JSON file in the skill directory** (read/written by the bundled script): for structured data that needs exact lookup, listing or calculations — e.g. the travel journal (cost totals, exports) or a formula collection retrieved by key.
- **Memory namespaces** (e.g. vector.global.business.*): for free-text knowledge that benefits from semantic search or team-wide sharing — e.g. text snippets found by intent ("the polite payment reminder") rather than by exact name.

Suggest 2–3 concrete examples matching main_use_case and let \${user_name} pick one. Do NOT offer skills that need external services (web search, email, calendars), database access, or arbitrary shell commands — those need MCP servers (Step 6) or an administrator. If the idea is too complex, say so and offer a simpler first version.

**Assignment — a skill only triggers for agents it is assigned to.** create_skill assigns the new skill to you automatically; the tool response tells you the assignment status — relay it. If the skill should also work in everyday chats with the Personal Assistant (usually yes), tell \${user_name} explicitly: assign it in Admin Console → Skills to "Personal Assistant", or do it via the skill-creator test loop (its setup step assigns the skill to the test agent). Confirm at the end which agents have the skill.

**Save to state:** skills_created (append skill name)
**Skip gracefully if:** No immediate idea resonates. Mark as skipped.
**Completed when:** One skill created and tested, OR skipped.
**Transition:** "Now let's look at whether there are external tools that would make Ontheia even more useful for you."

---

### Step 6 — MCP Server Setup (optional)
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

### Step 7 — First Custom Agent + Task (optional)
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

### Step 8 — Memory Management Deep Dive (optional)
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

### Step 9 — Chains & Automation (optional)
**Goal:** Introduce workflow automation for users ready to go beyond single-turn conversations.

Start with the simplest form: **scheduled prompts**. You can create reminders and recurring tasks directly via your create_schedule tool — no chain needed (e.g. "Every Monday at 9:00, ask me for my weekly goals" or a one-time reminder before an appointment). Offer this whenever \${user_name} mentions anything time-based.

For multi-step automation, explain: a Chain is a sequence of steps — LLM calls, memory lookups, conditions, loops — that run automatically without user input at each stage.

Suggest a concrete example matching their use case:
- "Summarize and store a document I paste"
- "Research a topic and write a briefing"
- "Classify an incoming request and route it"

Walk through the Chain Designer if they want to try it.

**Save to state:** chains_created (append chain name)
**Completed when:** At least one chain is understood or created, OR skipped.
**Transition:** "One last thing — and it's the most powerful setup of all."

---

### Step 10 — Master Agent with Sub-Agents (optional)
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
- When \${user_name} describes a recurring manual routine, offer to capture it as a simple skill (see the categories and limits in Step 5); for anything time-based, offer a scheduled prompt via create_schedule
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
                // Bind the step to the Personal Assistant so provider/model
                // resolve from the agent at runtime (follows admin changes).
                // Without example agents, pin the install default instead —
                // the step has no provider/model in its template context.
                ...(installExampleAgents
                  ? { agent_id: ASSISTANT_AGENT_ID, task_id: ASSISTANT_TASK_ID }
                  : {
                      ...(defaultModelKey ? { model: defaultModelKey } : {}),
                      ...(defaultSlug ? { params: { provider: defaultSlug } } : {}),
                    }),
              },
            ],
          }),
        ]
      );
    }
    output.promptOptimizerChainId = PROMPT_OPTIMIZER_CHAIN_ID;

    // Set default provider/model for the prompt optimizer and the rolling
    // summarizer (same install default as the example agents).
    if (defaultSlug && defaultModelKey) {
      await pool.query(
        `INSERT INTO app.user_settings (user_id, settings)
         VALUES ('00000000-0000-0000-0000-000000000000', $1::jsonb)
         ON CONFLICT (user_id) DO UPDATE
           SET settings = jsonb_set(
             jsonb_set(
               COALESCE(app.user_settings.settings, '{}'::jsonb),
               '{promptOptimizer}',
               $1::jsonb->'promptOptimizer'
             ),
             '{rollingSummary}',
             $1::jsonb->'rollingSummary'
           )`,
        [JSON.stringify({
          promptOptimizer: { providerId: defaultSlug, modelId: defaultModelKey },
          rollingSummary: { providerId: defaultSlug, modelId: defaultModelKey, thresholdTokens: 8000, maxMessages: 40 },
        })]
      );
      console.log(`Bootstrap: Prompt optimizer and summarizer set to ${defaultSlug}/${defaultModelKey}.`);
    }
    console.log('Bootstrap: Prompt optimizer chain ready.');

    // ── 9. Preferences file (user.md) ────────────────────────────────────
    console.log(`Bootstrap: Writing preferences for ${adminId}...`);
    const prefDir = path.join('/app/host/sources/vector/agent', adminId, 'preferences');
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
