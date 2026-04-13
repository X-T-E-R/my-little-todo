import type { WindowContext, WindowContextMatchMode } from '../models/window-context.js';

export interface WindowContextDbRow {
  id: string;
  process_name: string | null;
  display_name: string | null;
  title_pattern: string | null;
  match_mode: string;
  role_ids: string;
  note: string;
  created_at: number;
  updated_at: number;
  last_matched_at: number | null;
}

export function windowContextFromDbRow(row: WindowContextDbRow): WindowContext {
  let roleIds: string[] = [];
  try {
    roleIds = JSON.parse(row.role_ids) as string[];
  } catch {
    roleIds = [];
  }
  return {
    id: row.id,
    processName: row.process_name ?? undefined,
    displayName: row.display_name ?? undefined,
    titlePattern: row.title_pattern ?? undefined,
    matchMode: row.match_mode as WindowContextMatchMode,
    roleIds,
    note: row.note,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lastMatchedAt: row.last_matched_at != null ? new Date(row.last_matched_at) : undefined,
  };
}

export function windowContextToDbRow(
  ctx: WindowContext,
): Omit<WindowContextDbRow, 'last_matched_at'> & { last_matched_at: number | null } {
  return {
    id: ctx.id,
    process_name: ctx.processName ?? null,
    display_name: ctx.displayName ?? null,
    title_pattern: ctx.titlePattern ?? null,
    match_mode: ctx.matchMode,
    role_ids: JSON.stringify(ctx.roleIds),
    note: ctx.note,
    created_at: ctx.createdAt.getTime(),
    updated_at: ctx.updatedAt.getTime(),
    last_matched_at: ctx.lastMatchedAt?.getTime() ?? null,
  };
}
