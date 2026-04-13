import { Calendar, Clock, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface SmartDatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  label: string;
  accent?: string;
}

interface QuickOption {
  label: string;
  getDate: () => Date;
}

function getNextMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(9, 0, 0, 0);
  return d;
}

const QUICK_OPTIONS: QuickOption[] = [
  {
    label: 'In 1 hour',
    getDate: () => new Date(Date.now() + 60 * 60 * 1000),
  },
  {
    label: 'Tonight',
    getDate: () => {
      const d = new Date();
      d.setHours(20, 0, 0, 0);
      if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
      return d;
    },
  },
  {
    label: 'Tomorrow',
    getDate: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    label: 'In 3 days',
    getDate: () => {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    label: 'Next Monday',
    getDate: getNextMonday,
  },
  {
    label: 'Next week',
    getDate: () => {
      const d = getNextMonday();
      d.setDate(d.getDate() + 4);
      d.setHours(18, 0, 0, 0);
      return d;
    },
  },
];

function toLocalDateTimeString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const FULL_WEEKDAY_KEYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function formatSmartDate(
  date: Date,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffH = Math.round(diffMs / (1000 * 60 * 60));
  const diffD = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const pad = (n: number) => n.toString().padStart(2, '0');
  const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  if (diffH >= 0 && diffH < 24) {
    return t('Today {{time}}', { time: timeStr });
  }
  if (diffD === 1) {
    return t('Tomorrow {{time}}', { time: timeStr });
  }
  if (diffD > 1 && diffD <= 7) {
    return `${t(FULL_WEEKDAY_KEYS[date.getDay()] ?? FULL_WEEKDAY_KEYS[0])} ${timeStr}`;
  }
  return `${date.getMonth() + 1}/${date.getDate()} ${timeStr}`;
}

export function SmartDatePicker({ value, onChange, label, accent }: SmartDatePickerProps) {
  const { t } = useTranslation('calendar');
  const [showCustom, setShowCustom] = useState(false);
  const accentColor = accent ?? 'var(--color-accent)';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span
          className="flex items-center gap-1 text-xs font-medium"
          style={{ color: accentColor }}
        >
          <Clock size={12} />
          {label}
        </span>
        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] transition-colors hover:bg-[var(--color-bg)]"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <X size={10} />
            {t('Clear')}
          </button>
        )}
      </div>

      {value && (
        <div
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium"
          style={{ background: `${accentColor}15`, color: accentColor }}
        >
          <Calendar size={12} />
          {formatSmartDate(value, t)}
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {QUICK_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => {
              onChange(opt.getDate());
              setShowCustom(false);
            }}
            className="rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {t(opt.label)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCustom(!showCustom)}
          className="rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
          style={{
            background: showCustom ? `${accentColor}15` : 'var(--color-bg)',
            border: showCustom ? `1px solid ${accentColor}` : '1px solid var(--color-border)',
            color: showCustom ? accentColor : 'var(--color-text-secondary)',
          }}
        >
          {t('Custom...')}
        </button>
      </div>

      {showCustom && (
        <input
          type="datetime-local"
          value={value ? toLocalDateTimeString(value) : ''}
          onChange={(e) => {
            if (e.target.value) onChange(new Date(e.target.value));
          }}
          className="w-full rounded-lg px-2 py-1.5 text-xs outline-none"
          style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
          }}
        />
      )}
    </div>
  );
}
