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
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode
} from 'react';
import {
  listProvidersApi,
  createProviderApi,
  updateProviderApi,
  deleteProviderApi,
  type ProviderResponse,
  type ProviderUpsertPayload
} from '../lib/api';
import type { ProviderEntry, ProviderModel } from '../types/providers';
import providersSeed from '../../mock/providers.json';
import { useAuth } from './auth-context';
import { useTranslation } from 'react-i18next';
import { localizeError } from '../lib/error-utils';

interface ProviderContextValue {
  providers: ProviderEntry[];
  loading: boolean;
  error: string | null;
  offline: boolean;
  refresh: () => Promise<void>;
  addProvider: (provider: ProviderEntry) => Promise<ProviderEntry>;
  updateProvider: (provider: ProviderEntry) => Promise<ProviderEntry>;
  removeProvider: (id: string) => Promise<void>;
}

const STORAGE_KEY = 'mcp.providers.fallback';

const ProviderContext = createContext<ProviderContextValue | undefined>(undefined);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withDefaults(provider: ProviderEntry): ProviderEntry {
  const models = Array.isArray(provider.models) ? provider.models : [];
  return {
    ...provider,
    models,
    authMode: provider.authMode ?? 'bearer',
    testMethod: provider.testMethod ?? 'GET',
    connectionStatus: provider.connectionStatus ?? 'unknown'
  };
}

function mapResponseToEntry(response: ProviderResponse): ProviderEntry {
  // Wir nutzen NUR show_in_composer, da der Compiler showInComposer nicht kennt
  const mapped = withDefaults({
    id: response.id,
    label: response.label,
    providerType: response.providerType ?? 'http',
    baseUrl: response.baseUrl,
    authMode: response.authMode,
    apiKeyRef: response.apiKeyRef,
    headerName: response.headerName,
    queryName: response.queryName,
    testPath: response.testPath,
    testMethod: response.testMethod,
    testModelId: response.testModelId,
    metadata: response.metadata,
    showInComposer: response.show_in_composer !== false,
    connectionStatus: response.connectionStatus,
    connectionCheckedAt: response.connectionCheckedAt,
    connectionDurationMs: response.connectionDurationMs,
    connectionMessage: response.connectionMessage,
    connectionUrl: response.connectionUrl,
    connectionPreview: response.connectionPreview,
    connectionWarnings: response.connectionWarnings,
    createdAt: response.createdAt,
    updatedAt: response.updatedAt,
    models: response.models.map((model) => ({
      id: model.id,
      label: model.label,
      metadata: model.metadata,
      active: model.active,
      capability: model.capability as import('../types/providers').ModelCapability | undefined,
      showInComposer: model.show_in_composer !== false
    }))
  });

  console.debug(`[ProviderContext] Mapped response for ${response.id}:`, {
    show_in_composer: response.show_in_composer,
    mapped_showInComposer: mapped.showInComposer
  });

  return mapped;
}

function mapEntryToPayload(entry: ProviderEntry): ProviderUpsertPayload {
  return {
    id: entry.id,
    label: entry.label,
    providerType: entry.providerType ?? 'http',
    baseUrl: entry.baseUrl ?? null,
    authMode: entry.authMode,
    apiKeyRef: entry.apiKeyRef ?? null,
    headerName: entry.headerName ?? null,
    queryName: entry.queryName ?? null,
    testPath: entry.testPath ?? null,
    testMethod: entry.testMethod ?? 'GET',
    testModelId: entry.testModelId ?? null,
    metadata: isPlainObject(entry.metadata) ? entry.metadata : undefined,
    show_in_composer: entry.showInComposer ?? true,
    models: entry.models.map((model: ProviderModel) => ({
      id: model.id,
      label: model.label,
      metadata: isPlainObject(model.metadata) ? model.metadata : undefined,
      active: typeof model.active === 'boolean' ? model.active : undefined,
      capability: model.capability,
      show_in_composer: model.showInComposer ?? true
    }))
  };
}

function loadFallbackFromStorage(): ProviderEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item): item is ProviderEntry => typeof item === 'object' && item !== null)
      .map((entry) => withDefaults(entry));
  } catch (error) {
    console.warn('Failed to load provider fallback', error);
    return [];
  }
}

