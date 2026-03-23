export type AIToolName =
  | 'extract_task'
  | 'classify_role'
  | 'split_task'
  | 'recommend_task'
  | 'generate_review'
  | 'triage_inbox';

export type AIOperationStatus = 'pending' | 'applied' | 'rejected' | 'modified' | 'reverted';

export interface AIOperationChange {
  table: string;
  recordId: string;
  field: string;
  before: unknown;
  after: unknown;
}

export interface AIUserAction {
  type: 'accept' | 'reject' | 'modify';
  timestamp: Date;
  modifications?: Record<string, unknown>;
}

export interface AIOperation {
  id: string;
  timestamp: Date;
  tool: AIToolName;
  trigger: 'user' | 'auto';
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  confidence: number;
  status: AIOperationStatus;
  appliedChanges: AIOperationChange[];
  userAction?: AIUserAction;
}
