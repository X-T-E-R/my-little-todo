export type WorkThreadStatus =
  | 'running'
  | 'ready'
  | 'waiting'
  | 'blocked'
  | 'sleeping'
  | 'done'
  | 'archived';

export type WorkThreadLane =
  | 'general'
  | 'execution'
  | 'research'
  | 'infrastructure'
  | 'meta';

export type WorkThreadContextKind = 'stream' | 'task' | 'link' | 'note';

export interface WorkThreadContextItem {
  id: string;
  kind: WorkThreadContextKind;
  refId?: string;
  title: string;
  content?: string;
  addedAt: number;
}

export interface WorkThreadNextAction {
  id: string;
  text: string;
  done: boolean;
  source: 'user' | 'ai';
  linkedTaskId?: string;
  createdAt: number;
}

export interface WorkThreadResumeCard {
  summary: string;
  nextStep: string;
  guardrails: string[];
  waitingSummary?: string;
  updatedAt: number;
}

export interface WorkThreadWorkingSetItem {
  id: string;
  contextItemId: string;
  title: string;
  summary?: string;
  pinned?: boolean;
  createdAt: number;
}

export type WorkThreadWaitingKind = 'person' | 'tool' | 'file' | 'time' | 'external';

export interface WorkThreadWaitingCondition {
  id: string;
  kind: WorkThreadWaitingKind;
  title: string;
  detail?: string;
  dueAt?: number;
  satisfied: boolean;
  createdAt: number;
  updatedAt: number;
}

export type WorkThreadInterruptSource = 'stream' | 'task' | 'manual' | 'system';

export interface WorkThreadInterrupt {
  id: string;
  source: WorkThreadInterruptSource;
  title: string;
  content?: string;
  capturedAt: number;
  resolved: boolean;
}

export interface WorkThreadSchedulerMeta {
  lastActivatedAt?: number;
  lastCheckpointAt?: number;
  wakeReason?: string;
  snoozedUntil?: number;
}

export type WorkThreadSyncMode = 'internal' | 'hybrid';

export interface WorkThreadSyncMeta {
  mode: WorkThreadSyncMode;
  filePath?: string;
  lastExportedHash?: string;
  lastImportedAt?: number;
  lastExternalModifiedAt?: number;
}

export type WorkThreadSuggestionKind =
  | 'organize_context'
  | 'summarize_conclusion'
  | 'extract_next_steps';

export interface WorkThreadSuggestion {
  id: string;
  kind: WorkThreadSuggestionKind;
  title: string;
  content: string;
  createdAt: number;
  applied: boolean;
}

export type WorkThreadEventType =
  | 'created'
  | 'renamed'
  | 'context_added'
  | 'checkpoint_saved'
  | 'decision_recorded'
  | 'next_action_added'
  | 'ai_suggested'
  | 'ai_applied'
  | 'task_created'
  | 'task_linked'
  | 'status_changed'
  | 'resume_card_updated'
  | 'working_set_updated'
  | 'interrupt_captured'
  | 'waiting_updated'
  | 'thread_dispatched'
  | 'thread_resumed';

export interface WorkThreadEvent {
  id: string;
  threadId: string;
  type: WorkThreadEventType;
  actor: 'user' | 'ai' | 'system';
  title: string;
  detailMarkdown?: string;
  payload?: Record<string, unknown>;
  createdAt: number;
}

export interface WorkThread {
  id: string;
  title: string;
  mission: string;
  status: WorkThreadStatus;
  lane: WorkThreadLane;
  roleId?: string;
  docMarkdown: string;
  contextItems: WorkThreadContextItem[];
  nextActions: WorkThreadNextAction[];
  resumeCard: WorkThreadResumeCard;
  workingSet: WorkThreadWorkingSetItem[];
  waitingFor: WorkThreadWaitingCondition[];
  interrupts: WorkThreadInterrupt[];
  schedulerMeta: WorkThreadSchedulerMeta;
  syncMeta?: WorkThreadSyncMeta;
  suggestions?: WorkThreadSuggestion[];
  createdAt: number;
  updatedAt: number;
}

export type WorkThreadSchedulerPolicy = 'manual' | 'coach' | 'semi_auto';
