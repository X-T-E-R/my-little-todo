import type { Attachment } from './stream.js';

export type TaskStatus = 'inbox' | 'active' | 'today' | 'completed' | 'archived';

export type DdlType = 'hard' | 'commitment' | 'soft';

export interface Submission {
  timestamp: Date;
  note: string;
  attachment?: Attachment;
  onTime: boolean;
  daysLate?: number;
}

export interface Postponement {
  timestamp: Date;
  fromDate: Date;
  toDate: Date;
  reason: string;
}

export interface TaskResource {
  type: 'link' | 'file' | 'note';
  url?: string;
  title: string;
  addedAt: Date;
}

export interface TaskReminder {
  id: string;
  time: Date;
  notified: boolean;
  label?: string;
}

export interface StatusChange {
  from: TaskStatus;
  to: TaskStatus;
  timestamp: Date;
}

/** Multi-step progress for ADHD-friendly execution coaching (orthogonal to TaskStatus). */
export type TaskPhase = 'understood' | 'exploring' | 'working' | 'core_done' | 'wrapping_up';

export type ProgressLogSource = 'manual' | 'focus_notes' | 'stream';

export interface ProgressLog {
  id: string;
  timestamp: Date;
  content: string;
  source: ProgressLogSource;
}

/** Optional Kanban column placement (Board planning view). */
export type KanbanColumn = 'ideas' | 'planned' | 'doing' | 'finishing' | 'done_recent';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;

  ddl?: Date;
  ddlType?: DdlType;
  /** When the user intends to work on this (implementation intention). */
  plannedAt?: Date;

  roleId?: string;
  tags: string[];
  /** AI-computed internal score, not directly shown to user. */
  priority?: number;

  /** Free-form markdown content: notes, checklists, anything. */
  body: string;
  /** IDs of child Task objects that are subtasks of this task. */
  subtaskIds: string[];
  /** If this task is a subtask, points to the parent task ID. */
  parentId?: string;

  sourceStreamId?: string;

  promoted?: boolean;

  resources: TaskResource[];
  reminders: TaskReminder[];
  submissions: Submission[];
  postponements: Postponement[];
  statusHistory: StatusChange[];

  /** Optional multi-step phase (endowed default: understood on create). */
  phase?: TaskPhase;
  /** Short progress notes; focus session notes may append here. */
  progressLogs?: ProgressLog[];
  /** Board Kanban column override; when absent, derived from status/phase. */
  kanbanColumn?: KanbanColumn;
}
