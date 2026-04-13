/** Think Session — 理一理：会话式思考文档（独立于 Task）。 */

export type ThinkSessionStartMode = 'blank' | 'discovery' | 'arrange';

export interface ExtractedAction {
  id: string;
  description: string;
  type: 'create_task' | 'update_priority' | 'postpone' | 'start_focus' | 'other';
  adopted: boolean;
  relatedTaskId?: string;
  /** For update_priority: suggested priority 0–1 */
  suggestedPriority?: number;
}

export interface ThinkSession {
  id: string;
  content: string;
  startMode: ThinkSessionStartMode;
  createdAt: number;
  updatedAt: number;
  extractedActions?: ExtractedAction[];
}
