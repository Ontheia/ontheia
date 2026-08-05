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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMemorySearch, handleMemoryUpdate } from './memory.js';

function makeDb(agentMemory: Record<string, unknown> | null) {
  return {
    async query(sql: string, _params?: unknown[]) {
      if (sql.includes('app.agent_config')) {
        if (agentMemory === null) return { rowCount: 0, rows: [] };
        return { rowCount: 1, rows: [{ memory: agentMemory }] };
      }
      if (sql.includes('app.tasks')) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    }
  };
}

const FAKE_HIT = {
  id: 'h1',
  namespace: 'contacts',
  content: 'Max Mustermann, CEO',
  metadata: {},
  created_at: new Date(),
  relevance: 0.95
};

function makeAdapter(hits: any[] = [FAKE_HIT]) {
  return {
    search: async (_namespaces: string[], _opts: any, _client?: any) => hits
  };
}

test('handleMemorySearch: contacts in tool_read_namespaces → erlaubt, Treffer zurückgegeben', async () => {
  const db = makeDb({ tool_read_namespaces: ['contacts'] });
  const adapter = makeAdapter();

  const result = await handleMemorySearch(
    db as any,
    adapter as any,
    { query: 'Max', namespaces: ['contacts'] },
    { run: { agent_id: 'agent-1', task_id: undefined as any, options: {} } }
  );

  assert.ok(Array.isArray(result.hits), 'hits ist ein Array');
  assert.equal(result.hits.length, 1, 'genau ein Treffer erwartet');
  assert.equal(result.hits[0].namespace, 'contacts');
  assert.ok((result.namespaces as string[]).includes('contacts'), '"contacts" in result.namespaces');
});

// Regression: ohne Namespace-Angabe wurden ausschließlich read_namespaces
// aufgelöst. Eine Policy, deren einziger globaler Eintrag tool_read war, lieferte
// dadurch auf gut formulierte Suchen null Treffer — obwohl die Werkzeug-
// beschreibung "omit to search everything your policy allows" zusagt.
test('handleMemorySearch: ohne Namespace-Angabe werden alle tool_read_namespaces durchsucht', async () => {
  const db = makeDb({
    read_namespaces: ['vector.user.u1.*'],
    tool_read_namespaces: ['vector.user.u1.*', 'vector.global.*']
  });
  const adapter = makeAdapter();

  for (const args of [{ query: 'Max' }, { query: 'Max', namespaces: [] }]) {
    const result = await handleMemorySearch(
      db as any,
      adapter as any,
      args,
      { run: { agent_id: 'agent-1', task_id: undefined as any, options: {} } }
    );

    assert.deepEqual(
      result.namespaces,
      ['vector.user.u1.*', 'vector.global.*'],
      'genau die Tool-Zugriffsliste, unabhängig von [] oder weggelassen'
    );
    assert.equal(result.hits.length, 1, 'Treffer erreicht den Aufrufer');
  }
});

// Die Trennung ist der Zweck der zwei Felder: was nur unter "Lesen" steht, wird
// auto-injiziert und ist für das Werkzeug nicht erreichbar — auch nicht, wenn
// das Modell den Namespace ausdrücklich nennt.
test('handleMemorySearch: nur in read_namespaces eingetragener Namespace bleibt dem Werkzeug verwehrt', async () => {
  const db = makeDb({
    read_namespaces: ['vector.agent.u1.memory'],
    tool_read_namespaces: ['vector.global.*']
  });
  const adapter = makeAdapter();

  const explicit = await handleMemorySearch(
    db as any,
    adapter as any,
    { query: 'Max', namespaces: ['vector.agent.u1.memory'] },
    { run: { agent_id: 'agent-1', task_id: undefined as any, options: {} } }
  );
  assert.equal(explicit.hits.length, 0, 'explizite Nennung erweitert den Zugriff nicht');

  const implicit = await handleMemorySearch(
    db as any,
    adapter as any,
    { query: 'Max', namespaces: [] },
    { run: { agent_id: 'agent-1', task_id: undefined as any, options: {} } }
  );
  assert.deepEqual(implicit.namespaces, ['vector.global.*'], 'read-only-Namespace nicht dabei');
});

