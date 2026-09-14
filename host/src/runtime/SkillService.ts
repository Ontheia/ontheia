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
import * as fs from 'fs/promises';
import * as path from 'path';
import { watch } from 'fs';
import type { Pool } from 'pg';
import type { FastifyBaseLogger } from 'fastify';

const SKILLS_BASE_DIR = process.env.SKILLS_BASE_DIR ?? '/app/host/sources/skills';

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  when_to_use: string | null;
  content: string;
  skill_dir: string;
  scope: 'global' | 'user';
  owner_id: string | null;
  disable_model_invocation: boolean;
  user_invocable: boolean;
  model_override: string | null;
  active: boolean;
  enabled: boolean;
}

// ── Frontmatter parser ────────────────────────────────────────────────────────

function parseFrontmatter(raw: string): { meta: Record<string, unknown>; body: string } {
  if (!raw.startsWith('---')) return { meta: {}, body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { meta: {}, body: raw };
  const yamlBlock = raw.slice(4, end);
  const body = raw.slice(end + 4).trimStart();
  const meta: Record<string, unknown> = {};
  const lines = yamlBlock.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    if (!key || key.startsWith(' ')) continue;
    const rawVal = line.slice(sep + 1).trim();

    // YAML block scalar: > (folded) or | (literal) — collect indented continuation lines
    if (rawVal === '>' || rawVal === '|') {
      const parts: string[] = [];
      while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
        i++;
        parts.push(lines[i].trim());
      }
      meta[key] = parts.join(rawVal === '>' ? ' ' : '\n').trim();
    } else {
      meta[key] = rawVal;
    }
  }
  return { meta, body };
}

// ── Path safety ───────────────────────────────────────────────────────────────

export function safeSkillPath(skillDir: string, relativePath: string): string | null {
  if (relativePath.includes('..')) return null;
  const base = path.resolve(skillDir);
  const resolved = path.resolve(path.join(base, relativePath));
  if (!resolved.startsWith(base + path.sep) && resolved !== base) return null;
  return resolved;
}

// ── SkillService ──────────────────────────────────────────────────────────────

export class SkillService {
  private log: ReturnType<FastifyBaseLogger['child']>;
  private watcher: ReturnType<typeof watch> | null = null;
  private watcherRestartTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  // Scan coordination: a burst of SKILL.md writes must not spawn concurrent
  // scans — they race each other in the DB and the last writer can persist an
  // intermediate file state it read mid-edit. Events while a scan runs only
  // mark one follow-up scan, which then reads the final state.
  private scanRunning = false;
  private rescanNeeded = false;

  constructor(private db: Pool, logger: FastifyBaseLogger) {
    this.log = logger.child({ component: 'SkillService' });
  }

  async start() {
    this.log.info({ baseDir: SKILLS_BASE_DIR }, 'SkillService starting — initial scan');
    const result = await this.scanAll();
    if (result.failed > 0) {
      this.log.warn(result, 'Initial skill scan finished with errors');
    }
    this.startWatcher();
  }

