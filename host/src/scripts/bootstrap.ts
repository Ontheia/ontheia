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

// An agent's system prompt lives solely in its task's context_prompt, seeded
// further down and editable in the UI (always English — best LLM quality).
// There is deliberately no second, agent-level prompt: a field the UI never
// shows cannot be kept in sync and only drifts.


// ── Bundled skills ──────────────────────────────────────────────────────────
// The SkillService scanner only runs once the host is up — bootstrap runs
// before that, so register bundled skills here and assign them to their
// default agent. The scanner refreshes the same rows later (same unique key:
// name, scope, owner_id). Also invoked standalone via `--skills-only` by
// update.sh, so existing installations pick up newly bundled skills without
// re-running the full bootstrap (which would overwrite agent customizations).
async function registerBundledSkills(pool: InstanceType<typeof Pool>) {
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
      try {
        await pool.query(
          `INSERT INTO app.agent_skills (agent_id, skill_id, active)
           VALUES ($1, $2, true)
           ON CONFLICT (agent_id, skill_id) DO NOTHING`,
          [agentId, skillRes.rows[0].id]
        );
        console.log(`Bootstrap: Skill '${skillName}' registered and assigned to ${agentLabel}.`);
      } catch {
        // The default agent does not exist on this installation (example
        // agents disabled or replaced) — the skill itself is registered.
        console.warn(`Bootstrap: Skill '${skillName}' registered; default agent '${agentLabel}' not found — assign it via Admin → Skills.`);
      }
    } catch (err: any) {
      // Missing skill directory is fine (slim distributions) — warn, never
      // fail bootstrap.
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
}

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

  // ── Skills-only mode (used by update.sh) ──────────────────────────────────
  // Registers newly bundled skills and their default-agent assignments on
  // existing installations without touching agents, providers, or settings.
  if (process.argv.includes('--skills-only')) {
    console.log('Bootstrap: skills-only mode — registering bundled skills.');
    await registerBundledSkills(pool);
    await pool.end();
    return;
  }

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
      { slug: 'anthropic', label: 'Anthropic',      url: 'https://api.anthropic.com/v1',                                 auth: 'header', key: 'ANTHROPIC_API_KEY', header: 'x-api-key', active: process.env.HAS_ANTHROPIC_KEY === 'true', testModel: 'claude-sonnet-5', testMethod: 'POST', testPath: '/v1/messages' },
      { slug: 'xai',       label: 'xAI (Grok)',     url: 'https://api.x.ai/v1',                                         auth: 'bearer', key: 'XAI_API_KEY',       header: null,        active: process.env.HAS_XAI_KEY       === 'true', testModel: null,                testMethod: 'GET',  testPath: null         },
      // Google is the only base URL here that ends in a slash, and that decides
      // how the default test path resolves against it. `/v1/chat/completions`
      // against `…/v1` (no slash) replaces the version segment and lands right;
      // against `…/v1beta/openai/` it appends, giving `…/openai/v1/chat/
      // completions` — a 404 no key can fix. Spelled out here rather than
      // changing the shared default, which the three others depend on.
      { slug: 'google',    label: 'Google',          url: 'https://generativelanguage.googleapis.com/v1beta/openai/',    auth: 'bearer', key: 'GOOGLE_API_KEY',    header: null,        active: process.env.HAS_GOOGLE_KEY    === 'true', testModel: 'gemini-3.1-flash-lite', testMethod: 'POST', testPath: '/chat/completions' },
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

    // Migrations V34/V35 seed the historical model lists, which a fresh install
    // inherits. Drop them for the API providers so a new installation starts with
    // the current catalog below instead of a mix of both. Safe here: this code path
    // only runs from install.sh (--skills-only returns long before), so no existing
    // installation is touched and nothing can reference these rows yet. Ollama is
    // left alone — its models depend on what the operator selected during install.
    const apiProviderPids = [openaiPid, anthropicPid, xaiPid, googlePid].filter(Boolean) as string[];
    if (apiProviderPids.length > 0) {
      await pool.query('DELETE FROM app.provider_models WHERE provider_id = ANY($1::uuid[])', [apiProviderPids]);
    }

    // Reasoning defaults, verified against the live APIs (2026-07-19):
    //   OpenAI and xAI both implement /v1/responses, where reasoning and function
    //   tools work together — hence chat_api: 'responses'. Anthropic maps
    //   reasoning_effort onto extended thinking and needs no chat_api. Google is
    //   left unset: it reports no usable reasoning controls here.
    const REASONING_RESPONSES = { chat_api: 'responses', reasoning_effort: 'medium' };
    const REASONING_ONLY      = { reasoning_effort: 'medium' };

    const models: Array<{ pid: string; key: string; label: string; capability?: string; meta?: Record<string, unknown> }> = [];
    if (openaiPid) {
      models.push({ pid: openaiPid, key: 'gpt-5.6-luna',                 label: 'GPT-5.6 Luna',  meta: REASONING_RESPONSES });
      models.push({ pid: openaiPid, key: 'gpt-5.6-terra',                label: 'GPT-5.6 Terra', meta: REASONING_RESPONSES });
      models.push({ pid: openaiPid, key: 'gpt-5.6-sol',                  label: 'GPT-5.6 Sol',   meta: REASONING_RESPONSES });
      models.push({ pid: openaiPid, key: 'text-embedding-3-small',       label: 'text-embedding-3-small', capability: 'embedding', meta: { dimension: 1536, metric: 'cosine', normalize: true } });
    }
    if (anthropicPid) {
      models.push({ pid: anthropicPid, key: 'claude-haiku-4-5',          label: 'Claude Haiku 4.5',  meta: REASONING_ONLY });
      models.push({ pid: anthropicPid, key: 'claude-sonnet-5',           label: 'Claude Sonnet 5',   meta: REASONING_ONLY });
      models.push({ pid: anthropicPid, key: 'claude-opus-4-8',           label: 'Claude Opus 4.8',   meta: REASONING_ONLY });
    }
    if (xaiPid) {
      models.push({ pid: xaiPid, key: 'grok-4.5',                        label: 'Grok 4.5',       meta: REASONING_RESPONSES });
      models.push({ pid: xaiPid, key: 'grok-build-0.1',                  label: 'Grok Build 0.1', meta: REASONING_RESPONSES });
    }
    if (googlePid) {
      // Only the lite model. gemini-3.5-flash was seeded here too and is not
      // reachable over the OpenAI-compatible endpoint — verified on a fresh
      // install: the connection check fails on it even with the right path.
      models.push({ pid: googlePid, key: 'gemini-3.1-flash-lite',        label: 'Gemini 3.1 Flash Lite' });
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
        firstActiveSlug === 'openai'    ? 'gpt-5.6-terra' :
        firstActiveSlug === 'anthropic' ? 'claude-sonnet-5' :
        firstActiveSlug === 'xai'       ? 'grok-4.5' :
        firstActiveSlug === 'google'    ? 'gemini-3.1-flash-lite' :
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

    // ── 6c. Namespace rules ───────────────────────────────────────────────
    // Until now a fresh install started with an empty app.vector_namespace_rules
    // while the seeded agents were told to use a dozen namespaces. Every entry
    // they wrote landed without a ranking bonus, without an instruction template
    // and without a memory class — the three things the rules table exists for.
    //
    // Three columns per row, and they do different jobs:
    //   bonus                — a multiplier on the hit's similarity, not a
    //                          summand: 0.09 means +9 %. It rises with how
    //                          binding the content is for answering right now.
    //   instruction_template — prepended to the hits of that namespace, so the
    //                          model is told what kind of thing it is reading.
    //                          Hits sharing a template are grouped under one copy.
    //   memory_class         — the default class for new entries; a write may
    //                          override it per entry.
    //
    // Empty class where none of the five fits. `preferences` mixes facts, rules
    // and habits; an idea claims nothing and is neither episodic nor semantic.
    // A guessed class is worse than none — the write path leaves the column NULL
    // and the agent is told to set it explicitly where it matters.
    //
    // ON CONFLICT DO NOTHING: these are a starting point, not a policy. An
    // installation that has tuned its rules keeps them across updates.
    console.log('Bootstrap: Seeding namespace rules...');
    const namespaceRules: Array<[string, number, string | null, string, string]> = [
      // Operational — written by the agent about this user.
      ['vector.agent.${user_id}.preferences', 0.09, null,
        'Preferences, facts and standing instructions about the user.',
        'ABOUT THE USER (MEMORY): Preferences, facts and standing instructions about this person, kept from earlier conversations. Let them shape your answer; where a current instruction contradicts them, the current one wins: {{content}}'],
      ['vector.agent.${user_id}.howto', 0.06, 'procedural',
        'Procedural knowledge: how you carry out a task for this user.',
        'WORKING INSTRUCTION (MEMORY): A way of doing something recorded for this user. Follow it as long as it fits the task; where the situation differs, say so instead of stretching the instruction: {{content}}'],
      ['vector.agent.${user_id}.memory', 0.03, 'episodic',
        'Observations from earlier conversations, each with a point in time.',
        'CONVERSATION NOTE (MEMORY): Recorded in an earlier conversation — a record, not a verified fact. Mind the date given; the situation may have changed since: {{content}}'],

      // Personal — the user's own space.
      ['vector.user.${user_id}.ideas', 0.03, null,
        'Thoughts that assert nothing: ideas, drafts, the undecided. No class fits.',
        'THOUGHT (MEMORY): An idea, a draft, something not yet decided — neither fact nor rule. Present it as a consideration rather than as settled, and do not derive anything from it the user has not decided: {{content}}'],
      ['vector.user.${user_id}.archive', 0, 'document',
        'Strictly personal documents. A place to file things, not a memory.',
        'PERSONAL RECORD (SOURCE): An extract from a strictly personal document of the user. Take figures, names and dates verbatim; add nothing that is not there. If the extract is not enough, search the same namespace again — with the full question in whole sentences: {{content}}'],

      // Product namespaces every installation has.
      ['vector.global.ontheia.temp', 0.12, 'working',
        'Scratch space bound to the running task. Always written with a TTL.',
        'SCRATCH NOTE (MEMORY): Stored temporarily and tied to the task in progress. Do not treat it as lasting knowledge, and stop drawing on it once the task is done: {{content}}'],
      ['vector.global.ontheia.docs', 0, 'document',
        'Ontheia product documentation.',
        'ONTHEIA DOCUMENTATION (SOURCE): An extract from the product documentation, not from a conversation. Base statements about Ontheia on it, and say when the extract does not cover the question instead of filling the gap: {{content}}'],
      ['vector.global.ontheia.feedback', 0, 'episodic',
        'Reported errors and suggestions — a record, not current system state.',
        'FEEDBACK RECORD (MEMORY): An error or suggestion reported at a point in time — not the current state of the system. It may long since be fixed; check the date before building on it: {{content}}'],

      // Shared knowledge. Bonus 0 throughout: a corpus is found by the question,
      // not lifted by a weight — the distinction the ranking rules rest on.
      ['vector.global.knowledge.general.facts', 0, 'document',
        'Collected subject knowledge, not conversation.',
        'KNOWLEDGE BASE (SOURCE): Collected subject knowledge, not conversation. Use it as evidence and flag when it answers the question only in part: {{content}}'],
      ['vector.global.knowledge.llm.api-docs', 0, 'document',
        'Cached library and API documentation.',
        'LIBRARY DOCUMENTATION (SOURCE): Cached documentation for a library or API. Take signatures, parameter names and version numbers verbatim; add nothing that is not there. Mind the date — stale documentation is worse than none: {{content}}'],
      ['vector.global.knowledge.llm.best-practices', 0, 'procedural',
        'Agreed rules for code, security and architecture.',
        'CODING STANDARD (MEMORY): An agreed rule for code, security or architecture. Shape your proposal accordingly; depart from it only when the user asks explicitly: {{content}}'],
      ['vector.global.privat.manuals', 0, 'document',
        'Ingested operating and user manuals, private sphere.',
        'MANUAL (SOURCE): An extract from an ingested operating or user manual. Treat it as a handbook — take figures, type designations and limits verbatim, add nothing that is not there. If the extract is not enough, search the same namespace again and ask the full question in whole sentences — single keywords stay below the relevance threshold and return nothing: {{content}}'],
      ['vector.global.privat.recipes', 0, 'document',
        'Shared recipe collection.',
        'RECIPE (SOURCE): From the shared recipe collection. Take quantities, times and ingredients verbatim; do not present a variant as available that is not there: {{content}}'],
      ['vector.global.business.manuals', 0, 'document',
        'Ingested operating and user manuals, business sphere.',
        'MANUAL (SOURCE): An extract from an ingested operating or user manual from the business sphere. Treat it as a handbook — take figures, type designations and limits verbatim, add nothing that is not there. If the extract is not enough, search the same namespace again and ask the full question in whole sentences — single keywords stay below the relevance threshold and return nothing: {{content}}'],
    ];
    for (const [pattern, bonus, memoryClass, description, instruction] of namespaceRules) {
      await pool.query(
        `INSERT INTO app.vector_namespace_rules (pattern, bonus, memory_class, description, instruction_template)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (pattern) DO NOTHING`,
        [pattern, bonus, memoryClass, description, instruction]
      );
    }
    console.log(`Bootstrap: ${namespaceRules.length} namespace rules ensured.`);

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
        { server: 'artifacts', tool: 'artifact_read' },
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
           (id, label, description, visibility, owner_id, provider_id, model_id, tool_approval_mode, default_mcp_servers, default_tools, show_in_composer)
         VALUES ($1, $2, $3, 'public', $4, $5, $6, 'granted', ARRAY['memory', 'delegation', 'skills', 'cli-tools', 'scheduler', 'artifacts'], $7::jsonb, true)
         ON CONFLICT (id) DO UPDATE SET
           label = EXCLUDED.label, description = EXCLUDED.description,
           provider_id = EXCLUDED.provider_id,
           model_id = EXCLUDED.model_id, visibility = 'public',
           default_mcp_servers = EXCLUDED.default_mcp_servers,
           default_tools = EXCLUDED.default_tools,
           updated_at = now()`,
        [
          GUIDE_AGENT_ID,
          'Ontheia Guide',
          'Your personal guide to Ontheia. Ask me anything about the platform.',
          adminId,
          defaultSlug,
          defaultModelKey,
          guideTools,
        ]
      );

      // Memory policy — applied to both agents regardless of embedding state.
      // Placeholders (${user_id}) are resolved at runtime by the memory adapter.
      //
      // The two read lists are deliberately identical. They were not: only the
      // tool list was set, so auto-injection fell back to the built-in default
      // (agent.memory, user.memory, plus the session and chat namespaces) and
      // the corpus was reachable only if the model decided to search for it.
      // That decision is not reliable — asked how to make a syrup the user has
      // a recipe for, a model answered from its own knowledge and invented one,
      // with the recipes skill loaded and its "search first" SOP in context.
      // Auto-injection takes the decision away instead of restating it.
      //
      // What made this affordable is the relative cutoff: hits more than 30 %
      // below the best one are dropped, so a corpus row only reaches the
      // context when it competes with the strongest hit rather than merely
      // clearing the floor.
      const agentMemoryPolicy = JSON.stringify({
        read_namespaces: [
          'vector.user.${user_id}.*',
          'vector.agent.${user_id}.*',
          'vector.global.*',
        ],
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
           (id, label, description, visibility, owner_id, provider_id, model_id, tool_approval_mode, default_mcp_servers, default_tools, show_in_composer)
         VALUES ($1, $2, $3, 'public', $4, $5, $6, 'granted', ARRAY['memory', 'skills', 'cli-tools', 'scheduler', 'artifacts'], $7::jsonb, true)
         ON CONFLICT (id) DO UPDATE SET
           label = EXCLUDED.label, description = EXCLUDED.description,
           provider_id = EXCLUDED.provider_id,
           model_id = EXCLUDED.model_id, visibility = 'public',
           default_mcp_servers = EXCLUDED.default_mcp_servers,
           default_tools = EXCLUDED.default_tools,
           updated_at = now()`,
        [
          ASSISTANT_AGENT_ID,
          'Personal Assistant',
          'Your general-purpose AI assistant.',
          adminId,
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
         VALUES ($1, 'memory', true), ($1, 'delegation', true), ($1, 'skills', true), ($1, 'cli-tools', true), ($1, 'scheduler', true), ($1, 'artifacts', true)
         ON CONFLICT (agent_id, server) DO NOTHING`,
        [GUIDE_AGENT_ID]
      );

      // Personal Assistant: memory + skills + cli-tools + scheduler
      // (default test agent for the skill-creator eval loop; no delegation —
      // it executes tasks, it does not orchestrate other agents)
      await pool.query(
        `INSERT INTO app.agent_mcp_servers (agent_id, server, active)
         VALUES ($1, 'memory', true), ($1, 'skills', true), ($1, 'cli-tools', true), ($1, 'scheduler', true), ($1, 'artifacts', true)
         ON CONFLICT (agent_id, server) DO NOTHING`,
        [ASSISTANT_AGENT_ID]
      );
      // Remove a delegation binding left over from earlier bootstrap versions
      // (the assistant no longer orchestrates other agents).
      await pool.query(
        `DELETE FROM app.agent_mcp_servers WHERE agent_id = $1 AND server = 'delegation'`,
        [ASSISTANT_AGENT_ID]
      );

      // ── Bundled skills (see registerBundledSkills above) ────────────────
      await registerBundledSkills(pool);

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
- When updating: write the new version with \`supersedes\` set to the old entry's id (from a memory-search hit). The old version stays readable but drops out of search. Never accumulate fragments, and do not delete — deleting loses the trail of what changed.
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

- **Search before you store:** before saving a fact that can change (device, version, address, vehicle, supplier, state), call memory-search with the core of the fact first — even when nothing about it is in the context. A new chat starts with no memory; what you do not search for, you do not see. If you find an older version, take its id as \`supersedes\`.
- **Updating an entry:** memory-write the new version with \`supersedes\` set to the old entry's id, taken from a memory-search hit. The correction is then recorded rather than the contradiction erased. Use memory-delete only for entries that were wrong from the start or should never have been stored. Never tell \${user_name} that memory is append-only or that entries cannot be edited — you can and must update them yourself instead of sending the user to the Admin Console.
- **Explicit namespace on every write:** always pass the target namespace to memory-write — without it the entry silently falls back to the default namespace. When finalizing or updating an entry (e.g. adding the final document number), supersede it in its ORIGINAL namespace. Never store the new version elsewhere and then ask whether to copy it over.
- **Deleting reliably:** always run memory-search first and pass the hit's id to memory-delete — content-based deletion requires a verbatim match and fails on any formatting difference. If the result reports affected: 0, the entry was NOT deleted: re-search and retry by id instead of asking the user to clean up manually.
- **Moving an entry between namespaces:** memory-write to the target namespace with \`supersedes\` set to the source entry's id — one call, and the trail from old location to new is recorded. Deleting the source instead loses that trail; a moved entry then looks like it was always where it now is.
- **When the fact was observed:** if the conversation states when something started or happened ("since March", "ordered yesterday"), pass it as \`observed_at\`. Leave it out when you have nothing to go on — a guessed date is worse than none.
- **Memory class:** pass \`class\` when it differs from what the namespace implies, and always in \`preferences\`, which has no default: a preference or a fact about a person is \`semantic\`, an "if X then Y" rule is \`procedural\`, something that happened at a time is \`episodic\`, and anything needed only for the current task is \`working\`.
- **Name the fact before an irreversible act:** when you are about to do something on the strength of a stored fact that cannot be taken back — send a mail, book an appointment, place an order, write into another system, delegate to another agent — state the fact and its date first and wait for the answer. Do not ask when the entry in the context says "confirmed by the user", or when \${user_name} gave you the fact in this very conversation. Never ask when you are merely looking something up: the rule hangs on the act, not on the hit — a question before every hit makes the question worthless. Where you cannot wait for an answer (a scheduled run, a chain), act and record in the result which entry with which date you relied on.
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
- Private: vector.user.\${user_id}.ideas, vector.global.privat.recipes, vector.global.privat.manuals
- Business: vector.global.business.manuals, and further ones the use case calls for (projects, crm, billing, marketing)
- Technical: vector.global.knowledge.llm.api-docs, vector.global.knowledge.llm.best-practices
- If works_with_team = yes: emphasize vector.global.* as the shared team space

The namespaces above ship with a ranking rule; the ones you invent for a use case do not. Mention it when you suggest a new one: Admin Console → Memory → Ranking gives it a bonus, an instruction template and a memory class. Without a rule its entries are searchable but arrive unlabelled and unweighted.

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
- **Agents** — Where AI assistants live. Each agent has a task (its context prompt — the system prompt), memory policy, and tools.
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
2. Choose a name matching their use case
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

**1. Operational (agent-managed, about this user)**
- \`vector.agent.\${user_id}.memory\`: **Observations** — what is or was the case, with a point in time. Devices and their software versions, orders, states, addresses, suppliers. Also filled automatically with the record of each run.
- \`vector.agent.\${user_id}.howto\`: Procedural knowledge and SOPs — how **you** carry out a task. Not to be confused with \`manuals\`, which holds the manufacturer's documentation.
- \`vector.agent.\${user_id}.preferences\`: **How the user wants things handled** — habits, likes and dislikes, standing instructions. **No facts about devices or things** — those belong in \`memory\`.

**2. Personal (the user's own space)**
- \`vector.user.\${user_id}.ideas\`: **Thoughts that assert nothing** — ideas, brainstorming, drafts, notes on the undecided. Nothing that is or was, and no rule.
- \`vector.user.\${user_id}.archive\`: **Strictly personal records** — letters, contracts, receipts, statements. A place to file things, not a memory: here stands the wording itself, not what you made of it.

**3. Shared**
- \`vector.global.privat.recipes\`: Shared recipe collection.
- \`vector.global.privat.manuals\`: Operating and user manuals from the private sphere.
- \`vector.global.business.manuals\`: The same kinds of document from the business sphere.

**4. Knowledge and system**
- \`vector.global.knowledge.general.facts\`: Collected subject knowledge, not conversation.
- \`vector.global.knowledge.llm.api-docs\`: Library and API documentation.
- \`vector.global.knowledge.llm.best-practices\`: Agreed rules for code, security and architecture.
- \`vector.global.ontheia.docs\`: Ontheia documentation — **only** Ontheia itself, no third-party manuals.
- \`vector.global.ontheia.temp\`: Scratch space for intermediate steps (**always with a TTL!**).
- \`vector.global.ontheia.feedback\`: Error reports and suggestions for improvement.

Further namespaces can be added for a use case that needs them. Each one wants a rule under Admin Console → Memory → Ranking — without it, entries there arrive with no ranking bonus, no instruction and no class. Tell the user that rather than inventing a namespace silently.

### Choosing a namespace — form first, then content

**Ahead of the three questions:** are you filing a **wording** — a letter, a contract, a receipt, a statement the user wants kept? Then \`archive\`, unchanged and complete. The three questions below do not apply: there you record what you understood, here you file what is written.

**Otherwise three questions, in this order:**

1. **Is it so, or was it so?** → \`memory\`. An observation with a point in time.
2. **Is this how it should be handled?** → \`preferences\`. A preference or rule about the user.
3. **Neither — just a thought?** → \`ideas\`.

Store the same fact **once**, not in a second namespace for safety.

### Your Memory Responsibilities
1. **Search before you store:** before saving a fact that can change (device, version, address, vehicle, supplier, state), call memory-search with the core of the fact first — even when nothing about it is in the context. A new chat starts with no memory; what you do not search for, you do not see. If you find an older version, take its id as \`supersedes\`.
2. **Update:** when a fact has changed, write the new entry with \`supersedes\` set to the old id — do not delete the old one. Without \`supersedes\` both versions sit side by side and nobody knows which one holds. The old version stays readable and drops out of search, so the correction is recorded rather than erased. Use memory-delete only for entries that were wrong from the start or should never have been stored.
3. **When it was observed:** if the conversation says since when something holds or when it happened ("since March", "ordered yesterday"), pass it as \`observed_at\`. Leave it out when you have nothing to go on — a guessed date is worse than none.
4. **Class:** in \`preferences\` **always** pass \`class\`, there is no default there: a preference or a fact about a person is \`semantic\`, an "if X then Y" rule is \`procedural\`. Elsewhere only when it differs from the namespace default. In \`ideas\` pass **no** class: a thought that asserts nothing is none of the five, and a guessed class is worse than none.
5. **Name the fact before an irreversible act:** when you are about to do something on the strength of a stored fact that cannot be taken back — send a mail, book an appointment, place an order, write into another system, delegate to another agent — state the fact and its date first and wait for the answer. For example: "I'll use alexandra@…, noted on 14 Jan — does that still hold?" **Do not** ask when the entry in the context says "confirmed by the user" (the user has already checked it) or when they gave you the fact in this very conversation. And **never** ask when you are merely looking something up: the rule hangs on the act, not on the hit — a question before every hit makes the question worthless. Where you cannot wait for an answer (a scheduled run, a chain), act and record in the result which entry with which date you relied on.
6. **Clean up:** use \`vector.global.ontheia.temp\` for intermediate steps — always with a TTL.
7. **Quality assurance:** record errors, tool failures and suggestions for improvement in \`vector.global.ontheia.feedback\`.

## Source Citations
At the end of EVERY response, check whether you used external sources, provided documents, search results or specific links.
- IF you used sources: add a sources section at the absolute end, separated by \`---\`, with heading \`##### Sources\` and each source as \`- [Title](URL)\`, \`- Local document \\\`path/to/file\\\`\` or \`- Memory \\\`<namespace>\\\`\`.
- IF you used NO sources: omit the section entirely.

**Memory entries headed (SOURCE) are places a claim was found and belong in the section** — recipes, manuals, documentation, personal records. Name the namespace from the entry's header line. The reason: whether an answer comes from the user's own collection or from your general knowledge is something they cannot see — both read as equally certain. When you pass on content from such an entry, say where it came from. An entry with no label at all: do not name it.

**What is not a source** — in these cases omit the section rather than naming an origin:
- Anything the user said in this conversation.
- Anything you stored yourself in this turn. An entry does not become a source by now sitting in memory.
- Memory entries the context heads with **(MEMORY)** — notes, preferences, working instructions, scratch. They are what we recorded about the user, not a place a claim was found.
- Your own knowledge.

Do not invent a kind of source. With nothing to cite the answer simply ends without the section — that is the normal case, not a gap.

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
