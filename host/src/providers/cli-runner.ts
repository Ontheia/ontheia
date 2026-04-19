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
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ProviderRecord, ProviderModelRecord } from './repository.js';
import type { ChatMessage, RunToolDefinition } from '../runtime/types.js';
import { logger as rootLogger } from '../logger.js';

const log = rootLogger.child({ module: 'cli-runner' });

// ── Login-shell PATH resolution ───────────────────────────────────────────────
// Node's process.env.PATH may lack npm-global paths (e.g. ~/.npm-global/bin).
// Resolve once via a login shell and cache for all CLI spawns.

let _loginShellPathCache: string | null = null;

function getLoginShellEnv(): Promise<NodeJS.ProcessEnv> {
  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR ?? '/root/.claude',
    GEMINI_CONFIG_DIR: process.env.GEMINI_CONFIG_DIR ?? '/root/.gemini'
  };

  if (_loginShellPathCache !== null) {
    return Promise.resolve({ ...baseEnv, PATH: _loginShellPathCache });
  }
  return new Promise((resolve) => {
    const child = spawn('bash', ['-l', '-c', 'echo $PATH'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...baseEnv }
    });
    let out = '';
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    child.on('close', () => {
      const resolved = out.trim();
      if (resolved) {
        _loginShellPathCache = resolved;
        log.debug({ path: resolved }, 'Resolved login-shell PATH');
        resolve({ ...process.env, PATH: resolved });
      } else {
        resolve({ ...process.env });
      }
    });
    child.on('error', () => resolve({ ...process.env }));
  });
}

export type CliFormat = 'gemini' | 'claude' | 'generic';

// ── Result type ─────────────────────────────────────────────────────────────

export interface CliCompletion {
  content: string | null;
  tool_calls: CliToolCall[];
  finishReason: 'stop' | 'tool_calls';
}

export interface CliToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

// ── Format detection ─────────────────────────────────────────────────────────

export function detectCliFormat(provider: ProviderRecord, model: ProviderModelRecord): CliFormat {
  const meta = provider.metadata ?? {};
  const modelMeta = model.metadata ?? {};

  const explicit =
    (modelMeta['cli_format'] as string | undefined) ??
    (meta['cli_format'] as string | undefined);

  if (explicit === 'gemini' || explicit === 'claude' || explicit === 'generic') {
    return explicit;
  }

  const command = (meta['cli_command'] as string | undefined) ?? '';
  if (command.includes('gemini')) return 'gemini';
  if (command.includes('claude')) return 'claude';
  return 'generic';
}

// ── Prompt building ──────────────────────────────────────────────────────────

function contentToText(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text') return part.text ?? '';
        return '';
      })
      .join('');
  }
  return String(content);
}

