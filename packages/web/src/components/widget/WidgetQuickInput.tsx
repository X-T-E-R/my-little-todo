import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStreamStore } from '../../stores';

interface WidgetQuickInputProps {
  primaryRoleId?: string;
  onSubmitted?: () => void;
}

export function WidgetQuickInput({ primaryRoleId, onSubmitted }: WidgetQuickInputProps) {
  const { t } = useTranslation('widget');
  const addEntry = useStreamStore((s) => s.addEntry);
  const [line, setLine] = useState('');

  const submit = async () => {
    const trimmed = line.trim();
    if (!trimmed) return;
    await addEntry(trimmed, true, { roleId: primaryRoleId });
    setLine('');
    onSubmitted?.();
  };

  return (
    <div className="flex gap-2 border-t border-[var(--color-border)] px-2 py-2">
      <input
        value={line}
        onChange={(e) => setLine(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={t('widget_quick_placeholder')}
        className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-[var(--color-text)]"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      />
      <button
        type="button"
        onClick={() => void submit()}
        className="shrink-0 rounded-lg bg-[var(--color-accent)] px-2 py-1 text-[11px] font-medium text-white"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {t('widget_quick_go')}
      </button>
    </div>
  );
}
