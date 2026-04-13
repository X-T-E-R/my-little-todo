export interface Attachment {
  type: 'image' | 'link' | 'file';
  url: string;
  title?: string;
  id?: string;
  provider?: 'local-files' | 'mlt-server' | 'webdav';
  category?: 'image' | 'document' | 'video' | 'audio' | 'archive' | 'other';
  mimeType?: string;
  size?: number;
}

export type StreamEntryType = 'spark' | 'task' | 'log';

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