export function buildCliPrompt(
  messages: ChatMessage[],
  tools: RunToolDefinition[],
  _format: CliFormat
): string {
  const parts: string[] = [];
  const hasTools = tools.length > 0;

  const systemMsg = messages.find(m => m.role === 'system');
  if (systemMsg) {
    parts.push(`=== SYSTEM ===\n${contentToText(systemMsg.content)}`);
  }

  if (hasTools) {
    const toolDefs = tools.map(t => ({
      name: t.call_name ?? t.name,
      description: t.description,
      parameters: t.parameters ?? { type: 'object', properties: {} }
    }));
    parts.push(`=== AVAILABLE TOOLS ===\n${JSON.stringify(toolDefs, null, 2)}`);

    parts.push(
      `=== INSTRUCTIONS ===\n` +
      `You MUST NOT describe what you intend to do. Act immediately.\n\n` +
      `OUTPUT FORMAT — choose exactly one:\n\n` +
      `If you need to call a tool:\n` +
      `TOOL_CALL: <tool_name>\n` +
      `ARGUMENTS: <json object>\n\n` +
      `If you can answer without a tool:\n` +
      `ANSWER: <your response>\n\n` +
      `Rules:\n` +
      `- Output ONLY the format above. No preamble, no markdown.\n` +
      `- Never write "I will call..." — just output TOOL_CALL.\n` +
      `- Use TOOL_CALL for any request requiring real-time data.\n\n` +
      `Example:\n` +
      `TOOL_CALL: get_current_weather\n` +
      `ARGUMENTS: {"location": "Berlin, Germany"}`
    );
  } else {
    parts.push(
      `=== INSTRUCTIONS ===\n` +
      `Answer the user's message.\n` +
      `Format: ANSWER: <your response>`
    );
  }

  const history = messages.filter(m => m.role !== 'system');
  if (history.length > 0) {
    const lines = ['=== CONVERSATION ==='];
    for (const msg of history) {
      if (msg.role === 'user') {
        lines.push(`User: ${contentToText(msg.content)}`);
      } else if (msg.role === 'assistant') {
        const tc = (msg as any).tool_calls;
        if (Array.isArray(tc) && tc.length > 0) {
          const call = tc[0];
          const name = call.function?.name ?? call.name ?? '';
          let args: unknown = {};
          try {
            args = typeof call.function?.arguments === 'string'
              ? JSON.parse(call.function.arguments)
              : call.function?.arguments ?? call.arguments ?? {};
          } catch { /* keep empty */ }
          lines.push(`TOOL_CALL: ${name}\nARGUMENTS: ${JSON.stringify(args)}`);
        } else {
          lines.push(`ANSWER: ${contentToText(msg.content)}`);
        }
      } else if (msg.role === 'tool') {
        lines.push(`TOOL_RESULT [${(msg as any).tool_call_id ?? 'unknown'}]: ${contentToText(msg.content)}`);
      }
    }
    parts.push(lines.join('\n'));
  }

  return parts.join('\n\n') + '\n\nYour response:';
}

// ── Output parsing ───────────────────────────────────────────────────────────

function parseReact(text: string): CliCompletion | null {
  // TOOL_CALL block
  const m = text.match(/TOOL_CALL:\s*(\S+)\s*\nARGUMENTS:\s*(\{[\s\S]*?\})/i);
  if (m) {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(m[2]); } catch { /* keep empty */ }
    return {
      content: null,
      tool_calls: [{ name: m[1].trim(), arguments: args }],
      finishReason: 'tool_calls'
    };
  }
  // ANSWER line
  const a = text.match(/ANSWER:\s*([\s\S]*)/i);
  if (a) {
    return { content: a[1].trim(), tool_calls: [], finishReason: 'stop' };
  }
  return null;
}

function parseJsonObject(text: string): CliCompletion | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    const tcs: CliToolCall[] = (Array.isArray(obj.tool_calls) ? obj.tool_calls : []).map((tc: any) => ({
      name: tc.name ?? tc.function ?? '',
      arguments: typeof tc.arguments === 'object' ? tc.arguments : {}
    }));
    return {
      content: obj.content ?? null,
      tool_calls: tcs,
      finishReason: tcs.length > 0 ? 'tool_calls' : 'stop'
    };
  } catch {
    return null;
  }
}

function parseGeminiEnvelope(raw: string): string {
  try {
    const outer = JSON.parse(raw.trim());
    if (typeof outer.response === 'string') return outer.response.trim();
  } catch { /* not json envelope */ }
  return raw;
}

function parseClaudeJson(raw: string): CliCompletion | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    const obj = JSON.parse(raw.slice(start, end + 1));
    if (typeof obj.result === 'string') {
      const text = obj.result.trim();
      // Try to parse as ReAct first (for tool calls)
      const react = parseReact(text);
      if (react) return react;

      // Fallback: strip ANSWER: prefix if present
      let content = text;
      const answerMatch = content.match(/^ANSWER:\s*/i);
      if (answerMatch) content = content.slice(answerMatch[0].length).trim();
      return { content, tool_calls: [], finishReason: 'stop' };
    }
  } catch { /* not valid json */ }
  return null;
}

export function parseCliOutput(raw: string, format: CliFormat): CliCompletion {
  let text = raw.trim();

  if (format === 'gemini') {
    text = parseGeminiEnvelope(text);
  }

  if (format === 'claude') {
    return parseClaudeJson(text) ?? { content: text || null, tool_calls: [], finishReason: 'stop' };
  }

  // Strip markdown fences
  text = text.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();

  return (
    parseReact(text) ??
    parseJsonObject(text) ??
    { content: text || null, tool_calls: [], finishReason: 'stop' }
  );
}