  stop() {
    if (this.watcher) {
      this.watcher.removeAllListeners();
      this.watcher.close();
      this.watcher = null;
    }
    if (this.watcherRestartTimer) {
      clearTimeout(this.watcherRestartTimer);
      this.watcherRestartTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  // ── Scan ───────────────────────────────────────────────────────────────────

  async scanAll(): Promise<{ scanned: number; failed: number }> {
    let scanned = 0;
    let failed = 0;
    for (const scope of ['global', 'user'] as const) {
      const scopeDir = path.join(SKILLS_BASE_DIR, scope);
      try {
        if (scope === 'global') {
          const entries = await fs.readdir(scopeDir, { withFileTypes: true });
          for (const e of entries) {
            if (!e.isDirectory()) continue;
            const outcome = await this.scanSkillDir(path.join(scopeDir, e.name), 'global', null);
            if (outcome === 'ok') scanned++;
            else if (outcome === 'failed') failed++;
          }
        } else {
          const userDirs = await fs.readdir(scopeDir, { withFileTypes: true }).catch(() => []);
          for (const u of userDirs) {
            if (!u.isDirectory()) continue;
            const userId = u.name;
            const userPath = path.join(scopeDir, userId);
            const skillDirs = await fs.readdir(userPath, { withFileTypes: true }).catch(() => []);
            for (const s of skillDirs) {
              if (!s.isDirectory()) continue;
              const outcome = await this.scanSkillDir(path.join(userPath, s.name), 'user', userId);
              if (outcome === 'ok') scanned++;
              else if (outcome === 'failed') failed++;
            }
          }
        }
      } catch {
        // scope directory may not exist yet
      }
    }
    this.log.info({ scanned, failed }, 'Scan complete');
    await this.deactivateMissing();
    return { scanned, failed };
  }

  // Entry point for callers that want a scan now (API route) and for the
  // watcher path: serialises with any scan already in flight. Returns null
  // when a scan was running and this call was folded into its follow-up.
  async scanNow(): Promise<{ scanned: number; failed: number } | null> {
    if (this.scanRunning) {
      this.rescanNeeded = true;
      return null;
    }
    this.scanRunning = true;
    try {
      let result: { scanned: number; failed: number };
      do {
        this.rescanNeeded = false;
        result = await this.scanAll();
      } while (this.rescanNeeded);
      return result;
    } finally {
      this.scanRunning = false;
    }
  }

  // Debounce a watcher-triggered scan: a burst of edits collapses into one
  // trigger instead of racing a scan per event.
  private requestScan(delayMs = 300) {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.runScan();
    }, delayMs);
  }

  private async runScan() {
    const result = await this.scanNow();
    if (result && result.failed > 0) {
      this.log.warn(result, 'Skill scan finished with errors');
    }
  }

  private async scanSkillDir(skillDir: string, scope: 'global' | 'user', userId: string | null): Promise<'ok' | 'missing' | 'failed'> {
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    try {
      const raw = await fs.readFile(skillMdPath, 'utf8');
      const { meta, body } = parseFrontmatter(raw);
      const name = String(meta['name'] ?? path.basename(skillDir)).trim();
      const description = String(meta['description'] ?? '').trim();
      if (!name || !description) {
        this.log.warn({ skillDir }, 'Skipping skill — missing name or description');
        return 'failed';
      }
      const ok = await this.upsert({
        name,
        description,
        when_to_use: meta['when_to_use'] ? String(meta['when_to_use']) : null,
        content: body,
        skill_dir: skillDir,
        scope,
        owner_id: userId,
        disable_model_invocation: meta['disable-model-invocation'] === 'true',
        user_invocable: meta['user-invocable'] !== 'false',
        model_override: meta['model'] ? String(meta['model']) : null,
      });
      return ok ? 'ok' : 'failed';
    } catch (err: any) {
      if (err?.code === 'ENOENT') return 'missing';
      this.log.warn({ err, skillDir }, 'Failed to scan skill');
      return 'failed';
    }
  }

