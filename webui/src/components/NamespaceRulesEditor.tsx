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
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localizeError } from '../lib/error-utils';
import { Plus, Trash2, RefreshCw, AlertTriangle, Pencil, X, Save, Database } from 'lucide-react';
import {
  listNamespaceRules,
  createNamespaceRule,
  updateNamespaceRule,
  deleteNamespaceRule,
  type NamespaceRule
} from '../lib/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';

import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider
} from './ui/tooltip';

export function NamespaceRulesEditor() {
  const { t, i18n } = useTranslation(['admin', 'common', 'errors']);
  const [rules, setRules] = useState<NamespaceRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [pattern, setPattern] = useState('');
  const [bonus, setBonus] = useState('');
  const [description, setDescription] = useState('');
  const [instructionTemplate, setInstructionTemplate] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Delete dialog
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listNamespaceRules();
      setRules(data);
    } catch (err) {
      setError(localizeError(err, t, 'memory.rules.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const handleEdit = (rule: NamespaceRule) => {
    setEditingId(rule.id);
    setPattern(rule.pattern);
    setBonus(String(rule.bonus));
    setDescription(rule.description || '');
    setInstructionTemplate(rule.instructionTemplate || '');
    setError(null);
  };

  const handleCancel = () => {
    setEditingId(null);
    setPattern('');
    setBonus('');
    setDescription('');
    setInstructionTemplate('');
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pattern.trim()) return;
    const bonusVal = parseFloat(bonus);
    if (isNaN(bonusVal)) return;

    setSubmitting(true);
    setError(null);
    try {
      if (editingId) {
        const updated = await updateNamespaceRule(editingId, {
          pattern: pattern.trim(),
          bonus: bonusVal,
          description: description.trim() || null,
          instructionTemplate: instructionTemplate.trim() || null
        });
        setRules(prev => prev.map(r => r.id === editingId ? updated : r).sort((a, b) => a.pattern.localeCompare(b.pattern)));
        handleCancel(); // Reset form
      } else {
        const created = await createNamespaceRule({
          pattern: pattern.trim(),
          bonus: bonusVal,
          description: description.trim() || null,
          instructionTemplate: instructionTemplate.trim() || null
        });
        setRules(prev => [...prev, created].sort((a, b) => a.pattern.localeCompare(b.pattern)));
        setPattern('');
        setBonus('');
        setDescription('');
        setInstructionTemplate('');
      }
    } catch (err) {
      setError(localizeError(err, t, 'memory.rules.saveError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteNamespaceRule(deleteId);
      setRules(prev => prev.filter(r => r.id !== deleteId));
      if (editingId === deleteId) {
        handleCancel();
      }
      setDeleteId(null);
    } catch (err) {
      setError(localizeError(err, t, 'memory.rules.deleteError'));
    }
  };

  const isValid = pattern.trim().length > 0 && bonus.trim().length > 0 && !isNaN(parseFloat(bonus));

  return (
    <TooltipProvider>
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {t('memory.rules.description')}
        </div>
        <button
          type="button"
          className="btn-default"
          onClick={() => void loadRules()}
          disabled={loading}
        >
          {loading ? t('loading', { ns: 'common' }) : t('refresh', { ns: 'common' })}
        </button>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-400 bg-red-950/20 border border-red-900/50 rounded flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      <form onSubmit={(e) => void handleSave(e)} className="admin-mcp-form-body bg-[#0B1424] p-4 rounded-md border border-[#1E293B]">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-4 space-y-1.5">
            <label className="text-xs font-medium text-slate-400">{t('memory.rules.pattern')}</label>
            <Input 
              value={pattern} 
              onChange={e => setPattern(e.target.value)} 
              placeholder={t('memory.rules.patternPlaceholder')} 
              required
              className="bg-[#121B2B] border-[#1E293B]"
            />
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-xs font-medium text-slate-400">{t('memory.rules.bonus')}</label>
            <Input 
              type="number" 
              step="0.01" 
              value={bonus} 
              onChange={e => setBonus(e.target.value)} 
              placeholder="0.05" 
              required
              className="bg-[#121B2B] border-[#1E293B]"
            />
          </div>
          <div className="md:col-span-6 space-y-1.5">
            <label className="text-xs font-medium text-slate-400">{t('memory.rules.descriptionLabel')}</label>
            <Input 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              placeholder={t('memory.rules.descriptionPlaceholder')} 
              className="bg-[#121B2B] border-[#1E293B]"
            />
          </div>
          
          <div className="md:col-span-10 space-y-1.5">
            <label className="text-xs font-medium text-slate-400">{t('memory.rules.instructionTemplate')}</label>
            <Input 
              value={instructionTemplate} 
              onChange={e => setInstructionTemplate(e.target.value)} 
              placeholder={t('memory.rules.instructionPlaceholder')} 
              className="bg-[#121B2B] border-[#1E293B]"
            />
            <p className="text-[10px] text-muted-foreground">{t('memory.rules.placeholderHint')}</p>
          </div>

          <div className="md:col-span-2 flex gap-2 items-end pb-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="submit" 
                  disabled={submitting || !isValid}
                  className="admin-mcp-action flex-1 flex justify-center items-center h-9"
                >
                  {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{editingId ? t('save', { ns: 'common' }) : t('add', { ns: 'common' })}</TooltipContent>
            </Tooltip>
            {editingId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="admin-mcp-action ghost flex-1 flex justify-center items-center h-9"
                    onClick={handleCancel}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{t('cancel', { ns: 'common' })}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </form>

      <div className="border border-[#1E293B] rounded-md overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-[#0B1424] text-slate-400 font-medium border-b border-[#1E293B]">
            <tr>
              <th className="p-3 w-1/4">{t('memory.rules.pattern')}</th>
              <th className="p-3 w-20 text-right">{t('memory.rules.bonus')}</th>
              <th className="p-3 w-1/3">{t('memory.rules.instructionTemplate')}</th>
              <th className="p-3">{t('memory.rules.descriptionLabel')}</th>
              <th className="p-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E293B] bg-[#020817]">
            {rules.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted-foreground italic">
                  {t('memory.rules.noRules')}
                </td>
              </tr>
            ) : (
              rules.map(rule => (
                <tr key={rule.id} className={`bg-[#121B2B] hover:bg-[#1e293b] transition-colors ${editingId === rule.id ? 'ring-1 ring-inset ring-sky-500/50' : ''}`}>
                  <td className="p-3 font-mono text-xs text-sky-300">{rule.pattern}</td>
                  <td className="p-3 text-right font-mono">{rule.bonus > 0 ? '+' : ''}{rule.bonus.toFixed(2)}</td>
                  <td className="p-3 text-xs text-slate-300 truncate max-w-[200px]">
                    {rule.instructionTemplate ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">{rule.instructionTemplate}</span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[300px]">{rule.instructionTemplate}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-slate-600 italic">{t('notSet', { ns: 'common' })}</span>
                    )}
                  </td>
                  <td className="p-3 text-slate-400">{rule.description || '-'}</td>
                  <td className="p-3 text-right flex justify-end gap-3">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => handleEdit(rule)}
                        >
                          <Pencil className="h-3.5 w-3.5 text-slate-400" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{t('edit', { ns: 'common' })}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => setDeleteId(rule.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{t('delete', { ns: 'common' })}</TooltipContent>
                    </Tooltip>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('memory.rules.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('memory.rules.deleteConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="ghost">{t('cancel', { ns: 'common' })}</AlertDialogCancel>
            <AlertDialogAction 
              className="danger-button"
              onClick={() => void handleDelete()}
            >
              {t('delete', { ns: 'common' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}
