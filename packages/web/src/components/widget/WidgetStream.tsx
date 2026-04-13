import type { StreamEntry } from '@my-little-todo/core';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface WidgetStreamProps {
  entries: StreamEntry[];
}

function firstLine(content: string): string {
  const line = content.split(/\r?\n/)[0]?.trim() ?? '';
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

export function WidgetStream({ entries }: WidgetStreamProps) {
  const { t } = useTranslation('widget');
  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 10);
  }, [entries]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-1">
      <ul className="space-y-2">
        {sorted.map((e) => (
          <li
            key={e.id}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[11px] text-[var(--color-text)]"
          >
            <p className="line-clamp-3">{firstLine(e.content)}</p>
            <p className="mt-0.5 text-[10px] text-[var(--color-text-tertiary)]">
              {e.timestamp.toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </li>
        ))}
      </ul>
      {sorted.length === 0 && (
        <p className="py-6 text-center text-[11px] text-[var(--color-text-tertiary)]">
          {t('widget_stream_empty')}
        </p>
      )}
    </div>
  );
}
