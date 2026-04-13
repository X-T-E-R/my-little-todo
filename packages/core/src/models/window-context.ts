/** How `titlePattern` is matched against the foreground window title. */
export type WindowContextMatchMode = 'exact' | 'contains' | 'regex';

/**
 * Maps a Windows foreground window (process + title) to one or more Roles and a free-form note.
 * Stored locally on Tauri (SQLite); not part of server sync.
 */
export interface WindowContext {
  id: string;
  /** e.g. `Code.exe` — optional; when set, process must match */
  processName?: string;
  /** Human-readable label for the app (e.g. from annotator panel). */
  displayName?: string;
  /** Matched against window title per `matchMode` */
  titlePattern?: string;
  matchMode: WindowContextMatchMode;
  /** Roles whose open tasks should surface when this context matches */
  roleIds: string[];
  /** Markdown note shown in context UI */
  note: string;
  createdAt: Date;
  updatedAt: Date;
  lastMatchedAt?: Date;
}