test('handleMemorySearch: doppelt eingetragenes Muster erscheint nur einmal', async () => {
  const db = makeDb({ tool_read_namespaces: ['contacts', 'contacts'] });
  const adapter = makeAdapter();

  const result = await handleMemorySearch(
    db as any,
    adapter as any,
    { query: 'Max' },
    { run: { agent_id: 'agent-1', task_id: undefined as any, options: {} } }
  );

  assert.deepEqual(result.namespaces, ['contacts'], 'keine Dublette im Trace');
});

test('handleMemorySearch: contacts weder in read_namespaces noch tool_read_namespaces → abgelehnt', async () => {
  const db = makeDb({ read_namespaces: ['vector.global.knowledge'] });
  const adapter = makeAdapter();

  const result = await handleMemorySearch(
    db as any,
    adapter as any,
    { query: 'Max', namespaces: ['contacts'] },
    { run: { agent_id: 'agent-1', task_id: undefined as any, options: {} } }
  );

  assert.ok(Array.isArray(result.hits), 'hits ist ein Array');
  assert.equal(result.hits.length, 0, 'keine Treffer — Namespace abgelehnt');
  assert.equal(result.namespaces.length, 0, 'keine autorisierten Namespaces');
  assert.ok(typeof result.message === 'string' && result.message.length > 0, 'Fehlermeldung vorhanden');
});

// ── Tag-Filter ───────────────────────────────────────────────────────────────
// Der Adapter nimmt Metadatenfilter, seit er geschrieben wurde; durchgereicht
// hat sie nie jemand — während memory-write seine Tags von Anfang an als "for
// filtering" beschreibt. Diese Tests halten den Durchreicher fest.

function makeCapturingAdapter(hits: any[] = [FAKE_HIT]) {
  const seen: any[] = [];
  return {
    seen,
    search: async (_namespaces: string[], opts: any, _client?: any) => {
      seen.push(opts);
      return hits;
    }
  };
}

test('handleMemorySearch: tags werden als Filter an den Adapter gereicht', async () => {
  const db = makeDb({ tool_read_namespaces: ['contacts'] });
  const adapter = makeCapturingAdapter();

  await handleMemorySearch(
    db as any,
    adapter as any,
    { query: 'Max', namespaces: ['contacts'], tags: ['projekt:ontheia', 'bereich:webui'] },
    { run: { agent_id: 'agent-1', task_id: undefined as any, options: {} } }
  );

  assert.deepEqual(adapter.seen[0].filters, { tags: ['projekt:ontheia', 'bereich:webui'] });
});

test('handleMemorySearch: leere oder blanke Tags erzeugen keinen Filter', async () => {
  const db = makeDb({ tool_read_namespaces: ['contacts'] });

  for (const tags of [[], ['', '   '], undefined]) {
    const adapter = makeCapturingAdapter();
    await handleMemorySearch(
      db as any,
      adapter as any,
      { query: 'Max', namespaces: ['contacts'], tags } as any,
      { run: { agent_id: 'agent-1', task_id: undefined as any, options: {} } }
    );
    // undefined statt { tags: [] }: ein leeres Containment-Array trifft je nach
    // Lesart alles oder nichts — die Frage darf gar nicht erst entstehen.
    assert.equal(adapter.seen[0].filters, undefined, `tags=${JSON.stringify(tags)}`);
  }
});

test('handleMemorySearch: null Treffer mit Filter sagt, dass der Namespace nicht leer sein muss', async () => {
  const db = makeDb({ tool_read_namespaces: ['contacts'] });
  const adapter = makeCapturingAdapter([]);

  const result: any = await handleMemorySearch(
    db as any,
    adapter as any,
    { query: 'Max', namespaces: ['contacts'], tags: ['projekt:tippfehler'] },
    { run: { agent_id: 'agent-1', task_id: undefined as any, options: {} } }
  );

  // Ein Filter, der nichts trifft, sieht aus wie ein leeres Gedächtnis. Ohne
  // diesen Hinweis schließt ein Modell aus einem vertippten Marker, es sei
  // nichts gespeichert — genau der Fehler, vor dem die query-Beschreibung warnt.
  assert.deepEqual(result.filtered_by, { tags: ['projekt:tippfehler'] });
  assert.match(result.message, /not mean the namespace is empty/);
});

