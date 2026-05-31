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

export type AutomationTriggerType = 'cron' | 'webhook' | 'manual';

export interface AutomationTrigger {
  type: AutomationTriggerType;
  id: string;
}

/**
 * Builds the system notice injected before the user message for automated runs.
 * Instructs the model not to create new schedules and to execute the task directly.
 * Always English — these are meta-instructions to the model, not user-facing content.
 */
export function buildAutomationSystemNote(
  type: AutomationTriggerType,
  name: string
): string {
  if (type === 'cron') {
    return (
      `AUTOMATED EXECUTION: This message was triggered automatically by a scheduled job (name: "${name}"). ` +
      `Execute the task directly. Do NOT create new schedules, reminders, or cron jobs — the existing schedule is already active.`
    );
  }
  return (
    `AUTOMATED EXECUTION: This message was triggered by an incoming webhook event (source: "${name}"). ` +
    `Execute the task directly. Do NOT create new schedules or cron jobs.`
  );
}
