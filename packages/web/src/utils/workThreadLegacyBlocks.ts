function normalizeLineBreaks(markdown: string): string {
  return markdown.replace(/\r\n/g, '\n').replace(/<br\s*\/?>/gi, '\n');
}

export function normalizeLegacyWorkThreadBlocks(
  markdown: string,
  labels?: {
    waitingHeading?: string;
    interruptHeading?: string;
  },
): string {
  const lines = normalizeLineBreaks(markdown).split('\n');
  const normalizedLines: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const currentLine = lines[i] ?? '';
    const waitingMatch = /^> \[!waiting:([^\]]+)\] (.+)$/i.exec(currentLine.trim());
    const interruptMatch = /^> \[!interrupt:([^\]]+)\] (.+)$/i.exec(currentLine.trim());

    if (!waitingMatch && !interruptMatch) {
      normalizedLines.push(currentLine);
      i += 1;
      continue;
    }

    const type = waitingMatch ? 'waiting' : 'interrupt';
    const kind = (waitingMatch?.[1] ?? interruptMatch?.[1] ?? '').trim().toLowerCase();
    const title = (waitingMatch?.[2] ?? interruptMatch?.[2] ?? '').trim();
    const detailLines: string[] = [];
    let j = i + 1;
    while (j < lines.length) {
      const detailLine = lines[j] ?? '';
      if (!detailLine.startsWith('> ')) break;
      detailLines.push(detailLine.slice(2));
      j += 1;
    }

    normalizedLines.push(
      `### ${
        type === 'waiting'
          ? labels?.waitingHeading ?? 'Waiting'
          : labels?.interruptHeading ?? 'Interrupt'
      } · ${kind}: ${title}`,
    );
    normalizedLines.push('');
    if (detailLines.length > 0) {
      normalizedLines.push(detailLines.join('\n').trim());
    }

    i = j;
  }

  return normalizedLines.join('\n');
}
