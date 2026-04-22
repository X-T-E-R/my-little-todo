const SQLITE_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

function normalizeSqliteDatetime(text: string): string {
  if (SQLITE_DATETIME_RE.test(text)) {
    return `${text.replace(' ', 'T')}Z`;
  }
  return text;
}

export function parseSqliteTimestamp(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const text = String(value).trim();
  if (!text) return null;

  const numeric = Number(text);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  const parsed = Date.parse(normalizeSqliteDatetime(text));
  return Number.isFinite(parsed) ? parsed : null;
}

export function requireSqliteTimestamp(value: unknown, fallback = 0): number {
  return parseSqliteTimestamp(value) ?? fallback;
}
