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
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { ErrorObject } from 'ajv';
import { HardeningConfig } from '../config.js';
import schema from '../../../contracts/schemas/mcpServers.schema.json' with { type: 'json' };

export type SupportedCommand = 'uvx' | 'npx' | 'bun' | 'bunx' | 'docker' | 'binary' | 'npm' | 'ssh' | 'python' | 'python3';

export interface ValidationDeps {
  imageAllowlist: string[];
  urlAllowlist: string[];
  packageAllowlist: {
    npm: string[];
    pypi: string[];
    bun: string[];
  };
  hardening: HardeningConfig | null;
}

export type ValidationError = {
  message: string;
  code?: string;
  details?: Record<string, any>;
};

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

const supportedCommands: SupportedCommand[] = ['uvx', 'npx', 'bun', 'bunx', 'docker', 'binary', 'npm', 'ssh', 'python', 'python3'];

const ajv = new (Ajv as any)({
  allErrors: true,
  allowUnionTypes: true
});
// @ts-ignore
addFormats(ajv);
const validateSchema = ajv.compile(schema);

export function validateMcpServersConfig(payload: unknown, deps: ValidationDeps): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  if (!validateSchema(payload)) {
    const schemaErrors = formatSchemaErrors(validateSchema.errors);
    schemaErrors.forEach(msg => errors.push({ message: msg, code: 'schema_validation_failed' }));
    return { valid: false, errors, warnings };
  }

  const root = payload as { mcpServers: Record<string, any> };

  for (const [name, spec] of Object.entries(root.mcpServers)) {
    if (!spec || typeof spec !== 'object') {
      errors.push({ message: `Server ${name}: configuration must be an object.`, code: 'server_not_object' });
      continue;
    }

    if (spec.url) {
      // URL-based server (HTTP/SSE)
      if (typeof spec.url !== 'string' || !spec.url.startsWith('http')) {
        errors.push({ message: `Server ${name}: Invalid URL (must be http/https).`, code: 'invalid_url' });
      } else {
        try {
          const parsed = new URL(spec.url);
          const host = parsed.host.toLowerCase(); // includes port
          if (!matchesAllowlist(host, deps.urlAllowlist)) {
            errors.push({
              message: `Server ${name}: Host ${host} is not in the URL allowlist.`,
              code: 'url_not_allowlisted',
              details: { name, host, file: 'config/allowlist.urls' }
            });
          }
        } catch {
          errors.push({ message: `Server ${name}: URL could not be parsed.`, code: 'url_parse_failed' });
        }
      }
      // No further command validation needed for remote servers
      continue;
    }

    // Command-based server (STDIO)
    const command = spec.command as SupportedCommand;
    if (!command) {
      errors.push({ message: `Server ${name}: either 'command' or 'url' must be set.`, code: 'missing_command_or_url' });
      continue;
    }

    if (!supportedCommands.includes(command)) {
      errors.push({ message: `Server ${name}: command ${spec.command} is not supported.`, code: 'unsupported_command' });
      continue;
    }

    if (!Array.isArray(spec.args)) {
      errors.push({ message: `Server ${name}: args must be an array.`, code: 'args_not_array' });
    }

    if (command === 'docker') {
      validateDockerSpec(name, spec, deps.imageAllowlist, errors, warnings, deps.hardening);
    } else if (command === 'uvx' || command === 'npx' || command === 'bun' || command === 'bunx' || command === 'npm') {
      validatePackageSpec(name, spec, deps.packageAllowlist, errors);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateDockerSpec(
  name: string,
  spec: Record<string, any>,
  imageAllowlist: string[],
  errors: ValidationError[],
  warnings: string[],
  hardening: HardeningConfig | null
) {
  const args = Array.isArray(spec.args) ? spec.args.map((a) => String(a)) : [];
  const isRun = args.includes('run');
  const isExec = args.includes('exec');

  if (!isRun && !isExec) {
    errors.push({
      message: `Server ${name}: docker args must contain either "run" or "exec".`,
      code: 'docker_missing_run_exec'
    });
    return;
  }

  if (!args.includes('-i')) {
    warnings.push(`Server ${name}: docker args should contain '-i' (STDIO required).`);
  }

  if (isRun) {
    const image = findDockerImage(args);
    if (!image) {
      errors.push({ message: `Server ${name}: docker args must contain an image.`, code: 'docker_missing_image' });
    } else if (!matchesAllowlist(image, imageAllowlist)) {
      errors.push({
        message: `Server ${name}: Image ${image} is not in the allowlist.`,
        code: 'image_not_allowlisted',
        details: { name, image, file: 'config/allowlist.images' }
      });
    }
  }

  if (args.some((arg) => arg === '--privileged' || arg.startsWith('--network=host'))) {
    errors.push({
      message: `Server ${name}: forbidden docker flags (--privileged/--network=host).`,
      code: 'docker_forbidden_flags'
    });
  }

  const forbiddenFlags = ['--device', '--init', '--pid=host', '--uts=host', '--ipc=host'];
  for (const flag of forbiddenFlags) {
    if (args.some((arg) => arg === flag || arg.startsWith(`${flag}=`))) {
      errors.push({ message: `Server ${name}: forbidden docker option (${flag}).`, code: 'docker_forbidden_option' });
    }
  }

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--cap-add') {
      errors.push({ message: `Server ${name}: --cap-add is not allowed.`, code: 'docker_forbidden_cap_add' });
    }
    if (token === '--security-opt' || token.startsWith('--security-opt=')) {
      const value = token.includes('=') ? token.split('=')[1] : args[i + 1] ?? '';
      const allowedSecOpts = new Set(hardening?.defaults?.securityOptions ?? []);
      if (!allowedSecOpts.has(value)) {
        errors.push({
          message: `Server ${name}: --security-opt ${value} is not allowed.`,
          code: 'docker_forbidden_security_opt'
        });
      }
    }
    if (token === '-v' || token === '--volume' || token.startsWith('--volume=')) {
      const specValue = token.startsWith('--volume=') ? token.split('=').slice(1).join('=') : (args[i + 1] ?? '');
      if (specValue && !specValue.split(':').includes('ro')) {
        const hostPath = specValue.split(':')[0] ?? '';
        const allowedWritable = hardening?.defaults?.allowedWritableVolumes ?? [];
        if (!allowedWritable.includes(hostPath)) {
          errors.push({
            message: `Server ${name}: --volume ${specValue} must be configured as read-only (flag 'ro').`,
            code: 'docker_volume_not_readonly'
          });
        }
      }
    }
    if (token === '--mount' || token.startsWith('--mount=')) {
      const specValue = token.includes('=') ? token.split('=')[1] : args[i + 1] ?? '';
      if (!specValue.includes('ro')) {
        errors.push({
          message: `Server ${name}: --mount ${specValue} must be configured as read-only (flag 'ro').`,
          code: 'docker_mount_not_readonly'
        });
      }
    }
    if (token === '--network' || token.startsWith('--network=')) {
      const networkName = token.includes('=') ? token.split('=')[1] : args[i + 1] ?? '';
      const requiredNetwork = hardening?.defaults?.network?.name;
      if (requiredNetwork && networkName !== requiredNetwork) {
        errors.push({
          message: `Server ${name}: --network must match ${requiredNetwork}.`,
          code: 'docker_invalid_network'
        });
      }
    }
  }

  if (hardening?.defaults?.readOnlyRootFilesystem !== false) {
    if (!args.includes('--read-only')) {
      warnings.push(`Server ${name}: --read-only is recommended.`);
    }
  }
}

