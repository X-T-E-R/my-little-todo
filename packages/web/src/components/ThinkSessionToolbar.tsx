import type { ExtractedAction } from '@my-little-todo/core';
import { Check, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function ThinkSessionToolbar({
  aiBusy,
  actions,
  onAiExtract,
  onApplyActions,
  onDone,
  onNavigateNow,
  onToggleAction,
}: {
  aiBusy: boolean;
  actions: ExtractedAction[] | undefined;
  onAiExtract: () => void;
  onApplyActions: () => void;
  onDone: () => void;
  onNavigateNow: () => void;
  onToggleAction: (id: string) => void;
}) {
  const { t } = useTranslation('think');
  const hasAdopted = actions?.some((a) => a.adopted);

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/80 px-3 py-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={aiBusy}
          onClick={onAiExtract}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--color-accent)' }}
        >
          {aiBusy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
          {t('toolbar_ai_extract')}
        </button>
        <button
          type="button"
          onClick={onNavigateNow}
          className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          <Sparkles size={14} />
          {t('toolbar_go_now')}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          <Check size={14} />
          {t('toolbar_done')}
        </button>
      </div>

      {actions && actions.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {t('extracted_title')}
          </p>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {actions.map((a) => (
              <li key={a.id} className="flex items-start gap-2 text-xs">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={a.adopted}
                    onChange={() => onToggleAction(a.id)}
                    className="mt-0.5"
                  />
                  <span style={{ color: 'var(--color-text)' }}>{a.description}</span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={!hasAdopted || aiBusy}
            onClick={onApplyActions}
            className="w-full rounded-xl py-2 text-xs font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--color-accent)' }}
          >
            {t('apply_selected')}
          </button>
        </div>
      )}
    </div>
  );
}