  private async upsert(data: Omit<SkillRecord, 'id' | 'active' | 'enabled'>): Promise<boolean> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.user_role', 'admin', true)`);
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`,
        [data.owner_id ?? '00000000-0000-0000-0000-000000000000']);
      await client.query(`
        INSERT INTO app.skills
          (name, description, when_to_use, content, skill_dir, scope, owner_id,
           disable_model_invocation, user_invocable, model_override, active, scanned_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,now())
        ON CONFLICT (name, scope, owner_id)
        DO UPDATE SET
          description              = EXCLUDED.description,
          when_to_use              = EXCLUDED.when_to_use,
          content                  = EXCLUDED.content,
          skill_dir                = EXCLUDED.skill_dir,
          disable_model_invocation = EXCLUDED.disable_model_invocation,
          user_invocable           = EXCLUDED.user_invocable,
          model_override           = EXCLUDED.model_override,
          active                   = true,
          scanned_at               = now()
      `, [
        data.name, data.description, data.when_to_use, data.content,
        data.skill_dir, data.scope, data.owner_id,
        data.disable_model_invocation, data.user_invocable, data.model_override,
      ]);
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      this.log.warn({ err, name: data.name }, 'Upsert failed');
      return false;
    } finally {
      client.release();
    }
  }

  private async deactivateMissing() {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.user_role', 'admin', true)`);
      await client.query(`SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-000000000000', true)`);
      const res = await client.query(`SELECT id, skill_dir FROM app.skills WHERE active = true`);
      for (const row of res.rows) {
        try {
          await fs.access(path.join(row.skill_dir, 'SKILL.md'));
        } catch {
          await client.query(`UPDATE app.skills SET active = false WHERE id = $1`, [row.id]);
          this.log.info({ id: row.id, dir: row.skill_dir }, 'Deactivated missing skill');
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      this.log.warn({ err }, 'deactivateMissing failed');
    } finally {
      client.release();
    }
  }

  private startWatcher() {
    try {
      this.watcher = watch(SKILLS_BASE_DIR, { recursive: true }, (_event, filename) => {
        if (filename?.endsWith('SKILL.md')) {
          this.log.debug({ filename }, 'SKILL.md changed — rescanning');
          this.requestScan();
        }
      });
      // 'error' without a listener would surface as an uncaught exception and
      // could take the host down; 'close' (e.g. after EMFILE or a replaced
      // watched directory) leaves us silently blind. Both paths restart the
      // watcher and rescan, so no event is lost permanently.
      this.watcher.on('error', (err) => {
        this.log.warn({ err }, 'Skill filewatcher error — restarting watcher');
        this.scheduleWatcherRestart();
      });
      this.watcher.on('close', () => {
        this.log.warn('Skill filewatcher closed unexpectedly — restarting watcher');
        this.scheduleWatcherRestart();
      });
    } catch {
      this.log.warn('Filewatcher not available — changes require manual rescan');
    }
  }

  // Restart after 1 s so a persistent failure (e.g. the directory itself is
  // gone) cannot hot-loop. The rescan afterwards picks up anything changed
  // while the watcher was down.
  private scheduleWatcherRestart() {
    if (this.watcherRestartTimer) return;
    this.watcherRestartTimer = setTimeout(() => {
      this.watcherRestartTimer = null;
      // removeAllListeners() first: our own close() must not be seen as an
      // unexpected death (which would trigger a restart loop).
      try {
        this.watcher?.removeAllListeners();
        this.watcher?.close();
      } catch {
        // watcher already dead — nothing to clean up
      }
      this.watcher = null;
      this.startWatcher();
      this.requestScan(0);
    }, 1000);
  }

  // ── Public helpers ────────────────────────────────────────────────────────

  async getSkillsForAgent(agentId: string, userId: string): Promise<SkillRecord[]> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      // Use admin role so global skills (owner_id IS NULL) are always visible.
      // Skill assignments are system config, not user-private data.
      await client.query(`SELECT set_config('app.user_role', 'admin', true)`);
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
      const res = await client.query(`
        SELECT s.*
        FROM app.skills s
        JOIN app.agent_skills a ON a.skill_id = s.id
        WHERE a.agent_id = $1 AND a.active = true AND s.active = true AND s.enabled = true
        ORDER BY s.scope DESC, s.name
      `, [agentId]);
      await client.query('COMMIT');
      return res.rows as SkillRecord[];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getSkillByName(name: string, agentId: string, userId: string): Promise<SkillRecord | null> {
    const skills = await this.getSkillsForAgent(agentId, userId);
    return skills.find(s => s.name === name) ?? null;
  }

  // Assigns a skill to an agent (idempotent). Used by create_skill so a
  // freshly created skill is immediately usable by the creating agent —
  // without an agent_skills row a skill never appears in any catalog.
  async assignSkillToAgent(skillId: string, agentId: string): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      // Admin role: agent_skills writes are admin-gated by RLS; skill
      // assignments are system config, not user-private data.
      await client.query(`SELECT set_config('app.user_role', 'admin', true)`);
      await client.query(`
        INSERT INTO app.agent_skills (agent_id, skill_id, active)
        VALUES ($1, $2, true)
        ON CONFLICT (agent_id, skill_id) DO UPDATE SET active = true
      `, [agentId, skillId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Lookup by name without agent assignment — for read/write_skill_resource on freshly created skills.
  async getSkillByNameForUser(name: string, userId: string): Promise<SkillRecord | null> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.user_role', 'admin', true)`);
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
      const res = await client.query(`
        SELECT * FROM app.skills
        WHERE name = $1 AND active = true AND enabled = true
          AND (scope = 'global' OR owner_id = $2)
        ORDER BY scope DESC
        LIMIT 1
      `, [name, userId]);
      await client.query('COMMIT');
      return res.rows[0] ?? null;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static get baseDir() { return SKILLS_BASE_DIR; }
}