// ── CLI invocation ────────────────────────────────────────────────────────────

function buildCliArgs(provider: ProviderRecord, model: ProviderModelRecord, format: CliFormat): string[] {
  const meta = provider.metadata ?? {};
  const modelMeta = model.metadata ?? {};

  // Prefer an explicit cli_model in metadata; fall back to model.id
  const cliModelId =
    (modelMeta['cli_model'] as string | undefined) ??
    (meta['cli_model'] as string | undefined) ??
    model.id;

  if (format === 'gemini') {
    const args = ['-p', '', '-y', '-o', 'json', '--allowed-mcp-server-names', 'none'];
    if (cliModelId) args.push('-m', cliModelId);
    return args;
  }

  if (format === 'claude') {
    // claude -p <prompt> --output-format json --no-mcp
    const args = [
      '--output-format', 'json',
      '--print',
      '--no-session-persistence',
      '--disable-slash-commands',
      '--mcp-config', '{"mcpServers":{}}',
      '--strict-mcp-config'
    ];
    if (cliModelId) args.push('--model', cliModelId);
    return args;
  }

  // generic: use extra_args from metadata, default to empty
  const extra = meta['cli_args'];
  return Array.isArray(extra) ? extra.map(String) : [];
}

function getCliCommand(provider: ProviderRecord): string {
  const meta = provider.metadata ?? {};
  return (meta['cli_command'] as string | undefined) ?? 'gemini';
}

export async function runCliCompletion(
  provider: ProviderRecord,
  model: ProviderModelRecord,
  messages: ChatMessage[],
  tools: RunToolDefinition[],
  allowedToolNames?: Set<string>
): Promise<CliCompletion> {
  const format = detectCliFormat(provider, model);
  const prompt = buildCliPrompt(messages, tools, format);
  const command = getCliCommand(provider);
  const args = buildCliArgs(provider, model, format);
  const runId = randomUUID().slice(0, 8);

  const workDir = join(tmpdir(), `ontheia-cli-${runId}`);
  mkdirSync(workDir, { recursive: true });

  log.info({ command, format, promptLen: prompt.length, runId }, 'Spawning CLI provider');

  const env = await getLoginShellEnv();

  // Per-invocation timeout: read from provider metadata or fall back to 5 minutes
  const meta = provider.metadata ?? {};
  const configuredTimeoutMs = typeof meta['cli_timeout_ms'] === 'number'
    ? (meta['cli_timeout_ms'] as number)
    : 300_000;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    child.stdin.write(prompt, 'utf8');
    child.stdin.end();

    let stdout = '';
    let stderr = '';
    let settled = false;

    const killAndResolve = (reason: string) => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
      try { rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
      log.warn({ runId, reason }, 'CLI provider terminated');
      resolve({ content: `Error: CLI provider ${reason}`, tool_calls: [], finishReason: 'stop' });
    };

    const timeoutHandle = setTimeout(
      () => killAndResolve(`timed out after ${Math.round(configuredTimeoutMs / 1000)}s`),
      configuredTimeoutMs
    );

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    child.on('close', (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      try { rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
      log.info({ runId, code, stdoutLen: stdout.length, stderrLen: stderr.length }, 'CLI provider exited');
      log.debug({ runId, stdout: stdout.slice(0, 800) }, 'CLI stdout');
      if (stderr) log.warn({ runId, code, stderr: stderr.slice(0, 1200) }, 'CLI stderr');

      const result = parseCliOutput(stdout, format);
      log.debug({ runId, content: result.content, toolCalls: result.tool_calls.length, finishReason: result.finishReason }, 'CLI parsed result');

      // Filter out any tool names the model hallucinated
      if (allowedToolNames && allowedToolNames.size > 0) {
        result.tool_calls = result.tool_calls.filter(tc => {
          const ok = allowedToolNames.has(tc.name);
          if (!ok) log.warn({ runId, tool: tc.name }, 'Dropping hallucinated CLI tool call');
          return ok;
        });
        if (result.tool_calls.length === 0 && result.finishReason === 'tool_calls') {
          result.finishReason = 'stop';
        }
      }

      resolve(result);
    });

    child.on('error', (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      try { rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
      reject(err);
    });
  });
}
