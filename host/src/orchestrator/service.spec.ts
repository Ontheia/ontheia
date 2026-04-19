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
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { OrchestratorService } from './service.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
let projectRoot = path.resolve(__dirname, '../../..');
const distIndex = projectRoot.indexOf(`${path.sep}dist`);
if (distIndex !== -1) {
  projectRoot = path.dirname(projectRoot.slice(0, distIndex));
}

function createService() {
  return new OrchestratorService(
    {
      allowlistImages: path.join(projectRoot, 'config/allowlist.images'),
      allowlistUrls: path.join(projectRoot, 'config/allowlist.urls'),
      allowlistPackages: {
        npm: path.join(projectRoot, 'config/allowlist.packages.npm'),
        pypi: path.join(projectRoot, 'config/allowlist.packages.pypi'),
        bun: path.join(projectRoot, 'config/allowlist.packages.bun')
      },
      hardening: path.join(projectRoot, 'config/orchestrator.hardening.json')
    },
    { dockerHost: undefined }
  );
}

const payload = {
  mcpServers: {
    filesystem: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/mnt/docs'],
      env: {
        API_KEY: 'secret:TEST_FILESYSTEM_KEY',
        BASE_URL: 'https://example.test'
      }
    }
  }
};

test('preview masks secrets and keeps plain env values', () => {
  process.env.TEST_FILESYSTEM_KEY = 'super-secret-value';

  const service = createService();
  const preview = service.preview(payload);
  const serverPreview = preview.filesystem;

  assert.equal(serverPreview.env.API_KEY, '***');
  assert.equal(serverPreview.env.BASE_URL, 'https://example.test');
  assert(!serverPreview.missingSecrets || serverPreview.missingSecrets.length === 0);

  delete process.env.TEST_FILESYSTEM_KEY;
});

test('start blocks servers with missing secrets', async () => {
  delete process.env.TEST_FILESYSTEM_KEY;

  const service = createService();
  const preview = service.preview(payload);
  assert.ok(preview.filesystem.missingSecrets);
  assert.ok(preview.filesystem.missingSecrets?.includes('API_KEY'));

  const result = await service.start(payload);

  assert.ok(result.launch);
  assert.equal(result.launch?.filesystem, 'missing_secrets');
  assert.ok(result.preview.filesystem.missingSecrets);
  assert.ok(result.preview.filesystem.missingSecrets?.includes('API_KEY'));
});
