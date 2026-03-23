export interface Attachment {
  type: 'image' | 'link' | 'file';
  url: string;
  title?: string;
}

export type StreamEntryType = 'spark' | 'task';

export interface StreamEntry {
  id: string;
  content: string;
  timestamp: Date;
  tags: string[];
  attachments: Attachment[];
  extractedTaskId?: string;
  roleId?: string;
  /** 'spark' = default inspiration note, 'task' = promoted to task */
  entryType: StreamEntryType;
}
