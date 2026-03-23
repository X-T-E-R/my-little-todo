export function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

/** HH:MM:SS for stream file storage (ensures uniqueness at second level). */
export function formatTimeStorage(date: Date): string {
  return date.toTimeString().slice(0, 8);
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function daysUntil(target: Date, from: Date = new Date()): number {
  const diff = target.getTime() - from.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function daysBetween(a: Date, b: Date): number {
  return Math.abs(daysUntil(a, b));
}

export function isOverdue(ddl: Date, now: Date = new Date()): boolean {
  return ddl.getTime() < now.getTime();
}
