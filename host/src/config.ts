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
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { logger } from './logger.js';

export interface HardeningConfig {
  defaults: {
    readOnlyRootFilesystem?: boolean;
    tmpfs?: Record<string, string>;
    resources?: {
      cpus?: number;
      memory?: string;
      pids?: number;
    };
    capabilities?: {
      drop?: string[];
    };
    securityOptions?: string[];
    network?: {
      name?: string;
    };
    allowedWritableVolumes?: string[];
  };
}

export interface ServiceConfig {
  databaseUrl: string;
  rootlessDockerHost?: string;
  dockerNetworkName?: string;
  requireRootlessDocker: boolean;
  allowlistImagesPath: string;
  allowlistUrlsPath: string;
  allowlistPackages: {
    npm: string;
    pypi: string;
    bun: string;
  };
  orchestratorHardeningPath: string;
  allowedOrigins: string[];
}

export function loadConfig(): ServiceConfig {
  const basePath = process.cwd();
  const repoPath = path.resolve(basePath, '..');

  const resolvePath = (relative: string, envValue?: string) => {
    if (envValue) return envValue;
    const candidates = [path.join(basePath, relative), path.join(repoPath, relative)];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    return candidates[0];
  };

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:5173', 'http://localhost:8080']; // Default development origins

  return {
    databaseUrl: process.env.DATABASE_URL ?? 'postgresql://ontheia_app:ontheia_app_pwd_123@db:5432/ontheia',
    rootlessDockerHost: process.env.ROOTLESS_DOCKER_HOST,
    dockerNetworkName: process.env.DOCKER_NETWORK ?? 'ontheia-net',
    requireRootlessDocker: process.env.REQUIRE_ROOTLESS_DOCKER !== 'false',
    allowlistImagesPath: resolvePath('config/allowlist.images', process.env.ALLOWLIST_IMAGES_PATH),
    allowlistUrlsPath: resolvePath('config/allowlist.urls', process.env.ALLOWLIST_URLS_PATH),
    allowlistPackages: {
      npm: resolvePath('config/allowlist.packages.npm', process.env.ALLOWLIST_PACKAGES_NPM_PATH),
      pypi: resolvePath('config/allowlist.packages.pypi', process.env.ALLOWLIST_PACKAGES_PYPI_PATH),
      bun: resolvePath('config/allowlist.packages.bun', process.env.ALLOWLIST_PACKAGES_BUN_PATH)
    },
    orchestratorHardeningPath: resolvePath('config/orchestrator.hardening.json', process.env.ORCHESTRATOR_HARDENING_PATH),
    allowedOrigins
  };
}

export function readAllowlist(filePath: string): string[] {
  const parse = (p: string): string[] =>
    readFileSync(p, 'utf-8')
      .split('\n')
      .map((line) => line.split('#')[0].trim())
      .filter(Boolean);

  let entries: string[] = [];
  try {
    entries = parse(filePath);
  } catch (err) {
    logger.warn({ err, filePath }, 'Allowlist could not be read — using empty list');
  }

  // Merge optional local override file (e.g. allowlist.images.local)
  const localPath = filePath + '.local';
  if (existsSync(localPath)) {
    try {
      const local = parse(localPath);
      const set = new Set(entries);
      for (const e of local) {
        if (!set.has(e)) entries.push(e);
      }
    } catch (err) {
      logger.warn({ err, localPath }, 'Local allowlist override could not be read — skipping');
    }
  }

  return entries;
}

export function loadHardeningConfig(filePath: string): HardeningConfig | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Hardening configuration is invalid.');
    }
    return parsed as HardeningConfig;
  } catch (err) {
    logger.warn({ err, filePath }, 'Hardening configuration could not be read — using defaults');
    return null;
  }
}
