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
import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { HardeningConfig, loadHardeningConfig, readAllowlist } from '../config.js';
import { validateMcpServersConfig } from './validator.js';
import { buildPreview } from './preview.js';
import { Runner, RunnerLifecycleEvent } from './runner.js';
import { connectMcpServer, ConnectedClient } from './client.js';
import {
  defaultEnvSource,
  resolveEnvMap,
  SecretResolutionError,
  isSecretReference
} from '../secrets/resolver.js';
import type { ServerStatusUpdateParams } from './server-config.repository.js';
import type { MemoryAdapter } from '../memory/adapter.js';
import { buildReadableNamespaces } from '../memory/namespaces.js';
import { countMemoryHits, countMemoryWarning } from '../metrics.js';

const execFileAsync = promisify(execFile);

type McpToolDefinition = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

type ToolCacheEntry = {
  tools: McpToolDefinition[];
  fetchedAt: number;
  version: string;
};

export class OrchestratorService {
  private imageAllowlist: string[];

  private urlAllowlist: string[];

  private packageAllowlist: { npm: string[]; pypi: string[]; bun: string[] };

  private hardening: HardeningConfig | null;

  private runner: Runner;

  private dockerHost?: string;

  private dockerNetworkName?: string;

  private requireRootlessDocker: boolean;

  private ensureNetworkPromise?: Promise<void>;

  private clients: Map<string, ConnectedClient & { startedAt: number }> = new Map();

  private toolCache: Map<string, ToolCacheEntry> = new Map();

  private logger: Console | { info: Function; warn: Function; error: Function };

  private statusUpdater?: (update: ServerStatusUpdateParams) => Promise<void>;

  private allowlistPaths: {
    images: string;
    urls: string;
    npm: string;
    pypi: string;
    bun: string;
  };

  private allowlistMtimes: {
    images: number;
    urls: number;
    npm: number;
    pypi: number;
    bun: number;
  };

  private memoryAdapter?: MemoryAdapter;

  private internalToolHandlers: Map<string, (name: string, args: any, context?: any) => Promise<any>> = new Map();

  private startTime: Date;

  constructor(configPaths: {
    allowlistImages: string;
    allowlistUrls: string;
    allowlistPackages: { npm: string; pypi: string; bun: string };
    hardening: string;
  }, options: { dockerHost?: string; dockerNetworkName?: string; requireRootlessDocker?: boolean; statusUpdater?: (update: ServerStatusUpdateParams) => Promise<void>; logger?: Console | { info: Function; warn: Function; error: Function }; memoryAdapter?: MemoryAdapter }) {
    this.startTime = new Date();
    this.allowlistPaths = {
      images: configPaths.allowlistImages,
      urls: configPaths.allowlistUrls,
      npm: configPaths.allowlistPackages.npm,
      pypi: configPaths.allowlistPackages.pypi,
      bun: configPaths.allowlistPackages.bun
    };
    this.allowlistMtimes = {
      images: 0,
      urls: 0,
      npm: 0,
      pypi: 0,
      bun: 0
    };
    this.imageAllowlist = [];
    this.urlAllowlist = [];
    this.packageAllowlist = { npm: [], pypi: [], bun: [] };
    this.logger = options.logger ?? console;
    this.memoryAdapter = options.memoryAdapter;
    this.reloadAllowlistsIfNeeded(true);
    this.hardening = loadHardeningConfig(configPaths.hardening);
    this.dockerHost = options.dockerHost;
    this.requireRootlessDocker = options.requireRootlessDocker ?? true;
    this.statusUpdater = options.statusUpdater;
    this.runner = new Runner(options.dockerHost, (event) => {
      void this.handleRunnerLifecycle(event);
    });
    this.dockerNetworkName = options.dockerNetworkName;
  }

  registerInternalToolHandler(serverName: string, handler: (name: string, args: any, context?: any) => Promise<any>) {
    this.internalToolHandlers.set(serverName, handler);
  }

  validate(payload: unknown) {
    this.reloadAllowlistsIfNeeded();
    return validateMcpServersConfig(payload, {
      imageAllowlist: this.imageAllowlist,
      urlAllowlist: this.urlAllowlist,
      packageAllowlist: this.packageAllowlist,
      hardening: this.hardening
    });
  }

  private getFileMtime(path: string) {
    try {
      const stats = statSync(path);
      return stats.mtimeMs;
    } catch (error) {
      this.logger.warn({ path, error }, 'Allowlist file could not be read');
      return 0;
    }
  }

