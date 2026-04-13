import type { Role } from '@my-little-todo/core';
import { ChevronDown } from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type WidgetRoleMode = 'auto' | 'all' | string;

interface WidgetRoleSelectProps {
  roles: Role[];
  value: WidgetRoleMode;
  onChange: (v: WidgetRoleMode) => void;
}

export function WidgetRoleSelect({ roles, value, onChange }: WidgetRoleSelectProps) {
  const { t } = useTranslation('widget');
  const [open, setOpen] = useState(false);

  const label = useMemo(() => {
    if (value === 'auto') return t('widget_filter_auto');
    if (value === 'all') return t('widget_filter_all');
    return roles.find((r) => r.id === value)?.name ?? t('widget_filter_all');
  }, [value, roles, t]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[140px] items-center gap-1 truncate rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-[11px] text-[var(--color-text)]"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <span className="truncate">{label}</span>
        <ChevronDown size={12} className="shrink-0 opacity-60" />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label={t('widget_close_role_menu')}
            onClick={() => setOpen(false)}
          />
          <ul className="absolute left-0 top-full z-20 mt-1 max-h-48 min-w-[160px] overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
            <li>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-[11px] hover:bg-[var(--color-bg)]"
                onClick={() => {
                  onChange('auto');
                  setOpen(false);
                }}
              >
                {t('widget_filter_auto')}
              </button>
            </li>
            <li>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-[11px] hover:bg-[var(--color-bg)]"
                onClick={() => {
                  onChange('all');
                  setOpen(false);
                }}
              >
                {t('widget_filter_all')}
              </button>
            </li>
            {roles.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left text-[11px] hover:bg-[var(--color-bg)]"
                  onClick={() => {
                    onChange(r.id);
                    setOpen(false);
                  }}
                >
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
