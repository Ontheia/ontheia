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
import { HardeningConfig } from '../config.js';
import { SupportedCommand } from './validator.js';

export type PreviewResult = {
  command?: string;
  args?: string[];
  url?: string;
  env: Record<string, string>;
  missingSecrets?: string[];
};

export function buildPreview(
  name: string,
  spec: Record<string, any>,
  hardening: HardeningConfig | null
): PreviewResult {
  const env = spec.env && typeof spec.env === 'object' ? spec.env : {};

  if (spec.url) {
    return {
      url: spec.url,
      env
    };
  }

  const command = spec.command as SupportedCommand;
  const args = Array.isArray(spec.args) ? spec.args.map((value: unknown) => String(value)) : [];

  if (command !== 'docker') {
    return { command, args, env };
  }

  const isRun = args.includes('run');
  if (!isRun) {
    // For docker exec or other subcommands, don't inject hardening flags
    return { command, args, env };
  }

  const finalArgs = [...args];

  if (hardening?.defaults?.readOnlyRootFilesystem !== false && !finalArgs.includes('--read-only')) {
    finalArgs.splice(2, 0, '--read-only');
  }

  if (hardening?.defaults?.tmpfs) {
    for (const [mount, options] of Object.entries(hardening.defaults.tmpfs)) {
      if (!finalArgs.includes('--tmpfs')) {
        finalArgs.splice(2, 0, '--tmpfs', `${mount}:${options}`);
      }
    }
  }

  if (hardening?.defaults?.resources?.cpus && !finalArgs.includes('--cpus')) {
    finalArgs.splice(2, 0, '--cpus', String(hardening.defaults.resources.cpus));
  }

  if (hardening?.defaults?.resources?.memory && !finalArgs.includes('--memory')) {
    finalArgs.splice(2, 0, '--memory', hardening.defaults.resources.memory);
  }

  if (hardening?.defaults?.resources?.pids && !finalArgs.includes('--pids-limit')) {
    finalArgs.splice(2, 0, '--pids-limit', String(hardening.defaults.resources.pids));
  }

  if (hardening?.defaults?.securityOptions) {
    for (const option of hardening.defaults.securityOptions) {
      if (!finalArgs.includes('--security-opt')) {
        finalArgs.splice(2, 0, '--security-opt', option);
      }
    }
  }

  if (hardening?.defaults?.capabilities?.drop && !finalArgs.includes('--cap-drop')) {
    for (const cap of hardening.defaults.capabilities.drop) {
      finalArgs.splice(2, 0, '--cap-drop', cap);
    }
  }

  const networkName = hardening?.defaults?.network?.name;
  const hasNetworkFlag = finalArgs.some((token, index) => {
    if (token === '--network') {
      return true;
    }
    return token.startsWith('--network=');
  });
  if (networkName && !hasNetworkFlag) {
    finalArgs.splice(2, 0, '--network', networkName);
  }

  return {
    command: 'docker',
    args: finalArgs,
    env
  };
}