  private reloadAllowlistsIfNeeded(force = false) {
    const updates: string[] = [];

    const refresh = (
      key: 'images' | 'npm' | 'pypi' | 'bun' | 'urls',
      path: string,
      assign: (entries: string[]) => void
    ) => {
      const mtime = this.getFileMtime(path);
      if (!force && mtime !== 0 && mtime <= this.allowlistMtimes[key]) {
        return;
      }
      try {
        const entries = readAllowlist(path);
        assign(entries);
        this.allowlistMtimes[key] = mtime;
        updates.push(`${key}:${entries.length}`);
      } catch (error) {
        this.logger.warn({ path, error }, 'Allowlist could not be reloaded');
      }
    };

    refresh('images', this.allowlistPaths.images, (entries) => {
      this.imageAllowlist = entries;
    });
    refresh('urls', this.allowlistPaths.urls, (entries) => {
      this.urlAllowlist = entries;
    });
    refresh('npm', this.allowlistPaths.npm, (entries) => {
      this.packageAllowlist.npm = entries;
    });
    refresh('pypi', this.allowlistPaths.pypi, (entries) => {
      this.packageAllowlist.pypi = entries;
    });
    refresh('bun', this.allowlistPaths.bun, (entries) => {
      this.packageAllowlist.bun = entries;
    });

    if (updates.length > 0) {
      this.logger.info({ updates }, 'MCP allowlists reloaded');
    }
  }

  private async ensureDockerNetwork() {
    if (!this.dockerNetworkName) {
      return;
    }
    const networkName = this.dockerNetworkName;
    if (this.ensureNetworkPromise) {
      return this.ensureNetworkPromise;
    }

    this.ensureNetworkPromise = (async () => {
      const env: NodeJS.ProcessEnv = { ...process.env };
      if (this.dockerHost) {
        env.DOCKER_HOST = this.dockerHost;
      }

      try {
        await execFileAsync('docker', ['network', 'inspect', networkName], { env });
        return;
      } catch {
        this.logger.info(
          { network: networkName },
          'Docker network not found, creating'
        );
      }

      try {
        await execFileAsync('docker', ['network', 'create', networkName], { env });
        this.logger.info(
          { network: networkName },
          'Docker network created or already exists'
        );
      } catch (error) {
        this.logger.warn(
          { error, network: networkName },
          'Docker network could not be created'
        );
        throw error;
      }
    })();

    return this.ensureNetworkPromise;
  }

  private resolveEnv(spec: Record<string, any>) {
    const envResult = resolveEnvMap(spec.env as Record<string, unknown>, [defaultEnvSource]);
    const resolvedEnv: Record<string, string> = { 
      ...envResult.resolved,
      // Force UTF-8 encoding for MCP servers (especially Python ones)
      PYTHONIOENCODING: 'utf-8',
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8'
    };
    const displayEnv: Record<string, string> = {
      ...resolvedEnv,
      ...envResult.masked
    };

    const envFrom = spec.envFrom?.secretRef;
    if (Array.isArray(envFrom)) {
      for (const entry of envFrom) {
        if (typeof entry !== 'string') continue;
        try {
          const resolved = defaultEnvSource(entry);
          if (resolved === undefined) {
            envResult.missing.push(entry);
            continue;
          }
          for (const line of resolved.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const [key, ...valueParts] = trimmed.split('=');
            if (!key) continue;
            const value = valueParts.join('=') ?? '';
            resolvedEnv[key] = value;
            displayEnv[key] = '***';
          }
        } catch (error) {
          if (error instanceof SecretResolutionError) {
            envResult.missing.push(entry);
          } else {
            throw error;
          }
        }
      }
    }

    return { resolvedEnv, displayEnv, missing: envResult.missing };
  }

  preview(payload: Record<string, any>) {
    this.reloadAllowlistsIfNeeded();
    const results: Record<string, ReturnType<typeof buildPreview>> = {};
    for (const [name, spec] of Object.entries(payload.mcpServers ?? {})) {
      const rawSpec = spec as Record<string, any>;
      const resolved = this.resolveEnv(rawSpec);
      const preview = buildPreview(name, rawSpec, this.hardening);
      preview.env = { ...preview.env, ...resolved.displayEnv };
      if (rawSpec.env && typeof rawSpec.env === 'object') {
        for (const [envKey, envValue] of Object.entries(rawSpec.env as Record<string, unknown>)) {
          if (isSecretReference(envValue)) {
            preview.env[envKey] = resolved.displayEnv[envKey] ?? '***';
          }
        }
      }
      if (resolved.missing.length > 0) {
        preview.missingSecrets = resolved.missing;
      }
      Object.defineProperty(preview, 'resolvedEnv', {
        value: { ...resolved.resolvedEnv },
        enumerable: false,
        configurable: true
      });
      results[name] = preview;
    }
    return results;
  }

