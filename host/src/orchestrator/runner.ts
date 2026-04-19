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
import { spawn, ChildProcess } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import { logger } from '../logger.js';

export type ProcessStatus = 'starting' | 'running' | 'exited' | 'failed';

export type RunnerLifecycleEvent =
  | { type: 'running'; name: string; startedAt: number }
  | { type: 'stopped' | 'failed'; name: string; exitCode: number | null; signal: NodeJS.Signals | null; logs: string[] };

interface RunnerProcess {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  process: ChildProcess;
  status: ProcessStatus;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  logs: string[];
  startedAt?: number | null;
}

const STOP_TIMEOUT_MS = 5_000;

export class Runner {
  private processes: Map<string, RunnerProcess> = new Map();

  constructor(
    private readonly dockerHost?: string,
    private readonly onLifecycleEvent?: (event: RunnerLifecycleEvent) => void
  ) {}

  list() {
    return Array.from(this.processes.values()).map(
      ({ name, command, args, status, exitCode, signal, startedAt }) => ({
        name,
        command,
        args,
        status,
        exitCode,
        signal,
        startedAt: startedAt ? new Date(startedAt).toISOString() : null
      })
    );
  }

  start(name: string, preview: { command: string; args: string[]; env: Record<string, string> }) {
    const existing = this.processes.get(name);
    if (existing) {
      if (existing.status === 'running' || existing.status === 'starting') {
        return { status: 'already_running' as const };
      }
      this.processes.delete(name);
    }

    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    for (const [key, value] of Object.entries(preview.env ?? {})) {
      env[key] = value;
    }

    if (preview.command === 'docker' && this.dockerHost) {
      env.DOCKER_HOST = this.dockerHost;
    }

    const child = spawn(preview.command, preview.args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const runnerProcess: RunnerProcess = {
      name,
      command: preview.command,
      args: preview.args,
      env,
      process: child,
      status: 'starting',
      logs: [],
      startedAt: null
    };

    this.processes.set(name, runnerProcess);

    child.on('spawn', () => {
      runnerProcess.status = 'running';
      runnerProcess.startedAt = Date.now();
      this.onLifecycleEvent?.({ type: 'running', name, startedAt: runnerProcess.startedAt });
    });

    child.on('exit', (code, signal) => {
      runnerProcess.status = code === 0 ? 'exited' : 'failed';
      runnerProcess.exitCode = code;
      runnerProcess.signal = signal;
      this.processes.set(name, runnerProcess);
      this.onLifecycleEvent?.({
        type: code === 0 ? 'stopped' : 'failed',
        name,
        exitCode: code,
        signal,
        logs: [...runnerProcess.logs]
      });
    });

    child.on('error', (error) => {
      runnerProcess.status = 'failed';
      runnerProcess.exitCode = -1;
      runnerProcess.signal = null;
      runnerProcess.process.removeAllListeners();
      runnerProcess.logs.push(`[error] ${error.message}`);
      this.processes.set(name, runnerProcess);
      this.onLifecycleEvent?.({
        type: 'failed',
        name,
        exitCode: -1,
        signal: null,
        logs: [...runnerProcess.logs]
      });
      logger.error({ err: error, process: name }, 'Orchestrator process error');
    });

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        runnerProcess.logs.push(`[stdout] ${chunk.toString().trim()}`);
        if (runnerProcess.logs.length > 200) runnerProcess.logs.shift();
      });
    }
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        runnerProcess.logs.push(`[stderr] ${chunk.toString().trim()}`);
        if (runnerProcess.logs.length > 200) runnerProcess.logs.shift();
      });
    }

    return { status: 'started' as const };
  }

  async stop(name: string) {
    const proc = this.processes.get(name);
    if (!proc) {
      return { status: 'not_found' as const };
    }
    if (proc.status === 'exited' || proc.status === 'failed') {
      this.processes.delete(name);
      return { status: 'already_stopped' as const };
    }
    proc.process.kill();
    const start = Date.now();
    while (proc.process.exitCode === null && proc.process.signalCode === null) {
      if (Date.now() - start > STOP_TIMEOUT_MS) {
        proc.process.kill('SIGKILL');
        await sleep(100);
        proc.status = 'failed';
        proc.exitCode = proc.process.exitCode;
        proc.signal = proc.process.signalCode;
        proc.logs.push(`[signal] SIGKILL sent after timeout`);
        this.processes.set(name, proc);
        return { status: 'force_killed' as const };
      }
      await sleep(100);
    }
    proc.status = 'exited';
    proc.exitCode = proc.process.exitCode;
    proc.signal = proc.process.signalCode;
    proc.logs.push(`[exit] code=${proc.exitCode ?? 'null'} signal=${proc.signal ?? 'null'}`);
    this.processes.set(name, proc);
    return { status: 'stopped' as const };
  }

  async stopAll() {
    const entries = Array.from(this.processes.keys());
    const results = await Promise.all(entries.map(async (name) => ({ name, result: await this.stop(name) })));
    return results.reduce<Record<string, Awaited<ReturnType<Runner['stop']>>>>((acc, { name, result }) => {
      acc[name] = result;
      return acc;
    }, {});
  }
}
