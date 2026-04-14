function stripFenceBlocks(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, ' ');
}

function stripInlineCode(markdown: string): string {
  return markdown.replace(/`([^`]*)`/g, '$1');
}

function stripImages(markdown: string): string {
  return markdown.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
}

function stripLinks(markdown: string): string {
  return markdown.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function stripTaskRefs(markdown: string): string {
  return markdown.replace(/\[\[task:[^|\]]+\|([^\]]+)\]\]/gi, '$1');
}

function stripHtml(markdown: string): string {
  return markdown
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?(?:div|p|span|section|article|aside|main|header|footer|blockquote|li|ul|ol|h[1-6])[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function stripFormatting(markdown: string): string {
  return markdown
    .replace(/^>\s?/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1');
}

export function markdownToPlainText(markdown: string): string {
  return stripFormatting(
    stripHtml(stripTaskRefs(stripLinks(stripImages(stripInlineCode(stripFenceBlocks(markdown)))))),
  )
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countMarkdownText(markdown: string): number {
  const plainText = markdownToPlainText(markdown);
  return Array.from(plainText.replace(/\s+/g, '')).length;
}
