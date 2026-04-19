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
  parentThreadId?: string;
  parentIntentId?: string;
  parentSparkId?: string;
  linkedTaskId?: string;
  createdAt: number;
}

export type WorkThreadIntentState = 'active' | 'parked' | 'done' | 'archived';

export interface WorkThreadIntent {
  id: string;
  text: string;
  detail?: string;
  bodyMarkdown?: string;
  collapsed?: boolean;
  parentThreadId?: string;
  parentIntentId?: string;
  parentSparkId?: string;
  state: WorkThreadIntentState;
  linkedSparkId?: string;
  linkedTaskId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkThreadSparkContainer {
  id: string;
  title: string;
  bodyMarkdown: string;
  collapsed: boolean;
  parentThreadId: string;
  parentIntentId?: string;
  parentSparkId?: string;
  streamEntryId?: string;
  linkedTaskId?: string;
  promotedThreadId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkThreadResumeCard {
  summary: string;
  nextStep: string;
  guardrails: string[];
  blockSummary?: string;
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
  parentThreadId?: string;
  parentIntentId?: string;
  parentSparkId?: string;
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
  parentThreadId?: string;
  parentIntentId?: string;
  parentSparkId?: string;
  capturedAt: number;
  resolved: boolean;
}

export type WorkThreadBlockSourceKind = 'waiting' | 'interrupt';
export type WorkThreadBlockState = 'open' | 'cleared';

export interface WorkThreadBlockView {
  id: string;
  title: string;
  detail?: string;
  state: WorkThreadBlockState;
  sourceKind?: WorkThreadBlockSourceKind;
  createdAt: number;
  updatedAt: number;
}

export interface WorkThreadSchedulerMeta {
  lastActivatedAt?: number;
  lastCheckpointAt?: number;
  wakeReason?: string;
  snoozedUntil?: number;
}

export type WorkThreadExplorationAnchorKind = 'markdown_range' | 'spark_ref';

export interface WorkThreadExplorationAnchor {
  kind: WorkThreadExplorationAnchorKind;
  refId?: string;
  startOffset?: number;
  endOffset?: number;
}

export interface WorkThreadExplorationBlock {
  id: string;
  title: string;
  summary?: string;
  anchor: WorkThreadExplorationAnchor;
  collapsed: boolean;
  createdAt: number;
  updatedAt: number;
}

export type WorkThreadInlineAnchorKind =
  | 'intent'
  | 'next'
  | 'spark'
  | 'block'
  | 'waiting'
  | 'interrupt'
  | 'checkpoint'
  | 'exploration';

export interface WorkThreadInlineAnchor {
  id: string;
  kind: WorkThreadInlineAnchorKind;
  marker: string;
  refId?: string;
  createdAt: number;
  updatedAt: number;
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
  | 'raw_capture_added'
  | 'intent_added'
  | 'intent_updated'
  | 'intent_archived'
  | 'intent_promoted'
  | 'spark_captured'
  | 'spark_linked'
  | 'spark_promoted'
  | 'spark_tasked'
  | 'exploration_block_created'
  | 'exploration_block_updated'
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
  rootMarkdown: string;
  explorationMarkdown: string;
  docMarkdown: string;
  contextItems: WorkThreadContextItem[];
  intents: WorkThreadIntent[];
  sparkContainers: WorkThreadSparkContainer[];
  nextActions: WorkThreadNextAction[];
  resumeCard: WorkThreadResumeCard;
  workingSet: WorkThreadWorkingSetItem[];
  waitingFor: WorkThreadWaitingCondition[];
  interrupts: WorkThreadInterrupt[];
  explorationBlocks: WorkThreadExplorationBlock[];
  inlineAnchors: WorkThreadInlineAnchor[];
  schedulerMeta: WorkThreadSchedulerMeta;
  syncMeta?: WorkThreadSyncMeta;
  suggestions?: WorkThreadSuggestion[];
  createdAt: number;
  updatedAt: number;
}

export type WorkThreadSchedulerPolicy = 'manual' | 'coach' | 'semi_auto';
