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
import fs from 'fs';
import path from 'path';
import { Writable } from 'stream';

type RotateOptions = {
  maxBytes: number;
  maxFiles: number;
  log?: (msg: string) => void;
};

function ensureDirExists(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function listRotatedFiles(filePath: string) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((entry) => entry.startsWith(base + '.'))
    .map((entry) => path.join(dir, entry))
    .sort()
    .reverse();
}

function rotateFiles(filePath: string, maxFiles: number, log?: (msg: string) => void) {
  if (!fs.existsSync(filePath)) return;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rotated = `${filePath}.${timestamp}`;
  try {
    const prevStat = fs.statSync(filePath);
    log?.(`Rotating ${filePath} (${prevStat.size} bytes) -> ${rotated}`);
  } catch {
    log?.(`Rotating ${filePath} -> ${rotated}`);
  }
  fs.renameSync(filePath, rotated);

  const existing = listRotatedFiles(filePath);
  const excess = existing.slice(maxFiles);
  for (const file of excess) {
    fs.rmSync(file, { force: true });
  }
}

export function createRotatingLogStream(filePath: string, options: RotateOptions): Writable {
  ensureDirExists(filePath);
  let currentSize = 0;
  try {
    const stat = fs.statSync(filePath);
    currentSize = stat.size;
  } catch {
    currentSize = 0;
  }

  let stream = fs.createWriteStream(filePath, { flags: 'a' });

  const rotate = () => {
    stream.end();
    rotateFiles(filePath, options.maxFiles, options.log);
    stream = fs.createWriteStream(filePath, { flags: 'a' });
    currentSize = 0;
  };

  return new Writable({
    write(chunk, _encoding, callback) {
      currentSize += chunk.length;
      if (currentSize > options.maxBytes) {
        rotate();
      }
      stream.write(chunk, callback);
    },
    final(callback) {
      stream.end(callback);
    }
  });
}
