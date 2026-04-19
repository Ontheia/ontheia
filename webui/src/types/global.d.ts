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
import type { ToolApprovalQueueEntry } from './tool-approvals';
import type { SidebarMemoryHit } from './sidebar-memory';

declare global {
  interface Window {
    __pendingToolApprovals?: ToolApprovalQueueEntry[];
    __memoryHits?: SidebarMemoryHit[];
    __chainConsole?: string[];
  }
}

interface ImportMetaEnv {
  readonly VITE_PROMPT_OPTIMIZER_CHAIN_ID?: string;
  readonly VITE_PROMPT_OPTIMIZER_CHAIN?: string;
  readonly VITE_BUILDER_CHAIN_ID?: string;
  readonly VITE_BUILDER_CHAIN?: string;
  [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
