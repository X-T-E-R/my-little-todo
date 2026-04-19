import {
  buildWorkThreadBlockSnippet,
  type WorkThreadBlockSnippet,
} from './workThreadDocSyntax';

export type WorkThreadSlashCommandId =
  | 'intent'
  | 'spark'
  | 'next-action'
  | 'block';

export type WorkThreadSlashInsertion = WorkThreadBlockSnippet;

export interface WorkThreadSlashInsertionOptions {
  blockTitlePlaceholder?: string;
}

export function buildWorkThreadSlashInsertion(
  commandId: string,
  _options?: WorkThreadSlashInsertionOptions,
): WorkThreadSlashInsertion | null {
  return buildWorkThreadBlockSnippet(commandId as WorkThreadSlashCommandId);
}