  async start(payload: Record<string, any>, options?: { dryRun?: boolean }) {
    const validation = this.validate(payload);
    if (!validation.valid) {
      this.logger.warn({ validation }, 'MCP start aborted (validation failed)');
      return { status: 'validation_failed' as const, validation };
    }

    const preview = this.preview(payload);
    const launch: Record<string, string> = {};
    const warnings = [...validation.warnings];

    for (const [name, spec] of Object.entries(preview)) {
      if (!options?.dryRun) {
        await this.recordStatus(name, { status: 'pending' });
      }
      const envKeys = Object.keys((spec as any).resolvedEnv ?? spec.env ?? {});
      this.logger.info(
        {
          server: name,
          command: spec.command,
          args: spec.args,
          envKeys,
          dryRun: Boolean(options?.dryRun)
        },
        'MCP server start requested'
      );
      if (spec.missingSecrets && spec.missingSecrets.length > 0) {
        launch[name] = 'missing_secrets';
        warnings.push(
          `Server ${name}: Secrets ${spec.missingSecrets.join(', ')} could not be resolved.`
        );
        if (!options?.dryRun) {
          await this.recordStatus(name, {
            status: 'failed',
            logExcerpt: `Secrets missing: ${spec.missingSecrets.join(', ')}`
          });
        }
        continue;
      }
      const resolvedEnv = (spec as any).resolvedEnv ?? spec.env;
      
      const isRemote = Boolean(spec.url);
      const isStdio = this.isStdioCommand(spec.command ?? '');

      if (isRemote || isStdio) {
        if (spec.command === 'docker') {
          const dockerHost = this.dockerHost ?? process.env.DOCKER_HOST ?? '';
          if (!dockerHost) {
            launch[name] = 'docker_host_missing';
            warnings.push(`Server ${name}: ROOTLESS_DOCKER_HOST/Docker Host is not set.`);
            this.logger.warn({ server: name }, 'MCP server start aborted: Docker Host missing');
            continue;
          }
          if (this.requireRootlessDocker && !dockerHost.includes('/run/user/')) {
            launch[name] = 'rootless_required';
            warnings.push(`Server ${name}: Docker Host ${dockerHost} does not appear to be Rootless.`);
            this.logger.warn({ server: name, dockerHost }, 'MCP server start aborted: Rootless required');
            continue;
          }

          const isRun = Array.isArray(spec.args) && spec.args.includes('run');
          if (isRun) {
            try {
              await this.ensureDockerNetwork();
            } catch (error) {
              launch[name] = 'network_missing';
              warnings.push(
                `Server ${name}: Docker network ${this.dockerNetworkName ?? ''} could not be created/found.`
              );
              this.logger.warn(
                {
                  server: name,
                  dockerHost,
                  network: this.dockerNetworkName,
                  err: error instanceof Error ? error.message : String(error)
                },
                'MCP server start aborted: Docker network missing'
              );
              continue;
            }
          }
        }

        if (this.clients.has(name)) {
          launch[name] = 'already_running';
          this.logger.info({ server: name }, isRemote ? 'MCP server already connected (remote)' : 'MCP server already started (stdio)');
          continue;
        }
        try {
          const client = await connectMcpServer({
            url: spec.url,
            command: spec.command,
            args: spec.args,
            env: resolvedEnv
          });
          this.clients.set(name, { ...client, startedAt: Date.now() });
          this.toolCache.delete(name);
          launch[name] = 'started';
          this.logger.info({ server: name, command: spec.command, url: spec.url }, isRemote ? 'MCP server connected (remote)' : 'MCP server (stdio) started');
          if (!options?.dryRun) {
            await this.recordStatus(name, { status: 'running', startedAt: new Date() });
          }
        } catch (error) {
          launch[name] = 'failed';
          this.logger.error(
            { server: name, err: error instanceof Error ? error.message : String(error) },
            isRemote ? 'MCP server connection failed' : 'MCP server (stdio) start failed'
          );
          if (!options?.dryRun) {
            await this.recordStatus(name, {
              status: 'failed',
              logExcerpt: error instanceof Error ? error.message : 'Start/connection failed'
            });
          }
        }
      } else {
        const result = this.runner.start(name, {
          command: spec.command ?? '',
          args: spec.args ?? [],
          env: resolvedEnv
        });
        launch[name] = result.status;
        this.logger.info({ server: name, command: spec.command, status: result.status }, 'Runner-Start');
        if (!options?.dryRun && result.status === 'already_running') {
          await this.recordStatus(name, { status: 'running' });
        }
      }
    }
    if (options?.dryRun) {
      return {
        status: 'dry_run' as const,
        preview,
        launch,
        warnings
      };
    }

    return {
      status: 'started' as const,
      preview,
      launch,
      warnings
    };
  }

