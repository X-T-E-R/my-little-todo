import type { ThinkSessionStartMode } from '@my-little-todo/core';
import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const MODES: ThinkSessionStartMode[] = ['blank', 'discovery', 'arrange'];

function modeLabelKey(mode: ThinkSessionStartMode): string {
  switch (mode) {
    case 'blank':
      return 'mode_blank';
    case 'discovery':
      return 'mode_discovery';
    case 'arrange':
      return 'mode_arrange';
    default:
      return 'mode_blank';
  }
}

export function ThinkSessionModeSelector({
  currentMode,
  content,
  aiBusy,
  onSelectMode,
}: {
  currentMode: ThinkSessionStartMode;
  content: string;
  aiBusy: boolean;
  onSelectMode: (mode: ThinkSessionStartMode) => void;
}) {
  const { t } = useTranslation('think');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const trySelect = useCallback(
    (mode: ThinkSessionStartMode) => {
      if (mode === currentMode) {
        setOpen(false);
        return;
      }
      const trimmed = content.trim();
      if (trimmed.length > 0) {
        const ok = window.confirm(t('mode_switch_confirm'));
        if (!ok) {
          setOpen(false);
          return;
        }
      }
      onSelectMode(mode);
      setOpen(false);
    },
    [content, currentMode, onSelectMode, t],
  );

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        disabled={aiBusy}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50"
        style={{
          borderColor: 'var(--color-border)',
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {t(modeLabelKey(currentMode))}
        <ChevronDown size={14} className="opacity-70" aria-hidden />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-20 mt-1 min-w-[11rem] rounded-xl border py-1 shadow-lg"
          style={{
            borderColor: 'var(--color-border)',
            background: 'var(--color-bg)',
          }}
        >
          {MODES.map((mode) => (
            <div key={mode}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-[11px] font-medium hover:bg-[var(--color-surface)]"
                aria-pressed={mode === currentMode}
                style={{
                  color: mode === currentMode ? 'var(--color-accent)' : 'var(--color-text)',
                }}
                onClick={() => trySelect(mode)}
              >
                {t(modeLabelKey(mode))}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
