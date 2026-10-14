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
import { validateMcpServersConfig, type ValidationDeps } from './validator.js';

const deps: ValidationDeps = {
  imageAllowlist: ['mcp/filesystem-server', 'alpine:3'],
  urlAllowlist: ['localhost:8000'],
  packageAllowlist: {
    npm: ['@modelcontextprotocol/server-filesystem'],
    pypi: ['sample-pypi'],
    bun: []
  },
  hardening: {
    defaults: {
      securityOptions: ['no-new-privileges'],
      network: { name: 'ontheia-net' }
    }
  }
};

test('accepts valid npm exec configuration', () => {
  const result = validateMcpServersConfig(
    {
      mcpServers: {
        filesystem: {
          command: 'npm',
          args: ['exec', '--yes', '@modelcontextprotocol/server-filesystem', '--', '/data']
        }
      }
    },
    deps
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('rejects non-allowlisted npm package', () => {
  const result = validateMcpServersConfig(
    {
      mcpServers: {
        filesystem: {
          command: 'npm',
          args: ['exec', '--yes', '@unauthorized/package']
        }
      }
    },
    deps
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((err) => err.message.includes('is not in the allowlist')));
});

test('schema validation catches invalid pullPolicy', () => {
  const result = validateMcpServersConfig(
    {
      mcpServers: {
        filesystem: {
          command: 'docker',
          args: ['run', '-i', 'mcp/filesystem-server'],
          pullPolicy: 'invalid'
        }
      }
    },
    deps
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((err) => err.message.toLowerCase().includes('schema')));
});

test('rejects docker configs with unsafe flags', () => {
  const result = validateMcpServersConfig(
    {
      mcpServers: {
        filesystem: {
          command: 'docker',
          args: ['run', '-i', '--privileged', '-v', '/tmp:/tmp', 'mcp/filesystem-server']
        }
      }
    },
    deps
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((err) => err.message.includes('forbidden docker flags')));
  assert.ok(result.errors.some((err) => err.message.includes('must be configured as read-only')));
});

test('rejects network mismatches for docker configs', () => {
  const result = validateMcpServersConfig(
    {
      mcpServers: {
        filesystem: {
          command: 'docker',
          args: ['run', '-i', '--network=other-net', 'mcp/filesystem-server']
        }
      }
    },
    deps
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((err) => err.message.includes('network must match')));
});

test('rejects non-allowlisted docker image', () => {
  const result = validateMcpServersConfig(
    {
      mcpServers: {
        filesystem: {
          command: 'docker',
          args: ['run', '-i', 'unauthorized/image', '/data']
        }
      }
    },
    deps
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((err) => err.message.includes('is not in the allowlist')));
});

test('rejects non-allowlisted remote host', () => {
  const result = validateMcpServersConfig(
    {
      mcpServers: {
        remote: {
          url: 'http://malicious.com/mcp'
        }
      }
    },
    deps
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((err) => err.message.includes('is not in the URL allowlist')));
});

test('allows wildcard image allowlist', () => {
  const result = validateMcpServersConfig(
    {
      mcpServers: {
        custom: {
          command: 'docker',
          args: ['run', '-i', 'ghcr.io/acme/my-server:latest']
        }
      }
    },
    {
      ...deps,
      imageAllowlist: ['ghcr.io/acme/*']
    }
  );

  assert.equal(result.valid, true);
});

test('allows allowlisted URL host:port', () => {
  const result = validateMcpServersConfig(
    {
      mcpServers: {
        remote: {
          url: 'http://localhost:8000/mcp'
        }
      }
    },
    deps
  );

  assert.equal(result.valid, true);
});

test('allows wildcard URL allowlist', () => {
  const result = validateMcpServersConfig(
    {
      mcpServers: {
        remote: {
          url: 'http://localhost:9090/mcp'
        }
      }
    },
    {
      ...deps,
      urlAllowlist: ['localhost*']
    }
  );

  assert.equal(result.valid, true);
});

test('finds the image behind option values such as --cap-drop ALL', () => {
  const result = validateMcpServersConfig(
    {
      mcpServers: {
        hardened: {
          command: 'docker',
          args: [
            'run', '-i', '--rm', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
            '--pids-limit', '64', '--memory', '256m', '-e', 'TOKEN', 'alpine:3'
          ]
        }
      }
    },
    deps
  );

  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('still reports an unlisted image that follows --cap-drop ALL', () => {
  const result = validateMcpServersConfig(
    { mcpServers: { hardened: { command: 'docker', args: ['run', '-i', '--cap-drop', 'ALL', 'unauthorized/image'] } } },
    deps
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((err) => err.message.includes('Image unauthorized/image is not in the allowlist')));
});

const noRequiredNetwork: ValidationDeps = {
  ...deps,
  hardening: { defaults: { securityOptions: ['no-new-privileges'] } }
};

for (const flags of [
  ['--network=host'],
  ['--network', 'host'],
  ['--net', 'host'],
  ['--net=host']
]) {
  test(`rejects host networking written as "${flags.join(' ')}"`, () => {
    const result = validateMcpServersConfig(
      { mcpServers: { s: { command: 'docker', args: ['run', '-i', ...flags, 'alpine:3'] } } },
      noRequiredNetwork
    );

    assert.equal(result.valid, false, 'must be rejected even when no network is required');
    assert.ok(result.errors.some((err) => err.code === 'docker_forbidden_flags'));
  });
}

for (const flags of [
  ['--pid=host'],
  ['--pid', 'host'],
  ['--ipc', 'host'],
  ['--uts', 'host'],
  ['--userns', 'host']
]) {
  test(`rejects host namespace written as "${flags.join(' ')}"`, () => {
    const result = validateMcpServersConfig(
      { mcpServers: { s: { command: 'docker', args: ['run', '-i', ...flags, 'alpine:3'] } } },
      noRequiredNetwork
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((err) => err.code === 'docker_forbidden_option'));
  });
}

test('still accepts a named network and --pid with another value', () => {
  const result = validateMcpServersConfig(
    {
      mcpServers: {
        s: { command: 'docker', args: ['run', '-i', '--network', 'my-net', '--pid', 'container:other', 'alpine:3'] }
      }
    },
    noRequiredNetwork
  );

  assert.equal(result.valid, true, JSON.stringify(result.errors));
});
