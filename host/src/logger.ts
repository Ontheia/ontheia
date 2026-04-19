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
import pino, { multistream } from 'pino';
import type { Logger } from 'pino';
import path from 'path';
import { createRotatingLogStream } from './log-rotate.js';

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const logFilePath = process.env.LOG_FILE || path.join(process.cwd(), 'host_server.log');
const logMaxBytes = parsePositiveInt(process.env.LOG_MAX_BYTES, 10 * 1024 * 1024);
const logMaxFiles = parsePositiveInt(process.env.LOG_MAX_FILES, 5);

let _logRotateFn: ((msg: string) => void) | undefined;

const fileStream = createRotatingLogStream(logFilePath, {
  maxBytes: Math.max(logMaxBytes, 1024 * 1024),
  maxFiles: Math.max(logMaxFiles, 1),
  log: (msg) => _logRotateFn?.(msg)
});

const streams = [
  { stream: fileStream },
  process.env.PINO_PRETTY === 'true'
    ? {
        stream: pino.transport({
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard' }
        })
      }
    : { stream: process.stdout }
];

export const logger: Logger = pino(
  { level: process.env.LOG_LEVEL ?? 'debug', base: undefined },
  multistream(streams)
);

_logRotateFn = (msg) => logger.info({ component: 'log-rotate' }, msg);
