import type { Task } from '@my-little-todo/core';
import { isOverdue } from '@my-little-todo/core';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScheduleBlock } from '../stores/scheduleStore';

const WEEKDAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  ddlTasks: Task[];
  plannedTasks: Task[];
  scheduleBlocks: ScheduleBlock[];
}

function buildCalendarDays(
  year: number,
  month: number,
  tasks: Task[],
  schedules: ScheduleBlock[],
): CalendarDay[] {
  const today = new Date();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const days: CalendarDay[] = [];

  const prevMonthDays = getDaysInMonth(year, month - 1);
  for (let i = firstDay - 1; i >= 0; i--) {
    const date = new Date(year, month - 1, prevMonthDays - i);
    days.push({
      date,
      isCurrentMonth: false,
      isToday: isSameDay(date, today),
      ddlTasks: [],
      plannedTasks: [],
      scheduleBlocks: [],
    });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const ddlTasks = tasks.filter(
      (t) => t.ddl && isSameDay(t.ddl, date) && t.status !== 'completed' && t.status !== 'archived',
    );
    const plannedTasks = tasks.filter(
      (t) =>
        t.plannedAt &&
        isSameDay(t.plannedAt, date) &&
        t.status !== 'completed' &&
        t.status !== 'archived' &&
        !ddlTasks.includes(t),
    );
    const dayOfWeek = date.getDay();
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const scheduleBlocks = schedules.filter(
      (s) =>
        s.daysOfWeek.includes(dayOfWeek) &&
        !s.exceptions.includes(dateStr) &&
        (!s.validFrom || date >= s.validFrom) &&
        (!s.validUntil || date <= s.validUntil),
    );

    days.push({
      date,
      isCurrentMonth: true,
      isToday: isSameDay(date, today),
      ddlTasks,
      plannedTasks,
      scheduleBlocks,
    });
  }

  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    const date = new Date(year, month + 1, d);
    days.push({
      date,
      isCurrentMonth: false,
      isToday: isSameDay(date, today),
      ddlTasks: [],
      plannedTasks: [],
      scheduleBlocks: [],
    });
  }

  return days;
}

export function CalendarView({
  tasks,
  schedules = [],
  onSelectTask,
}: {
  tasks: Task[];
  schedules?: ScheduleBlock[];
  onSelectTask: (id: string) => void;
}) {
  const { t } = useTranslation('calendar');
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const days = useMemo(
    () => buildCalendarDays(viewYear, viewMonth, tasks, schedules),
    [viewYear, viewMonth, tasks, schedules],
  );

  const goNext = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goToday = () => {
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDate(now);
  };

  const selectedDay = selectedDate
    ? days.find((d) => isSameDay(d.date, selectedDate))
    : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="rounded-lg p-1.5 transition-colors"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-sm font-bold min-w-[100px] text-center" style={{ color: 'var(--color-text)' }}>
            {t('{{year}}Y {{month}}M', { year: viewYear, month: viewMonth + 1 })}
          </h2>
          <button
            type="button"
            onClick={goNext}
            className="rounded-lg p-1.5 transition-colors"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <button
          type="button"
          onClick={goToday}
          className="rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors"
          style={{
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          {t('Today')}
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAY_KEYS.map((key) => (
          <div
            key={key}
            className="text-center text-[10px] font-semibold py-1"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            {t(key)}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px rounded-xl overflow-hidden" style={{ background: 'var(--color-border)' }}>
        {days.map((day) => {
          const hasItems = day.ddlTasks.length > 0 || day.plannedTasks.length > 0 || day.scheduleBlocks.length > 0;
          const isSelected = selectedDate && isSameDay(day.date, selectedDate);
          const hasOverdue = day.ddlTasks.some((t) => t.ddl && isOverdue(t.ddl));

          return (
            <button
              key={day.date.toISOString()}
              type="button"
              onClick={() => setSelectedDate(day.date)}
              className="relative flex flex-col items-center py-2 min-h-[56px] transition-colors"
              style={{
                background: isSelected
                  ? 'var(--color-accent-soft)'
                  : day.isToday
                    ? 'color-mix(in srgb, var(--color-accent) 5%, var(--color-surface))'
                    : 'var(--color-surface)',
                opacity: day.isCurrentMonth ? 1 : 0.4,
              }}
            >
              <span
                className={`text-[12px] font-medium ${day.isToday ? 'rounded-full w-6 h-6 flex items-center justify-center' : ''}`}
                style={{
                  color: isSelected
                    ? 'var(--color-accent)'
                    : day.isToday
                      ? 'white'
                      : 'var(--color-text)',
                  background: day.isToday && !isSelected ? 'var(--color-accent)' : undefined,
                }}
              >
                {day.date.getDate()}
              </span>
              {hasItems && (
                <div className="flex gap-0.5 mt-1">
                  {day.ddlTasks.length > 0 && (
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background: hasOverdue ? 'var(--color-danger)' : 'var(--color-warning)',
                      }}
                    />
                  )}
                  {day.plannedTasks.length > 0 && (
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: 'var(--color-accent)' }}
                    />
                  )}
                  {day.scheduleBlocks.length > 0 && (
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: 'var(--color-text-tertiary)' }}
                    />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected date detail */}
      <AnimatePresence>
        {selectedDay && (selectedDay.ddlTasks.length > 0 || selectedDay.plannedTasks.length > 0 || selectedDay.scheduleBlocks.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mt-4 rounded-xl p-4"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
            }}
          >
            <p className="text-xs font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
              {t('{{month}}M {{day}}D', { month: selectedDay.date.getMonth() + 1, day: selectedDay.date.getDate() })}
            </p>

            {selectedDay.scheduleBlocks.length > 0 && (
              <div className="mb-3 space-y-1">
                {selectedDay.scheduleBlocks.map((block) => (
                  <div
                    key={block.id}
                    className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[11px]"
                    style={{
                      background: `${block.color}20`,
                      borderLeft: `3px solid ${block.color}`,
                    }}
                  >
                    <span className="font-medium" style={{ color: block.color }}>
                      {block.startTime}-{block.endTime}
                    </span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{block.name}</span>
                    {block.location && (
                      <span style={{ color: 'var(--color-text-tertiary)' }}>@ {block.location}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {selectedDay.ddlTasks.length > 0 && (
              <div className="space-y-1 mb-2">
                <p className="text-[10px] font-medium" style={{ color: 'var(--color-warning)' }}>
                  {t('Due')}
                </p>
                {selectedDay.ddlTasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelectTask(t.id)}
                    className="w-full text-left flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-[var(--color-bg)]"
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        background: t.ddl && isOverdue(t.ddl) ? 'var(--color-danger)' : 'var(--color-warning)',
                      }}
                    />
                    <span className="text-[12px] truncate" style={{ color: 'var(--color-text)' }}>
                      {t.title}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {selectedDay.plannedTasks.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-medium" style={{ color: 'var(--color-accent)' }}>
                  {t('Planned')}
                </p>
                {selectedDay.plannedTasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelectTask(t.id)}
                    className="w-full text-left flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-[var(--color-bg)]"
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: 'var(--color-accent)' }}
                    />
                    <span className="text-[12px] truncate" style={{ color: 'var(--color-text)' }}>
                      {t.title}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
