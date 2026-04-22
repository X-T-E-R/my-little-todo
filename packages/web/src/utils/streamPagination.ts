const DAY_MS = 86400000;

export const DEFAULT_STREAM_PAGE_SIZE = 6;
export const MIN_STREAM_PAGE_SIZE = 1;
export const MAX_STREAM_PAGE_SIZE = 50;
export const STREAM_HISTORY_FETCH_STEP_DAYS = 14;
export const STREAM_PAGE_SIZE_SETTING_KEY = 'stream-page-size';

function parseDateKey(dateKey: string | null | undefined): Date | null {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [year, month, day] = dateKey.split('-').map((value) => Number.parseInt(value, 10));
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function clampStreamPageSize(
  value: number | string | null | undefined,
  fallback = DEFAULT_STREAM_PAGE_SIZE,
): number {
  const raw =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(MAX_STREAM_PAGE_SIZE, Math.max(MIN_STREAM_PAGE_SIZE, Math.trunc(raw)));
}

export function sliceVisibleStreamEntries<T>(entries: T[], visibleCount: number): T[] {
  if (visibleCount <= 0) return [];
  return entries.slice(0, visibleCount);
}

export function getRequiredDaysToReachDateKey(
  dateKey: string | null,
  now = new Date(),
): number | null {
  const target = parseDateKey(dateKey);
  if (!target) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diffDays = Math.floor((today.getTime() - targetDay.getTime()) / DAY_MS);
  return Math.max(1, diffDays + 1);
}

export function getNextStreamWindowDays(
  currentDaysLoaded: number,
  oldestAvailableDateKey: string | null,
  now = new Date(),
  stepDays = STREAM_HISTORY_FETCH_STEP_DAYS,
): number | null {
  const requiredDays = getRequiredDaysToReachDateKey(oldestAvailableDateKey, now);
  if (requiredDays == null || currentDaysLoaded >= requiredDays) return null;
  return Math.min(requiredDays, currentDaysLoaded + stepDays);
}
