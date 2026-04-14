import type { WindowContext, WindowContextMatchMode } from '@my-little-todo/core';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoleStore } from '../../stores';
import { useWindowContextStore } from '../../stores/windowContextStore';
import { isTauriEnv } from '../../utils/platform';

type FgPayload = {
  title: string;
  processName?: string | null;
  processId: number;
};

function newRule(): WindowContext {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    processName: '',
    titlePattern: '',
    matchMode: 'contains',
    roleIds: [],
    note: '',
    createdAt: now,
    updatedAt: now,
  };
}

export function WindowContextSettings() {
  const { t } = useTranslation('widget');
  const { t: ts } = useTranslation('settings');
  const roles = useRoleStore((s) => s.roles);
  const loadRoles = useRoleStore((s) => s.load);
  const contexts = useWindowContextStore((s) => s.contexts);
  const loadContexts = useWindowContextStore((s) => s.loadContexts);
  const putContext = useWindowContextStore((s) => s.putContext);
  const deleteContext = useWindowContextStore((s) => s.deleteContext);
  const [editing, setEditing] = useState<WindowContext | null>(null);
  const tauri = isTauriEnv();

  useEffect(() => {
    void loadRoles();
    void loadContexts();
  }, [loadRoles, loadContexts]);

  const captureForeground = useCallback(async () => {
    if (!tauri) return;
    try {
      const raw = await invoke<FgPayload | null>('get_foreground_window_info');
      if (!raw) return;
      const now = new Date();
      setEditing({
        id: crypto.randomUUID(),
        processName: raw.processName ?? '',
        displayName: raw.processName?.replace(/\.exe$/i, '') || undefined,
        titlePattern: raw.title?.slice(0, 120) ?? '',
        matchMode: 'contains',
        roleIds: [],
        note: '',
        createdAt: now,
        updatedAt: now,
      });
    } catch {
      /* */
    }
  }, [tauri]);

  const save = async (ctx: WindowContext) => {
    const now = new Date();
    await putContext({ ...ctx, updatedAt: now });
    setEditing(null);
  };

  if (!tauri) {
    return (
      <p className="text-sm text-[var(--color-text-tertiary)]">{ts('window_context_tauri_only')}</p>
    );
  }

  return (
    <div className="space-y-4 text-sm text-[var(--color-text)]">
      <p className="text-[var(--color-text-secondary)]">{ts('window_context_intro')}</p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void invoke('show_annotator_window')}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium hover:bg-[var(--color-bg)]"
        >
          {t('open_annotator_panel')}
        </button>
        <button
          type="button"
          onClick={() => void captureForeground()}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium hover:bg-[var(--color-bg)]"
        >
          {t('capture_foreground')}
        </button>
        <button
          type="button"
          onClick={() => setEditing(newRule())}
          className="inline-flex items-center gap-1 rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs font-medium hover:bg-[var(--color-bg)]"
        >
          <Plus size={14} />
          {t('add_rule')}
        </button>
      </div>

      {contexts.length === 0 && !editing && (
        <p className="text-xs text-[var(--color-text-tertiary)]">{t('no_rules')}</p>
      )}

      <ul className="space-y-2">
        {contexts.map((c) => (
          <li
            key={c.id}
            className="flex items-start justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
          >
            <div className="min-w-0 text-xs">
              <p className="font-medium truncate">
                {c.processName || '—'} · {c.titlePattern || '*'}
              </p>
              <p className="text-[var(--color-text-tertiary)] line-clamp-2">{c.note || '—'}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => setEditing({ ...c })}
                className="rounded-lg px-2 py-1 text-[11px] text-[var(--color-accent)] hover:underline"
              >
                {t('edit')}
              </button>
              <button
                type="button"
                onClick={() => void deleteContext(c.id)}
                className="rounded-lg p-1 text-[var(--color-text-tertiary)] hover:text-rose-500"
                aria-label={t('delete_rule')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 space-y-3">
          <label className="block text-xs">
            <span className="text-[var(--color-text-secondary)]">{t('process_name')}</span>
            <input
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs"
              value={editing.processName ?? ''}
              onChange={(e) => setEditing({ ...editing, processName: e.target.value })}
            />
          </label>
          <label className="block text-xs">
            <span className="text-[var(--color-text-secondary)]">{t('display_name')}</span>
            <input
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs"
              value={editing.displayName ?? ''}
              onChange={(e) => setEditing({ ...editing, displayName: e.target.value || undefined })}
            />
          </label>
          <label className="block text-xs">
            <span className="text-[var(--color-text-secondary)]">{t('title_pattern')}</span>
            <input
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs"
              value={editing.titlePattern ?? ''}
              onChange={(e) => setEditing({ ...editing, titlePattern: e.target.value })}
            />
          </label>
          <label className="block text-xs">
            <span className="text-[var(--color-text-secondary)]">{t('match_mode')}</span>
            <select
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs"
              value={editing.matchMode}
              onChange={(e) =>
                setEditing({ ...editing, matchMode: e.target.value as WindowContextMatchMode })
              }
            >
              <option value="contains">{t('match_contains')}</option>
              <option value="exact">{t('match_exact')}</option>
              <option value="regex">{t('match_regex')}</option>
            </select>
          </label>
          <fieldset className="text-xs">
            <legend className="text-[var(--color-text-secondary)]">{t('roles')}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {roles.map((r) => {
                const checked = editing.roleIds.includes(r.id);
                return (
                  <label key={r.id} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked
                          ? editing.roleIds.filter((id) => id !== r.id)
                          : [...editing.roleIds, r.id];
                        setEditing({ ...editing, roleIds: next });
                      }}
                    />
                    <span>{r.name}</span>
                  </label>
                );
              })}
            </div>
            {roles.length === 0 && (
              <p className="mt-2 text-[var(--color-text-tertiary)]">{t('no_roles_hint')}</p>
            )}
          </fieldset>
          <label className="block text-xs">
            <span className="text-[var(--color-text-secondary)]">{t('note_md')}</span>
            <textarea
              className="mt-1 w-full min-h-[72px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs"
              value={editing.note}
              onChange={(e) => setEditing({ ...editing, note: e.target.value })}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save(editing)}
              className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white"
            >
              {t('save_rule')}
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs"
            >
              {ts('Cancel', { defaultValue: 'Cancel' })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