function validatePackageSpec(
  name: string,
  spec: Record<string, any>,
  allowlists: { npm: string[]; pypi: string[]; bun: string[] },
  errors: ValidationError[]
) {
  const args = Array.isArray(spec.args) ? spec.args.map((a) => String(a)) : [];
  if (args.length === 0) {
    errors.push({ message: `Server ${name}: args must not be empty.`, code: 'args_empty' });
    return;
  }
  const pkg = (() => {
    for (const raw of args) {
      const token = raw.trim();
      if (!token || token.startsWith('-')) continue;
      if (token === '--') continue;
      if (spec.command === 'npm' && token === 'exec') continue;
      return token;
    }
    return undefined;
  })();
  if (!pkg) {
    errors.push({ message: `Server ${name}: could not find package name in args.`, code: 'package_not_found' });
    return;
  }
  let list: string[] = [];
  let file = '';
  if (spec.command === 'uvx') {
    list = allowlists.pypi;
    file = 'config/allowlist.packages.pypi';
  } else if (spec.command === 'npx' || spec.command === 'npm') {
    list = allowlists.npm;
    file = 'config/allowlist.packages.npm';
  } else {
    list = allowlists.bun;
    file = 'config/allowlist.packages.bun';
  }
  if (!matchesAllowlist(pkg, list)) {
    errors.push({
      message: `Server ${name}: Package ${pkg} is not in the allowlist for ${spec.command}.`,
      code: 'package_not_allowlisted',
      details: { name, package: pkg, command: spec.command, file }
    });
  }
}

function findDockerImage(args: string[]): string | null {
  const flagsWithValues = new Set([
    '-v', '--volume', '-e', '--env', '--name', '--cpus', '--memory', '--pids-limit',
    '--security-opt', '--tmpfs', '--label', '--network', '--pull', '--hostname',
    '--user', '--workdir'
  ]);

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === 'run') {
      for (let j = i + 1; j < args.length; j += 1) {
        const candidate = args[j];
        if (flagsWithValues.has(candidate)) {
          j += 1;
          continue;
        }
        if (!candidate.startsWith('-')) {
          return candidate;
        }
      }
      return null;
    }
  }
  return null;
}

function formatSchemaErrors(items: ErrorObject[] | null | undefined): string[] {
  if (!items || items.length === 0) {
    return ['Schema validation failed.'];
  }
  return items.map((err) => {
    const path = err.instancePath ? `At ${err.instancePath}` : 'Root';
    return `Schema: ${path} ${err.message ?? 'is invalid'}`;
  });
}

function matchesAllowlist(value: string, allowlist: string[]): boolean {
  return allowlist.some((entry) => {
    if (!entry.includes('*')) {
      return entry === value;
    }
    const pattern = '^' + entry.split('*').map(escapeRegex).join('.*') + '$';
    const regex = new RegExp(pattern);
    return regex.test(value);
  });
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}
