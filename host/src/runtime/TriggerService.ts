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
import type { Pool, PoolClient } from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import type { RunService } from './RunService.js';
import type { InboxService } from './InboxService.js';
import { executeBackgroundRun, loadRunUser } from './background-run.js';
import { buildAutomationSystemNote } from './automation-utils.js';
import { getSystemFlag } from './system-flags.js';
import { isUuid, withRls, withTransaction } from '../routes/utils.js';
import { loadGlobalRuntime } from '../routes/settings-utils.js';

/**
 * Webhook triggers: an incoming POST starts an agent or a chain in the
 * background, as the trigger's owner.
 */

export const TRIGGER_TOKEN_PREFIX = 'ontr_';
export const TRIGGER_BODY_LIMIT_BYTES = 256 * 1024;
/** Stored payloads above this size are replaced by a marked preview. */
export const TRIGGER_EVENT_PAYLOAD_MAX_CHARS = 64 * 1024;
export const TRIGGER_EVENTS_KEPT = 200;
export const TRIGGER_MAX_CONCURRENT_PER_USER = 3;
/** A single inline value from the payload; the whole payload goes through `{{payload}}`. */
const INLINE_VALUE_MAX_CHARS = 2000;
export const DEFAULT_TRIGGER_PROMPT = 'An event arrived. Handle it according to your task.\n\n{{payload}}';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

// ── Token ────────────────────────────────────────────────────────────────────

