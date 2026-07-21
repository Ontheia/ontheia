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
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFilesEnvelope, envelopeMetadata, kindForPath } from './ArtifactService.js';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

const cliResult = (stdout: string, exitCode = 0) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        stdout: stdout ? `<command_output>\n${stdout}\n</command_output>` : '',
        stderr: '',
        exit_code: exitCode
      })
    }
  ]
});

const readEvent = (stdout: string, opts: { args?: string[]; exitCode?: number; script?: string } = {}) => ({
  server: 'cli-tools',
  tool: 'run_skill_script',
  arguments: {
    skill_dir: '/skills/files',
    script_path: opts.script ?? 'scripts/read.py',
    args: opts.args ?? ['/data/notes/x.md']
  },
  result: cliResult(stdout, opts.exitCode ?? 0)
});

test('extractFilesEnvelope: single complete read', () => {
  const stdout = `=== /data/notes/x.md (12 bytes, sha256 ${SHA_A}) ===\nHello world\n`;
  const entries = extractFilesEnvelope(readEvent(stdout));
  assert.ok(entries);
  assert.equal(entries!.length, 1);
  assert.equal(entries![0].path, '/data/notes/x.md');
  assert.equal(entries![0].bytes, 12);
  assert.equal(entries![0].sha256, SHA_A);
  assert.equal(entries![0].complete, true);
  assert.equal(entries![0].content, 'Hello world\n');
});

test('extractFilesEnvelope: multiple files in one result', () => {
  const stdout = [
    `=== /data/a.md (3 bytes, sha256 ${SHA_A}) ===`,
    'aaa',
    `=== /data/b.md (3 bytes, sha256 ${SHA_B}) ===`,
    'bbb'
  ].join('\n');
  const entries = extractFilesEnvelope(readEvent(stdout, { args: ['/data/a.md', '/data/b.md'] }));
  assert.equal(entries!.length, 2);
  assert.equal(entries![0].path, '/data/a.md');
  assert.equal(entries![0].content, 'aaa');
  assert.equal(entries![1].path, '/data/b.md');
  assert.equal(entries![1].content, 'bbb');
});

test('extractFilesEnvelope: truncation marker flags the entry partial and is stripped', () => {
  const stdout = [
    `=== /data/big.md (99999 bytes, sha256 ${SHA_A}) ===`,
    'first chunk',
    '[TRUNCATED — continue with --offset 15000]'
  ].join('\n');
  const entries = extractFilesEnvelope(readEvent(stdout, { args: ['/data/big.md'] }));
  assert.equal(entries!.length, 1);
  assert.equal(entries![0].complete, false);
  assert.equal(entries![0].content, 'first chunk');
});

test('extractFilesEnvelope: --offset continuation is never a complete snapshot', () => {
  const stdout = `=== /data/big.md (99999 bytes, sha256 ${SHA_A}) ===\nmiddle chunk`;
  const entries = extractFilesEnvelope(
    readEvent(stdout, { args: ['/data/big.md', '--offset', '15000'] })
  );
  assert.equal(entries![0].complete, false);
});

test('extractFilesEnvelope: file paths containing parentheses parse correctly', () => {
  const stdout = `=== /data/note (final).md (5 bytes, sha256 ${SHA_A}) ===\nabc`;
  const entries = extractFilesEnvelope(readEvent(stdout, { args: ['/data/note (final).md'] }));
  assert.equal(entries![0].path, '/data/note (final).md');
});

test('extractFilesEnvelope: ignores other tools, other scripts and failed reads', () => {
  const stdout = `=== /data/x.md (3 bytes, sha256 ${SHA_A}) ===\nabc`;
  assert.equal(extractFilesEnvelope({ ...readEvent(stdout), tool: 'execute' }), null);
  assert.equal(extractFilesEnvelope({ ...readEvent(stdout), server: 'other' }), null);
  assert.equal(extractFilesEnvelope(readEvent(stdout, { script: 'scripts/write.py' })), null);
  assert.equal(extractFilesEnvelope(readEvent(stdout, { exitCode: 4 })), null);
  assert.equal(extractFilesEnvelope(readEvent('no headers here')), null);
});