function persistFallback(providers: ProviderEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
  } catch (error) {
    console.warn('Failed to save provider fallback', error);
  }
}

function seedProviders(): ProviderEntry[] {
  return (providersSeed as ProviderEntry[]).map((entry) => withDefaults(entry));
}

export function ProviderContextProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation(['admin', 'common', 'errors']);
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const { isAuthenticated } = useAuth();

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setProviders([]);
      setOffline(false);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const apiProviders = await listProvidersApi();
      const mapped = apiProviders.map(mapResponseToEntry);
      setProviders(mapped);
      persistFallback(mapped);
      setOffline(false);
      setError(null);
    } catch (err) {
      if ((err as any)?.status === 401) {
        setProviders([]);
        setOffline(false);
        setError(null);
      } else {
        console.error(t('providers.loadError'), err);
        setError(localizeError(err, t, 'providers.loadErrorOffline'));
        setOffline(true);
        const fallback = loadFallbackFromStorage();
        if (fallback.length > 0) {
          setProviders(fallback);
        } else {
          const seeded = seedProviders();
          setProviders(seeded);
          persistFallback(seeded);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setProviders([]);
      setLoading(false);
      return;
    }
    void refresh();
  }, [refresh, isAuthenticated]);

  const addProvider = useCallback(
    async (provider: ProviderEntry) => {
      const payload = mapEntryToPayload(provider);
      setLoading(true);
      try {
        const saved = await createProviderApi(payload);
        const entry = mapResponseToEntry(saved);
        setProviders((prev) => {
          const next = [...prev.filter((item) => item.id !== entry.id), entry];
          persistFallback(next);
          return next;
        });
        setOffline(false);
        setError(null);
        return entry;
      } catch (err) {
        console.error(t('providers.saveProviderError'), err);
        setError(localizeError(err, t, 'providers.saveProviderErrorFallback'));
        setOffline(true);
        const entry = withDefaults(provider);
        setProviders((prev) => {
          const next = [...prev.filter((item) => item.id !== entry.id), entry];
          persistFallback(next);
          return next;
        });
        return entry;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updateProvider = useCallback(
    async (provider: ProviderEntry) => {
      const payload = mapEntryToPayload(provider);
      // --- NEU: Optimistisches Update ---
      const oldProviders = [...providers];
      setProviders((prev) => prev.map((item) => (item.id === provider.id ? provider : item)));
      // ----------------------------------
      setLoading(true);
      try {
        const saved = await updateProviderApi(provider.id, payload);
        const entry = mapResponseToEntry(saved);
        setProviders((prev) => {
          const next = prev.map((item) => (item.id === entry.id ? entry : item));
          persistFallback(next);
          return next;
        });
        setOffline(false);
        setError(null);
        return entry;
      } catch (err) {
        console.error(`${t('updateError', { ns: 'common' })}, Rollback...`, err);
        // Rollback bei Fehler
        setProviders(oldProviders);
        setError(localizeError(err, t, 'common:updateError'));
        return withDefaults(provider);
      } finally {
        setLoading(false);
      }
    },
    [providers, t] // Wichtig: providers hier hinzufügen!
  );

  const removeProvider = useCallback(async (id: string) => {
    const normalized = id.trim().toLowerCase();
    setLoading(true);
    try {
      await deleteProviderApi(normalized);
      setProviders((prev) => {
        const next = prev.filter((provider) => provider.id !== normalized);
        persistFallback(next);
        return next;
      });
      setOffline(false);
      setError(null);
    } catch (err) {
      console.error(t('providers.deleteProviderError'), err);
      setError(localizeError(err, t, 'providers.deleteProviderErrorFallback'));
      setOffline(true);
      setProviders((prev) => {
        const next = prev.filter((provider) => provider.id !== normalized);
        persistFallback(next);
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  const value = useMemo(
    () => ({
      providers,
      loading,
      error,
      offline,
      refresh,
      addProvider,
      updateProvider,
      removeProvider
    }),
    [providers, loading, error, offline, refresh, addProvider, updateProvider, removeProvider]
  );

  return <ProviderContext.Provider value={value}>{children}</ProviderContext.Provider>;
}

export function useProviderContext() {
  const context = useContext(ProviderContext);
  if (!context) {
    throw new Error('useProviderContext must be used within ProviderContextProvider');
  }
  return context;
}
