import { LOCAL_DESKTOP_USER_ID } from './localUser';
import { SCHEMA_VERSION } from './sqliteSchema';

export const DESKTOP_HOST_COMPATIBILITY_COLUMNS = {
  tasks: ['user_id'],
  stream_entries: ['user_id'],
  settings: ['user_id'],
  blobs: ['owner'],
} as const;

export type DesktopHostCompatibilityTable = keyof typeof DESKTOP_HOST_COMPATIBILITY_COLUMNS;

export type DesktopHostCompatibilityColumnsByTable = Partial<
  Record<DesktopHostCompatibilityTable, readonly string[]>
>;

export const DESKTOP_HOST_COMPATIBILITY_ALTERS = [
  `ALTER TABLE tasks ADD COLUMN user_id TEXT NOT NULL DEFAULT '${LOCAL_DESKTOP_USER_ID}'`,
  `ALTER TABLE stream_entries ADD COLUMN user_id TEXT NOT NULL DEFAULT '${LOCAL_DESKTOP_USER_ID}'`,
  `ALTER TABLE settings ADD COLUMN user_id TEXT NOT NULL DEFAULT '${LOCAL_DESKTOP_USER_ID}'`,
  `ALTER TABLE blobs ADD COLUMN owner TEXT NOT NULL DEFAULT '${LOCAL_DESKTOP_USER_ID}'`,
] as const;

export function findMissingDesktopHostColumns(
  columnsByTable: DesktopHostCompatibilityColumnsByTable,
): string[] {
  const missing: string[] = [];

  for (const [table, requiredColumns] of Object.entries(DESKTOP_HOST_COMPATIBILITY_COLUMNS) as [
    DesktopHostCompatibilityTable,
    readonly string[],
  ][]) {
    const actualColumns = new Set((columnsByTable[table] ?? []).map((column) => column.trim()));
    for (const column of requiredColumns) {
      if (!actualColumns.has(column)) {
        missing.push(`${table}.${column}`);
      }
    }
  }

  return missing;
}

export function needsDesktopHostCompatibilityRepair(
  recordedVersion: number,
  missingColumns: readonly string[],
): boolean {
  return recordedVersion < SCHEMA_VERSION || missingColumns.length > 0;
}

export function formatDesktopHostCompatibilityRepairMessage(
  recordedVersion: number,
  missingColumns: readonly string[],
): string {
  if (missingColumns.length === 0) {
    return `[SQLite schema] Applying desktop host compatibility migration up to v${SCHEMA_VERSION} from recorded schema_version=${recordedVersion}.`;
  }

  return `[SQLite schema] Repairing desktop host compatibility drift: schema_version=${recordedVersion}, missing columns=${missingColumns.join(', ')}.`;
}