  listProcesses() {
    const runnerProcesses = this.runner.list();
    const clientProcesses = Array.from(this.clients.entries()).map(([name, client]) => ({
      name,
      command: client.spec.command ?? (client.spec.url ? 'http' : 'unknown'),
      args: client.spec.args ?? (client.spec.url ? [client.spec.url] : []),
      status: 'running' as const,
      startedAt: new Date(client.startedAt).toISOString()
    }));
    const memoryProcess = {
      name: 'memory',
      command: 'internal',
      args: [],
      status: 'running' as const,
      startedAt: this.startTime.toISOString()
    };
    const delegationProcess = {
      name: 'delegation',
      command: 'internal',
      args: [],
      status: 'running' as const,
      startedAt: this.startTime.toISOString()
    };
    return [...runnerProcesses, ...clientProcesses, memoryProcess, delegationProcess];
  }

  async stop(name: string) {
    if (this.clients.has(name)) {
      const client = this.clients.get(name)!;
      await client.stop();
      this.clients.delete(name);
      this.toolCache.delete(name);
      await this.recordStatus(name, { status: 'stopped', stoppedAt: new Date() });
      return { status: 'stopped' as const };
    }
    return this.runner.stop(name);
  }

  async stopAll() {
    const results: Record<string, any> = {};
    for (const name of Array.from(this.clients.keys())) {
      await this.stop(name);
      results[name] = { status: 'stopped' };
    }
    const runnerResults = await this.runner.stopAll();
    return { ...results, ...runnerResults };
  }

  getClient(name: string) {
    return this.clients.get(name);
  }

  listClientNames() {
    return Array.from(this.clients.keys()).concat(['memory', 'delegation']);
  }

  /**
   * Resolves the actual running client name for a configured server name.
   * Tries variations: exact, with user suffix, stripped mcp-server- prefix,
   * stripped prefix with user suffix.
   */
  resolveClientName(configuredName: string, userId?: string): string | null {
    const suffix = userId ? `-${userId}` : '';
    const stripped = configuredName.startsWith('mcp-server-') ? configuredName.slice(11) : configuredName;
    const candidates = [
      configuredName,
      suffix ? `${configuredName}${suffix}` : null,
      stripped !== configuredName ? stripped : null,
      stripped !== configuredName && suffix ? `${stripped}${suffix}` : null
    ].filter((v): v is string => v !== null);
    for (const candidate of candidates) {
      if (this.clients.has(candidate)) return candidate;
    }
    return null;
  }