test('handleMemorySearch: null Treffer ohne Filter bleibt ohne Zusatzmeldung', async () => {
  const db = makeDb({ tool_read_namespaces: ['contacts'] });
  const adapter = makeCapturingAdapter([]);

  const result: any = await handleMemorySearch(
    db as any,
    adapter as any,
    { query: 'Max', namespaces: ['contacts'] },
    { run: { agent_id: 'agent-1', task_id: undefined as any, options: {} } }
  );

  assert.equal(result.filtered_by, undefined);
  assert.equal(result.message, undefined);
});

// ── memory-update ────────────────────────────────────────────────────────────
// Der Schreibweg trifft über byte-genauen Inhalt. Ein Eintrag umzuhängen oder
// seinen Wortlaut zu korrigieren erzeugte damit stillschweigend einen zweiten.

function makeUpdateAdapter(result = true) {
  const calls: any[] = [];
  return {
    calls,
    search: async () => [],
    updateDocument: async (id: string, patch: any, _client?: any) => {
      calls.push({ id, patch });
      return result;
    }
  };
}

const WRITE_POLICY = {
  allow_tool_write: true,
  allowed_write_namespaces: ['vector.agent.${user_id}.memory']
};
const RUN_CTX = { run: { agent_id: 'agent-1', task_id: undefined as any, options: { metadata: { user_id: 'u1' } } } };

test('handleMemoryUpdate: reicht Tags und den Namespace als Wächter durch', async () => {
  const adapter = makeUpdateAdapter();
  const result: any = await handleMemoryUpdate(
    makeDb(WRITE_POLICY) as any,
    adapter as any,
    { id: 'e1', namespace: 'vector.agent.${user_id}.memory', tags: ['status:erledigt'] },
    RUN_CTX
  );

  assert.equal(result.success, true);
  // expectNamespace ist die Absicherung: updateDocument sucht die Zeile sonst
  // allein über die ID quer durch alle Tabellen, und die Berechtigung wäre
  // gegen einen bloß behaupteten Namespace geprüft worden.
  assert.equal(adapter.calls[0].patch.expectNamespace, 'vector.agent.u1.memory');
  assert.deepEqual(adapter.calls[0].patch.tags, ['status:erledigt']);
  assert.equal('content' in adapter.calls[0].patch, false, 'ohne content-Angabe bleibt der Text unberührt');
});

test('handleMemoryUpdate: Namespace ausserhalb der Schreibrechte wird abgelehnt', async () => {
  const adapter = makeUpdateAdapter();
  await assert.rejects(
    () => handleMemoryUpdate(
      makeDb(WRITE_POLICY) as any,
      adapter as any,
      { id: 'e1', namespace: 'vector.global.fremd', tags: ['x'] },
      RUN_CTX
    ),
    /not allowed/
  );
  assert.equal(adapter.calls.length, 0, 'der Adapter darf gar nicht erst gerufen werden');
});

test('handleMemoryUpdate: ohne Schreibrecht per Werkzeug abgelehnt', async () => {
  const adapter = makeUpdateAdapter();
  await assert.rejects(
    () => handleMemoryUpdate(
      makeDb({ ...WRITE_POLICY, allow_tool_write: false }) as any,
      adapter as any,
      { id: 'e1', namespace: 'vector.agent.${user_id}.memory', tags: ['x'] },
      RUN_CTX
    ),
    /disabled/
  );
  assert.equal(adapter.calls.length, 0);
});

test('handleMemoryUpdate: ohne Änderung wird gar nicht erst geschrieben', async () => {
  const adapter = makeUpdateAdapter();
  await assert.rejects(
    () => handleMemoryUpdate(
      makeDb(WRITE_POLICY) as any,
      adapter as any,
      { id: 'e1', namespace: 'vector.agent.${user_id}.memory' },
      RUN_CTX
    ),
    /Nothing to change/
  );
  assert.equal(adapter.calls.length, 0);
});

test('handleMemoryUpdate: Fehlschlag nennt den wahrscheinlichen Grund', async () => {
  const adapter = makeUpdateAdapter(false);
  const result: any = await handleMemoryUpdate(
    makeDb(WRITE_POLICY) as any,
    adapter as any,
    { id: 'gibt-es-nicht', namespace: 'vector.agent.${user_id}.memory', tags: ['x'] },
    RUN_CTX
  );

  assert.equal(result.success, false);
  assert.match(result.hint, /id and the namespace from the hit/);
});
