export type WorkThreadStatus = 'active' | 'paused' | 'done';

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
  | 'status_changed';

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
  status: WorkThreadStatus;
  roleId?: string;
  docMarkdown: string;
  contextItems: WorkThreadContextItem[];
  nextActions: WorkThreadNextAction[];
  suggestions?: WorkThreadSuggestion[];
  createdAt: number;
  updatedAt: number;
}