test('extractFilesEnvelope: content lines that look like headers of OTHER files stay content', () => {
  // Only lines matching the exact header shape start a new entry; ordinary
  // markdown separators must not.
  const stdout = [
    `=== /data/x.md (30 bytes, sha256 ${SHA_A}) ===`,
    '# Title',
    '=== not a header ===',
    'tail'
  ].join('\n');
  const entries = extractFilesEnvelope(readEvent(stdout, { args: ['/data/x.md'] }));
  assert.equal(entries!.length, 1);
  assert.equal(entries![0].content, '# Title\n=== not a header ===\ntail');
});

test('envelopeMetadata strips content', () => {
  const stdout = `=== /data/x.md (3 bytes, sha256 ${SHA_A}) ===\nabc`;
  const entries = extractFilesEnvelope(readEvent(stdout, { args: ['/data/x.md'] }))!;
  const meta = envelopeMetadata(entries);
  assert.deepEqual(meta, [{ path: '/data/x.md', sha256: SHA_A, bytes: 3, complete: true }]);
  assert.ok(!('content' in meta[0]));
});

test('kindForPath: kind follows the file extension', () => {
  assert.equal(kindForPath('/data/notes/x.md'), 'markdown');
  assert.equal(kindForPath('/data/notes/X.MD'), 'markdown');
  assert.equal(kindForPath('/data/notes/readme.markdown'), 'markdown');
  assert.equal(kindForPath('/data/diagram.mmd'), 'mermaid');
  assert.equal(kindForPath('/data/flow.mermaid'), 'mermaid');
  assert.equal(kindForPath('/data/notes/x.txt'), 'text');
  assert.equal(kindForPath('/data/config.yaml'), 'text');
  assert.equal(kindForPath('/data/script.py'), 'text');
  assert.equal(kindForPath('/data/no-extension'), 'text');
  assert.equal(kindForPath('/data/note (final).md'), 'markdown');
});

const writeEvent = (stdout: string, args: Record<string, unknown>) => ({
  server: 'cli-tools',
  tool: 'run_skill_script',
  arguments: { skill_dir: '/skills/files', script_path: 'scripts/write.py', ...args },
  result: cliResult(stdout, 0)
});

test('extractFilesEnvelope: write.py confirmation yields a verified snapshot', async () => {
  const { createHash } = await import('node:crypto');
  const content = 'Hallo Sascha,\n\nviele Grüße\n';
  const sha = createHash('sha256').update(content, 'utf8').digest('hex');
  const stdout = `Written: /data/entwurf.md (${Buffer.byteLength(content)} bytes, sha256 ${sha})`;
  const entries = extractFilesEnvelope(
    writeEvent(stdout, { args: ['/data/entwurf.md'], input_data: content })
  );
  assert.ok(entries);
  assert.equal(entries!.length, 1);
  assert.equal(entries![0].path, '/data/entwurf.md');
  assert.equal(entries![0].sha256, sha);
  assert.equal(entries![0].complete, true);
  assert.equal(entries![0].content, content);
});

test('extractFilesEnvelope: write.py applies the literal-\\n repair and trailing newline', async () => {
  const { createHash } = await import('node:crypto');
  // Model sent escape-damaged single-line input; cli_server repairs it and
  // write.py appends the trailing newline — the sha confirms the repaired form.
  const inputData = 'Zeile 1\\nZeile 2';
  const written = 'Zeile 1\nZeile 2\n';
  const sha = createHash('sha256').update(written, 'utf8').digest('hex');
  const stdout = `Written: /data/x.md (${Buffer.byteLength(written)} bytes, sha256 ${sha})`;
  const entries = extractFilesEnvelope(writeEvent(stdout, { args: ['/data/x.md'], input_data: inputData }));
  assert.equal(entries![0].content, written);
});

test('extractFilesEnvelope: write.py with unverifiable content yields no envelope', () => {
  const stdout = `Written: /data/x.md (10 bytes, sha256 ${SHA_A})`;
  const entries = extractFilesEnvelope(writeEvent(stdout, { args: ['/data/x.md'], input_data: 'something else' }));
  assert.equal(entries, null);
});
