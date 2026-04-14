export type WorkThreadSlashCommandId =
  | 'next-action'
  | 'waiting'
  | 'interrupt'
  | 'note-context'
  | 'link-context'
  | 'checkpoint';

export interface WorkThreadSlashInsertion {
  markdown: string;
  selectionStart: number;
  selectionEnd: number;
  selectionText?: string;
  shouldSaveCheckpoint?: boolean;
}

export interface WorkThreadSlashInsertionOptions {
  checkpointLabel?: string;
  waitingHeading?: string;
  interruptHeading?: string;
  waitingTitlePlaceholder?: string;
  waitingDetailPlaceholder?: string;
  interruptTitlePlaceholder?: string;
  interruptDetailPlaceholder?: string;
  noteTitlePlaceholder?: string;
  noteBodyPlaceholder?: string;
  linkTitlePlaceholder?: string;
  linkUrlPlaceholder?: string;
  checkpointResumePlaceholder?: string;
  checkpointNextPlaceholder?: string;
}

function buildSelection(markdown: string, target?: string): Pick<WorkThreadSlashInsertion, 'selectionStart' | 'selectionEnd'> {
  if (!target) {
    return {
      selectionStart: markdown.length,
      selectionEnd: markdown.length,
    };
  }

  const start = markdown.indexOf(target);
  if (start < 0) {
    return {
      selectionStart: markdown.length,
      selectionEnd: markdown.length,
    };
  }

  return {
    selectionStart: start,
    selectionEnd: start + target.length,
  };
}

export function buildWorkThreadSlashInsertion(
  commandId: string,
  options?: WorkThreadSlashInsertionOptions,
): WorkThreadSlashInsertion | null {
  if (commandId === 'next-action') {
    const markdown = '- [ ] ';
    return {
      markdown,
      selectionStart: markdown.length,
      selectionEnd: markdown.length,
    };
  }

  if (commandId === 'waiting') {
    const titlePlaceholder = options?.waitingTitlePlaceholder ?? 'title';
    const markdown = `### ${options?.waitingHeading ?? 'Waiting'} · external: ${titlePlaceholder}\n\n${
      options?.waitingDetailPlaceholder ?? 'detail'
    }`;
    return {
      markdown,
      ...buildSelection(markdown, titlePlaceholder),
      selectionText: titlePlaceholder,
    };
  }

  if (commandId === 'interrupt') {
    const titlePlaceholder = options?.interruptTitlePlaceholder ?? 'title';
    const markdown = `### ${options?.interruptHeading ?? 'Interrupt'} · manual: ${titlePlaceholder}\n\n${
      options?.interruptDetailPlaceholder ?? 'detail'
    }`;
    return {
      markdown,
      ...buildSelection(markdown, titlePlaceholder),
      selectionText: titlePlaceholder,
    };
  }

  if (commandId === 'note-context') {
    const titlePlaceholder = options?.noteTitlePlaceholder ?? 'title';
    const markdown = `### ${titlePlaceholder}\n\n${options?.noteBodyPlaceholder ?? 'body'}`;
    return {
      markdown,
      ...buildSelection(markdown, titlePlaceholder),
      selectionText: titlePlaceholder,
    };
  }

  if (commandId === 'link-context') {
    const titlePlaceholder = options?.linkTitlePlaceholder ?? 'title';
    const markdown = `[${titlePlaceholder}](${options?.linkUrlPlaceholder ?? 'url'})`;
    return {
      markdown,
      ...buildSelection(markdown, titlePlaceholder),
      selectionText: titlePlaceholder,
    };
  }

  if (commandId === 'checkpoint') {
    const label = options?.checkpointLabel ?? new Date().toLocaleString();
    const resumePlaceholder = options?.checkpointResumePlaceholder ?? 'title';
    const markdown = `## Checkpoint\n\n- Saved at ${label}\n- Resume from: ${resumePlaceholder}\n- Next: ${
      options?.checkpointNextPlaceholder ?? 'detail'
    }\n`;
    return {
      markdown,
      ...buildSelection(markdown, resumePlaceholder),
      selectionText: resumePlaceholder,
      shouldSaveCheckpoint: true,
    };
  }

  return null;
}
