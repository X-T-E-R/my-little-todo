import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStreamStore } from '../../stores';

interface WidgetCaptureProps {
  /** Primary role for new entries when set */
  primaryRoleId?: string;
  onSubmitted?: () => void;
}

export function WidgetCapture({ primaryRoleId, onSubmitted }: WidgetCaptureProps) {
  const { t } = useTranslation('widget');
  const addEntry = useStreamStore((s) => s.addEntry);
  const [text, setText] = useState('');

  const submit = async () => {
    const line = text.trim();
    if (!line) return;
    await addEntry(line, true, { roleId: primaryRoleId });
    setText('');
    onSubmitted?.();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-1">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('widget_capture_placeholder')}
        className="min-h-[120px] flex-1 resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-xs text-[var(--color-text)]"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <button
        type="button"
        onClick={() => void submit()}
        className="mt-2 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white"
      >
        {t('widget_capture_submit')}
      </button>
    </div>
  );
}