  async listTools(serverName: string, options?: { force?: boolean }): Promise<McpToolDefinition[]> {
    if (serverName === 'memory') {
      return [
        {
          name: 'memory-search',
          description: 'Searches for relevant documents in long-term memory.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              namespaces: { type: 'array', items: { type: 'string' } },
              topK: { type: 'integer', default: 5 }
            },
            required: ['query', 'namespaces']
          }
        },
        {
          name: 'memory-write',
          description: 'Permanently stores new information in memory.',
          inputSchema: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'Text to store' },
              namespace: { type: 'string', description: 'Target namespace' },
              metadata: { type: 'object' }
            },
            required: ['content', 'namespace']
          }
        },
        {
          name: 'memory-delete',
          description: 'Deletes information from memory (soft-delete or permanent).',
          inputSchema: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'Content of the document to delete (for precise search)' },
              namespace: { type: 'string', description: 'Namespace' },
              hard: { type: 'boolean', default: false, description: 'Delete permanently (true) or just mark (false)' }
            },
            required: ['content', 'namespace']
          }
        }
      ];
    }

    if (serverName === 'delegation') {
      return [
        {
          name: 'delegate-to-agent',
          title: 'Delegate to Agent',
          description: 'Delegates a task to a specialized agent.',
          inputSchema: {
            type: 'object',
            properties: {
              agent: { type: 'string', description: 'Name or UUID of the target agent.' },
              task: { type: 'string', description: 'Optional specification of the task/context.' },
              input: { type: 'string', description: 'The concrete task or message to the sub-agent.' }
            },
            required: ['agent', 'input']
          }
        }
      ];
    }

    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server ${serverName} is not running`);
    }
    if (!options?.force) {
      const cached = this.toolCache.get(serverName);
      if (cached) {
        return cached.tools;
      }
    }
    const result = await client.client.listTools();
    const tools = Array.isArray(result?.tools)
      ? (result.tools as McpToolDefinition[])
      : [];
    this.toolCache.set(serverName, this.buildToolCacheEntry(tools));
    return tools;
  }

  getToolCacheMeta(serverName: string) {
    const entry = this.toolCache.get(serverName);
    if (!entry) {
      return undefined;
    }
    return {
      version: entry.version,
      fetchedAt: entry.fetchedAt
    };
  }

  async callTool<TArgs extends Record<string, unknown>, TResult>(
    serverName: string,
    params: { name: string; arguments?: TArgs },
    context?: any
  ): Promise<TResult> {
    if (this.internalToolHandlers.has(serverName) || serverName === 'memory') {
      const handler = this.internalToolHandlers.get(serverName);
      if (handler) {
        return handler(params.name, params.arguments, context) as Promise<TResult>;
      }
      
      // Built-in fallback for memory if no explicit handler registered
      if (serverName === 'memory' && this.memoryAdapter) {
        if (params.name === 'memory-search') {
          const { query, namespaces, topK } = params.arguments as any;
          const hits = await this.memoryAdapter.search(namespaces, { query, topK }, context?.db);
          return { hits } as any;
        }
        if (params.name === 'memory-write') {
          const { content, namespace, metadata } = params.arguments as any;
          const count = await this.memoryAdapter.writeDocuments(namespace, [{ content, metadata }], undefined, context?.db);
          return { count } as any;
        }
        if (params.name === 'memory-delete') {
          const { content, namespace, hard } = params.arguments as any;
          const count = await this.memoryAdapter.deleteDocuments(namespace, [content], { hard }, context?.db);
          return { count } as any;
        }
      }
    }
    const client = this.clients.get(serverName);
    if (!client) {
      const available = Array.from(this.clients.keys()).concat(['memory', 'delegation']);
      throw new Error(`MCP server "${serverName}" is not running. Available: ${available.join(', ')}`);
    }
    try {
      const result = await client.client.callTool({
        name: params.name,
        arguments: params.arguments ?? {}
      });
      const cached = this.toolCache.get(serverName);
      if (cached) {
        this.toolCache.set(serverName, this.buildToolCacheEntry(cached.tools));
      }
      return result as TResult;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ error, server: serverName, tool: params.name }, 'Tool call failed');
      throw new Error(`Tool "${params.name}" on server "${serverName}" failed: ${msg}`);
    }
  }

  private buildToolCacheEntry(tools: McpToolDefinition[]): ToolCacheEntry {
    const hash = createHash('sha1');
    hash.update(
      JSON.stringify(
        tools.map((tool) => ({
          name: tool.name,
          title: tool.title ?? null,
          description: tool.description ?? null,
          inputSchema: tool.inputSchema ?? null
        }))
      )
    );
    return {
      tools,
      fetchedAt: Date.now(),
      version: hash.digest('hex')
    };
  }

  private isStdioCommand(command: string) {
    return command === 'npx' || command === 'npm' || command === 'uvx' || command === 'bun' || command === 'bunx' || command === 'python' || command === 'python3' || command === 'docker';
  }

  private async recordStatus(name: string, update: Omit<ServerStatusUpdateParams, 'name'>) {
    if (!this.statusUpdater) {
      return;
    }
    try {
      await this.statusUpdater({
        name,
        ...update
      });
    } catch (error) {
      this.logger.warn({ err: error, server: name }, 'Status update failed');
    }
  }

  private async handleRunnerLifecycle(event: RunnerLifecycleEvent) {
    if (event.type === 'running') {
      await this.recordStatus(event.name, { status: 'running', startedAt: new Date(event.startedAt) });
      return;
    }
    const stoppedAt = new Date();
    const logExcerpt = event.logs.slice(-20).join('\n');
    await this.recordStatus(event.name, {
      status: event.type === 'stopped' ? 'stopped' : 'failed',
      exitCode: event.exitCode ?? null,
      signal: event.signal ?? null,
      stoppedAt,
      logExcerpt
    });
  }

}