/** 256 bits from the OS — guessing is not an attack worth limiting, storing it readable would be. */
export function generateTriggerToken(): string {
  return `${TRIGGER_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function hashTriggerToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Compares in constant time; a malformed stored hash never matches. */
export function triggerTokenMatches(storedHash: string, presented: string | undefined | null): boolean {
  if (!presented || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
  const a = Buffer.from(storedHash, 'hex');
  const b = Buffer.from(hashTriggerToken(presented), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** `Authorization: Bearer <token>` or `X-Ontheia-Token: <token>`. Never the URL: it ends up in proxy logs. */
export function tokenFromHeaders(headers: Record<string, string | string[] | undefined>): string | null {
  const auth = headers['authorization'];
  if (typeof auth === 'string') {
    const match = /^Bearer\s+(\S+)$/i.exec(auth.trim());
    if (match) return match[1];
  }
  const direct = headers['x-ontheia-token'];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  return null;
}

// ── Prompt ───────────────────────────────────────────────────────────────────

/**
 * The payload as a delimited block. `<` is written as its JSON escape so that
 * nothing inside the data can close the block and continue as if it were the
 * prompt; the JSON stays valid and means the same.
 */
export function payloadBlock(payload: unknown): string {
  const json = (JSON.stringify(payload ?? null, null, 2) ?? 'null').replace(/</g, '\\u003c');
  return `<event_payload>\n${json}\n</event_payload>`;
}

function lookupPath(payload: unknown, path: string): unknown {
  let current: unknown = payload;
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, key)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function inlineValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const cut = text.length > INLINE_VALUE_MAX_CHARS ? `${text.slice(0, INLINE_VALUE_MAX_CHARS)}…` : text;
  return cut.replace(/</g, '‹');
}

/**
 * Fills a trigger's prompt. `{{payload}}` is the whole body as a block,
 * `{{payload.a.b}}` one field (empty when missing), plus `{{name}}` and
 * `{{timestamp}}`. An empty template uses the default. Single pass: a value
 * that itself contains `{{…}}` is not expanded again.
 */
export function renderTriggerPrompt(
  template: string | null | undefined,
  payload: unknown,
  vars: { name: string; timestamp: string }
): string {
  const source = template && template.trim() ? template : DEFAULT_TRIGGER_PROMPT;
  return source.replace(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g, (match, key: string) => {
    if (key === 'payload') return payloadBlock(payload);
    if (key.startsWith('payload.')) return inlineValue(lookupPath(payload, key.slice('payload.'.length)));
    if (key === 'name') return vars.name;
    if (key === 'timestamp') return vars.timestamp;
    return match;
  });
}

const TITLE_VALUE_MAX_CHARS = 80;

/**
 * Fills `{{payload.a.b}}` in a chat title: one line, cut short, empty when the
 * field is missing. `{{name}}` and `{{timestamp}}` are left for the run to
 * fill, and a value cannot bring placeholders of its own.
 */
export function renderTriggerTitle(template: string, payload: unknown): string {
  return template.replace(/\{\{\s*payload\.([A-Za-z0-9_.$-]+)\s*\}\}/g, (_match, path: string) => {
    const value = lookupPath(payload, path);
    if (value === undefined || value === null) return '';
    const text = (typeof value === 'string' ? value : JSON.stringify(value))
      .replace(/[\r\n\t]+/g, ' ').replace(/[{}]/g, '').trim();
    return text.length > TITLE_VALUE_MAX_CHARS ? `${text.slice(0, TITLE_VALUE_MAX_CHARS)}…` : text;
  });
}

/** What the protocol keeps of a body. */
export function payloadForEventLog(payload: unknown): unknown {
  const json = JSON.stringify(payload ?? null) ?? 'null';
  if (json.length <= TRIGGER_EVENT_PAYLOAD_MAX_CHARS) return payload ?? null;
  return { _truncated: true, _chars: json.length, preview: `${json.slice(0, 2000)}…` };
}

// ── Limits ───────────────────────────────────────────────────────────────────

/** Sliding window per key, in memory: limits are a brake, not an account. */
export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();

  constructor(private windowMs: number) {}

  /** Records a hit and returns true while the key stays within `limit`. */
  allow(key: string, limit: number, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /** True when the key has already used up `limit`, without recording anything. */
  exhausted(key: string, limit: number, now = Date.now()): boolean {
    return (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs).length >= limit;
  }

  prune(now = Date.now()): void {
    for (const [key, times] of this.hits) {
      const recent = times.filter((t) => now - t < this.windowMs);
      if (recent.length === 0) this.hits.delete(key);
      else this.hits.set(key, recent);
    }
  }
}

// ── Overlap and queue ────────────────────────────────────────────────────────

/**
 * What happens to a call while the trigger cannot start a run:
 * - `queue`: every call waits and runs in turn — each call is a job (a mail).
 * - `coalesce`: at most one call waits; a newer one replaces it — the call is a
 *   wake-up for an agent that finds its own work (a document queue).
 * - `skip`: the call is dropped and answered with `skipped`, which a sender can
 *   take as "try again later".
 */
export const OVERLAP_MODES = ['queue', 'coalesce', 'skip'] as const;
export type OverlapMode = (typeof OVERLAP_MODES)[number];

/** Waiting calls per trigger; beyond it a call is refused with `queue_full`. */
export const TRIGGER_QUEUE_MAX = 100;
/** A call that waited this long is not run any more. */
export const TRIGGER_QUEUE_MAX_AGE_HOURS = 24;
/** How often waiting calls are looked at besides the end of each run (rate limit, expiry). */
const TRIGGER_QUEUE_TICK_MS = 15_000;
export const IDEMPOTENCY_KEY_MAX_CHARS = 200;

export type Admission =
  | { action: 'start' }
  | { action: 'enqueue'; replaceWaiting: boolean }
  | { action: 'skip'; reason: 'overlap' | 'busy' }
  | { action: 'reject'; error: 'rate_limited' | 'queue_full' };

/**
 * Decides what to do with a call. A trigger runs one call at a time, a user at
 * most TRIGGER_MAX_CONCURRENT_PER_USER, and the rate limit counts started runs.
 * A call never overtakes one that is already waiting.
 */
export function decideAdmission(input: {
  mode: OverlapMode;
  triggerRunning: boolean;
  userAtLimit: boolean;
  rateExhausted: boolean;
  queued: number;
}): Admission {
  if (input.mode === 'skip') {
    if (input.rateExhausted) return { action: 'reject', error: 'rate_limited' };
    if (input.triggerRunning) return { action: 'skip', reason: 'overlap' };
    if (input.userAtLimit) return { action: 'skip', reason: 'busy' };
    return { action: 'start' };
  }
  const mustWait = input.queued > 0 || input.triggerRunning || input.userAtLimit || input.rateExhausted;
  if (!mustWait) return { action: 'start' };
  if (input.mode === 'coalesce') return { action: 'enqueue', replaceWaiting: true };
  if (input.queued >= TRIGGER_QUEUE_MAX) return { action: 'reject', error: 'queue_full' };
  return { action: 'enqueue', replaceWaiting: false };
}

/**
 * Only an accepted call (started or queued) keeps its Idempotency-Key. A
 * skipped or refused call tells the sender to come back; the retry with the
 * same key has to be admitted again, not answered `duplicate` for a call that
 * never ran.
 */
export function admissionKeepsIdempotencyKey(decision: Admission): boolean {
  return decision.action === 'start' || decision.action === 'enqueue';
}

/** The `Idempotency-Key` header, or an error when it is unusable. */
export function idempotencyKeyFromHeaders(
  headers: Record<string, string | string[] | undefined>
): { key: string | null } | { error: 'invalid_idempotency_key' } {
  const raw = headers['idempotency-key'];
  if (raw === undefined) return { key: null };
  const key = typeof raw === 'string' ? raw.trim() : '';
  if (!key || key.length > IDEMPOTENCY_KEY_MAX_CHARS) return { error: 'invalid_idempotency_key' };
  return { key };
}

/** A short, single-line look at a payload for an inbox entry. */
function payloadPreview(payload: unknown, max = 300): string {
  const json = (JSON.stringify(payload ?? null) ?? 'null').replace(/\s+/g, ' ');
  return json.length > max ? `${json.slice(0, max)}…` : json;
}

// ── Service ──────────────────────────────────────────────────────────────────

export type TriggerRow = {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  agent_id: string | null;
  task_id: string | null;
  chain_id: string | null;
  prompt_template: string;
  approval_mode: 'inbox' | 'granted' | 'denied';
  inbox_result: 'always' | 'errors' | 'never';
  chat_id: string | null;
  project_id: string | null;
  chat_title_template: string;
  rate_limit_per_min: number;
  overlap_mode: OverlapMode;
  active: boolean;
  last_triggered_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type IncomingResult =
  | { status: 202; body: { status: 'accepted'; event_id: string; run_id: string } }
  | { status: 202; body: { status: 'queued'; event_id: string } }
  | { status: 202; body: { status: 'duplicate'; event_id: string } }
  | { status: 202; body: { status: 'skipped'; reason: 'overlap' | 'busy' } }
  | { status: 400 | 401 | 404 | 429 | 503; body: { error: string } };

const FAILED_AUTH_LIMIT = 20;
const FAILED_AUTH_WINDOW_MS = 60_000;

export class TriggerService {
  private log: FastifyBaseLogger;
  private rate = new SlidingWindowLimiter(60_000);
  private failedAuth = new SlidingWindowLimiter(FAILED_AUTH_WINDOW_MS);
  private runningByTrigger = new Map<string, number>();
  private runningByUser = new Map<string, number>();
  private locks = new Map<string, Promise<unknown>>();
  private pumping = false;
  private pumpAgain = false;
  private pruneTimer: ReturnType<typeof setInterval>;
  private queueTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private db: Pool,
    private runService: RunService,
    private inboxService: InboxService,
    logger: FastifyBaseLogger
  ) {
    this.log = logger.child({ component: 'TriggerService' });
    this.pruneTimer = setInterval(() => { this.rate.prune(); this.failedAuth.prune(); }, 5 * 60_000);
    this.pruneTimer.unref?.();
  }

  private async asSystem<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    return withRls(this.db, SYSTEM_USER_ID, 'admin', fn);
  }

  /**
   * Called once on start: closes what the previous process left behind and
   * starts working off the calls that are still waiting — those survive a restart.
   */
  async start(): Promise<void> {
    await this.closeOrphanedEvents();
    this.queueTimer = setInterval(() => this.schedulePump(), TRIGGER_QUEUE_TICK_MS);
    this.queueTimer.unref?.();
    this.schedulePump();
  }

  /**
   * A run does not survive a restart of the host; an event still marked as
   * started by the previous process would claim otherwise forever. It is not
   * run again: it may have done half its work already (a reply sent), and a
   * second run would repeat that. The owner hears about it in the inbox instead.
   */
  async closeOrphanedEvents(): Promise<void> {
    try {
      const closed = await this.asSystem(async (client) => {
        const res = await client.query(
          `WITH closed AS (
             UPDATE app.trigger_events SET status = 'error', error = 'The host was restarted while this run was active.'
             WHERE status = 'started'
             RETURNING id, trigger_id, user_id, run_id, received_at
           )
           SELECT closed.*, t.name, t.inbox_result FROM closed JOIN app.triggers t ON t.id = closed.trigger_id`
        );
        return res.rows as Array<{ trigger_id: string; user_id: string; run_id: string | null; received_at: Date; name: string; inbox_result: string }>;
      });
      for (const row of closed) {
        if (row.inbox_result === 'never') continue;
        await this.inboxService.add({
          userId: row.user_id,
          kind: 'error',
          title: row.name,
          summary: `The host was restarted while this run was active (call received ${new Date(row.received_at).toISOString()}). It was not started again.`,
          runId: row.run_id ?? undefined,
          triggerType: 'webhook',
          triggerId: row.trigger_id
        });
      }
    } catch (err) {
      this.log.error({ err }, 'Failed to close orphaned trigger events');
    }
  }

  /** Global switch; off makes the endpoint answer as if it did not exist. */
  async enabled(): Promise<boolean> {
    return getSystemFlag(this.db, 'triggers_enabled', true);
  }

  /**
   * Handles one incoming call. Unknown id, inactive trigger and wrong token
   * answer alike, so the response says nothing about which triggers exist.
   */
  async handleIncoming(input: {
    id: string;
    token: string | null;
    payload: unknown;
    clientIp: string;
    idempotencyKey?: string | null;
  }): Promise<IncomingResult> {
    if (!(await this.enabled())) return { status: 404, body: { error: 'not_found' } };

    // Each attempt costs a database lookup; a client that keeps failing is cut off before it.
    if (this.failedAuth.exhausted(input.clientIp, FAILED_AUTH_LIMIT)) {
      return { status: 429, body: { error: 'too_many_failed_attempts' } };
    }

    const trigger = isUuid(input.id)
      ? await this.asSystem(async (client) => {
          const res = await client.query('SELECT * FROM app.triggers WHERE id = $1 AND active = true', [input.id]);
          return res.rows[0] as TriggerRow | undefined;
        })
      : undefined;

    if (!trigger || !triggerTokenMatches(trigger.token_hash, input.token)) {
      this.failedAuth.allow(input.clientIp, FAILED_AUTH_LIMIT);
      this.log.warn({ triggerId: input.id, clientIp: input.clientIp, known: Boolean(trigger) }, 'Rejected trigger call');
      return { status: 401, body: { error: 'unauthorized' } };
    }

    return this.fire(trigger, input.payload, 'webhook', input.idempotencyKey ?? null);
  }

  /**
   * Admits an authenticated call (or a test from the UI): starts its run,
   * puts it in the queue, skips or refuses it. Returns at once; a run
   * continues in the background.
   *
   * Decisions for one trigger are taken one after the other, so two calls
   * arriving together cannot both find the trigger idle.
   */
  async fire(
    trigger: TriggerRow,
    payload: unknown,
    source: 'webhook' | 'test',
    idempotencyKey: string | null = null
  ): Promise<IncomingResult> {
    return this.withLock(trigger.id, async (): Promise<IncomingResult> => {
      if (idempotencyKey) {
        const known = await this.findByIdempotencyKey(trigger.id, idempotencyKey);
        if (known) return { status: 202, body: { status: 'duplicate', event_id: known } };
      }

      const queued = trigger.overlap_mode === 'skip' ? 0 : await this.countQueued(trigger.id);
      // From here to the reservation nothing is awaited, so the counters cannot change in between.
      const decision = decideAdmission({
        mode: trigger.overlap_mode,
        queued,
        ...this.capacity(trigger)
      });

      const key = admissionKeepsIdempotencyKey(decision) ? idempotencyKey : null;

      switch (decision.action) {
        case 'start': {
          this.reserve(trigger);
          this.rate.allow(trigger.id, trigger.rate_limit_per_min);
          const runId = randomUUID();
          const eventId = await this.logEvent(trigger, { status: 'started', source, payload, runId, idempotencyKey: key });
          this.launch(trigger, payload, runId, eventId);
          return { status: 202, body: { status: 'accepted', event_id: eventId ?? '', run_id: runId } };
        }
        case 'enqueue': {
          const eventId = await this.enqueue(trigger, payload, source, key, decision.replaceWaiting);
          // Not stored means not queued: say so, so that the sender tries again.
          if (!eventId) return { status: 503, body: { error: 'queue_unavailable' } };
          return { status: 202, body: { status: 'queued', event_id: eventId } };
        }
        // Skipped and refused calls are logged without the key (see admissionKeepsIdempotencyKey).
        case 'skip':
          await this.logEvent(trigger, {
            status: decision.reason === 'overlap' ? 'overlap_skipped' : 'busy',
            source, payload
          });
          return { status: 202, body: { status: 'skipped', reason: decision.reason } };
        case 'reject':
          await this.logEvent(trigger, { status: decision.error, source, payload });
          return { status: 429, body: { error: decision.error } };
      }
    });
  }

  /** Sets every waiting call of a trigger to `expired`, e.g. when it is switched off. */
  async expireQueued(triggerId: string, reason: string): Promise<number> {
    return this.asSystem(async (client) => {
      const res = await client.query(
        `UPDATE app.trigger_events SET status = 'expired', error = $2, queued_payload = NULL
         WHERE trigger_id = $1 AND status = 'queued'`,
        [triggerId, reason]
      );
      return res.rowCount ?? 0;
    });
  }

  /** Drops one waiting call by hand. False when it is not waiting (any more). */
  async cancelQueued(triggerId: string, eventId: string): Promise<boolean> {
    return this.withLock(triggerId, () =>
      this.asSystem(async (client) => {
        const res = await client.query(
          `UPDATE app.trigger_events SET status = 'cancelled', error = 'Discarded by hand.', queued_payload = NULL
           WHERE id = $1 AND trigger_id = $2 AND status = 'queued'`,
          [eventId, triggerId]
        );
        return (res.rowCount ?? 0) > 0;
      })
    );
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** Runs `fn` after every earlier call for the same key has finished. */
  private withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const result = previous.then(fn, fn);
    const tail = result.then(() => undefined, () => undefined);
    this.locks.set(key, tail);
    void tail.then(() => {
      if (this.locks.get(key) === tail) this.locks.delete(key);
    });
    return result;
  }

  private capacity(trigger: TriggerRow) {
    return {
      triggerRunning: (this.runningByTrigger.get(trigger.id) ?? 0) > 0,
      userAtLimit: (this.runningByUser.get(trigger.user_id) ?? 0) >= TRIGGER_MAX_CONCURRENT_PER_USER,
      rateExhausted: this.rate.exhausted(trigger.id, trigger.rate_limit_per_min)
    };
  }

  private reserve(trigger: TriggerRow): void {
    this.bump(this.runningByTrigger, trigger.id, 1);
    this.bump(this.runningByUser, trigger.user_id, 1);
  }

  private release(trigger: TriggerRow): void {
    this.bump(this.runningByTrigger, trigger.id, -1);
    this.bump(this.runningByUser, trigger.user_id, -1);
  }

  private bump(map: Map<string, number>, key: string, delta: number): void {
    const next = (map.get(key) ?? 0) + delta;
    if (next <= 0) map.delete(key);
    else map.set(key, next);
  }

  /** Starts the run of a reserved slot; the slot is freed and the queue looked at when it ends. */
  private launch(trigger: TriggerRow, payload: unknown, runId: string, eventId: string | null): void {
    void this.execute(trigger, payload, runId, eventId)
      .catch((err) => this.log.error({ err, triggerId: trigger.id }, 'Trigger run failed'))
      .finally(() => {
        this.release(trigger);
        this.schedulePump();
      });
  }

  /** An accepted call with this key; skipped and refused calls never carry one (see fire). */
  private async findByIdempotencyKey(triggerId: string, key: string): Promise<string | null> {
    return this.asSystem(async (client) => {
      const res = await client.query(
        `SELECT id FROM app.trigger_events
         WHERE trigger_id = $1 AND idempotency_key = $2
           AND status NOT IN ('overlap_skipped', 'busy', 'rate_limited', 'queue_full')
         LIMIT 1`,
        [triggerId, key]
      );
      return (res.rows[0]?.id as string | undefined) ?? null;
    });
  }

  private async countQueued(triggerId: string): Promise<number> {
    return this.asSystem(async (client) => {
      const res = await client.query(
        `SELECT count(*)::int AS n FROM app.trigger_events WHERE trigger_id = $1 AND status = 'queued'`,
        [triggerId]
      );
      return res.rows[0]?.n ?? 0;
    });
  }

  private async enqueue(
    trigger: TriggerRow,
    payload: unknown,
    source: 'webhook' | 'test',
    idempotencyKey: string | null,
    replaceWaiting: boolean
  ): Promise<string | null> {
    if (replaceWaiting) {
      try {
        await this.asSystem(async (client) => {
          await client.query(
            `UPDATE app.trigger_events SET status = 'superseded', error = 'Replaced by a newer call.', queued_payload = NULL
             WHERE trigger_id = $1 AND status = 'queued'`,
            [trigger.id]
          );
        });
      } catch (err) {
        this.log.error({ err, triggerId: trigger.id }, 'Failed to replace the waiting trigger call');
      }
    }
    return this.logEvent(trigger, { status: 'queued', source, payload, idempotencyKey, queued: true });
  }

  /** Looks at the waiting calls soon; repeated requests while it runs fold into one more pass. */
  private schedulePump(): void {
    if (this.pumping) {
      this.pumpAgain = true;
      return;
    }
    this.pumping = true;
    void (async () => {
      try {
        do {
          this.pumpAgain = false;
          await this.pumpOnce();
        } while (this.pumpAgain);
      } catch (err) {
        this.log.error({ err }, 'Failed to work off the trigger queue');
      } finally {
        this.pumping = false;
      }
    })();
  }

  private async pumpOnce(): Promise<void> {
    await this.expireStale();
    // Oldest waiting call first, so no trigger starves another of the same user.
    const triggers = await this.asSystem(async (client) => {
      const res = await client.query(
        `SELECT t.* FROM app.triggers t
         JOIN (SELECT trigger_id, min(received_at) AS oldest FROM app.trigger_events
               WHERE status = 'queued' GROUP BY trigger_id) q ON q.trigger_id = t.id
         ORDER BY q.oldest`
      );
      return res.rows as TriggerRow[];
    });
    for (const trigger of triggers) {
      await this.withLock(trigger.id, () => this.startNextQueued(trigger));
    }
  }

  private async startNextQueued(trigger: TriggerRow): Promise<void> {
    const { triggerRunning, userAtLimit, rateExhausted } = this.capacity(trigger);
    if (triggerRunning || userAtLimit || rateExhausted) return;
    // Reserved before the claim is awaited: another trigger of the same user
    // may take a slot meanwhile, and the limit has to hold against it.
    this.reserve(trigger);
    const runId = randomUUID();
    let claimed: { id: string; queued_payload: unknown; payload: unknown } | undefined;
    try {
      claimed = await this.asSystem(async (client) => {
        const res = await client.query(
          `UPDATE app.trigger_events SET status = 'started', started_at = now(), run_id = $2, queued_payload = NULL
           WHERE id = (SELECT id FROM app.trigger_events WHERE trigger_id = $1 AND status = 'queued'
                       ORDER BY received_at LIMIT 1 FOR UPDATE SKIP LOCKED)
           RETURNING id, queued_payload, payload`,
          [trigger.id, runId]
        );
        return res.rows[0];
      });
    } catch (err) {
      this.release(trigger);
      throw err;
    }
    if (!claimed) {
      this.release(trigger);
      return;
    }
    this.rate.allow(trigger.id, trigger.rate_limit_per_min);
    this.launch(trigger, claimed.queued_payload ?? claimed.payload, runId, claimed.id);
  }

  /** Calls that waited longer than allowed are not run; the owner is told, unless results are switched off. */
  private async expireStale(): Promise<void> {
    const expired = await this.asSystem(async (client) => {
      const res = await client.query(
        `WITH expired AS (
           UPDATE app.trigger_events
              SET status = 'expired', queued_payload = NULL,
                  error = $2
            WHERE status = 'queued' AND received_at < now() - make_interval(hours => $1::int)
            RETURNING trigger_id, user_id, payload, received_at
         )
         SELECT expired.*, t.name, t.inbox_result FROM expired JOIN app.triggers t ON t.id = expired.trigger_id`,
        [TRIGGER_QUEUE_MAX_AGE_HOURS, `Waited longer than ${TRIGGER_QUEUE_MAX_AGE_HOURS} hours and was not run.`]
      );
      return res.rows as Array<{ trigger_id: string; user_id: string; payload: unknown; received_at: Date; name: string; inbox_result: string }>;
    });
    for (const row of expired) {
      if (row.inbox_result === 'never') continue;
      await this.inboxService.add({
        userId: row.user_id,
        kind: 'error',
        title: row.name,
        summary: `A call received ${new Date(row.received_at).toISOString()} waited longer than ${TRIGGER_QUEUE_MAX_AGE_HOURS} hours and was not run. ${payloadPreview(row.payload)}`,
        triggerType: 'webhook',
        triggerId: row.trigger_id
      });
    }
  }

  private async execute(trigger: TriggerRow, payload: unknown, runId: string, eventId: string | null): Promise<void> {
    let chatId: string | null = null;
    let error: string | null = null;
    try {
      const runUser = await loadRunUser(this.db, trigger.user_id);
      if (!runUser) throw new Error('The owner of this trigger no longer exists.');

      // Rights can change after the trigger was saved; what the owner may not
      // use today must not run because it was allowed once.
      if (!(await this.targetAccessible(trigger.user_id, runUser.role, trigger))) {
        throw new Error('The owner of this trigger has no access to its agent or chain.');
      }

      const timezone = await withTransaction(this.db, async (client) => {
        await client.query(`SELECT set_config('app.user_role', 'admin', true)`);
        await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [trigger.user_id]);
        const globalRuntime = await loadGlobalRuntime(this.db, client);
        return globalRuntime.timezone || process.env.APP_TIMEZONE || 'Europe/Berlin';
      });
      const timestamp = new Date().toLocaleString(runUser.language === 'de' ? 'de-DE' : 'en-US', { timeZone: timezone });

      const result = await executeBackgroundRun(
        { db: this.db, runService: this.runService, inboxService: this.inboxService, log: this.log },
        {
          userId: trigger.user_id,
          role: runUser.role,
          language: runUser.language,
          timezone,
          name: trigger.name,
          trigger: { type: 'webhook', id: trigger.id },
          agentId: trigger.agent_id,
          taskId: trigger.task_id,
          chainId: trigger.chain_id,
          systemNote: buildAutomationSystemNote('webhook', trigger.name),
          message: renderTriggerPrompt(trigger.prompt_template, payload, { name: trigger.name, timestamp }),
          chatId: trigger.chat_id,
          projectId: trigger.project_id,
          chatTitleTemplate: renderTriggerTitle(trigger.chat_title_template || 'Trigger: {{name}} [{{timestamp}}]', payload),
          approval: trigger.approval_mode,
          inboxResult: trigger.inbox_result,
          runId
        }
      );
      chatId = result.chatId;
      error = result.errorMessage;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      this.log.error({ err, triggerId: trigger.id }, 'Trigger could not run');
      // The run never started, so nothing else would tell the owner.
      if (trigger.inbox_result !== 'never') {
        await this.inboxService.add({
          userId: trigger.user_id,
          kind: 'error',
          title: trigger.name,
          summary: error,
          runId,
          triggerType: 'webhook',
          triggerId: trigger.id
        });
      }
    }

    try {
      await this.asSystem(async (client) => {
        await client.query(
          'UPDATE app.triggers SET last_triggered_at = now(), last_error = $2 WHERE id = $1',
          [trigger.id, error]
        );
        if (eventId) {
          await client.query(
            'UPDATE app.trigger_events SET status = $2, error = $3, chat_id = $4 WHERE id = $1',
            [eventId, error ? 'error' : 'success', error, chatId]
          );
        }
      });
    } catch (err) {
      this.log.error({ err, triggerId: trigger.id }, 'Failed to record trigger outcome');
    }
  }

  /** True when the user can see every target the trigger names — the same rows the chat would offer. */
  async targetAccessible(
    userId: string,
    role: string,
    target: { agent_id?: string | null; task_id?: string | null; chain_id?: string | null }
  ): Promise<boolean> {
    return withRls(this.db, userId, role, async (client) => {
      const checks: Array<[string, string | null | undefined]> = [
        ['app.agents', target.agent_id],
        ['app.tasks', target.task_id],
        ['app.chains', target.chain_id]
      ];
      for (const [table, id] of checks) {
        if (!id) continue;
        if (!isUuid(id)) return false;
        const res = await client.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
        if (res.rowCount === 0) return false;
      }
      return true;
    });
  }

  private async logEvent(
    trigger: TriggerRow,
    event: {
      status: string;
      source: 'webhook' | 'test';
      payload: unknown;
      runId?: string;
      idempotencyKey?: string | null;
      /** Keeps the full payload for the run that will take it from the queue. */
      queued?: boolean;
    }
  ): Promise<string | null> {
    try {
      return await this.asSystem(async (client) => {
        const res = await client.query(
          `INSERT INTO app.trigger_events
             (trigger_id, user_id, status, source, run_id, payload, queued_payload, idempotency_key, started_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, CASE WHEN $3 = 'started' THEN now() END)
           RETURNING id`,
          [
            trigger.id, trigger.user_id, event.status, event.source, event.runId ?? null,
            JSON.stringify(payloadForEventLog(event.payload)),
            event.queued ? JSON.stringify(event.payload ?? null) : null,
            event.idempotencyKey ?? null
          ]
        );
        // Keep the newest entries only; the log answers "what happened lately",
        // not "ever". Waiting calls are not history yet and are never pruned.
        await client.query(
          `DELETE FROM app.trigger_events WHERE trigger_id = $1 AND id IN (
             SELECT id FROM app.trigger_events WHERE trigger_id = $1 AND status <> 'queued'
             ORDER BY received_at DESC OFFSET $2)`,
          [trigger.id, TRIGGER_EVENTS_KEPT]
        );
        return res.rows[0].id as string;
      });
    } catch (err) {
      this.log.error({ err, triggerId: trigger.id }, 'Failed to write trigger event');
      return null;
    }
  }
}
