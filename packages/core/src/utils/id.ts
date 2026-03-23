/**
 * Generate a time-based ID with a given prefix.
 * Format: `{prefix}-{YYYYMMDD}-{HHMMSSmmm}`
 */
export function generateId(prefix: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 23).replace(/[:\.]/g, '');
  return `${prefix}-${date}-${time}`;
}

export function streamEntryId(): string {
  return generateId('se');
}

export function taskId(): string {
  return generateId('t');
}

export function behaviorEventId(): string {
  return generateId('be');
}

export function stepId(): string {
  return generateId('st');
}
