/**
 * Markdown insertion helpers for textarea elements.
 * Handles wrapping selections with prefixes/suffixes, block-level formatting,
 * and cursor positioning after insertion.
 */

import i18n from '../locales';

export interface InsertOptions {
  prefix: string;
  suffix?: string;
  /** If true, operates on whole lines (adds newlines if needed). */
  blockLevel?: boolean;
  /** For block insertions, the default content if nothing is selected. */
  defaultContent?: string;
}

/**
 * Insert markdown formatting around the current selection in a textarea.
 * If text is selected, wraps it. If nothing is selected, inserts at cursor.
 * Returns the new cursor position or selection range.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: formatting logic requires many branches
export function insertMarkdown(textarea: HTMLTextAreaElement, opts: InsertOptions): void {
  const { prefix, suffix = '', blockLevel = false, defaultContent = '' } = opts;
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const selected = value.slice(start, end);

  let replacement: string;
  let cursorStart: number;
  let cursorEnd: number;

  if (blockLevel) {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', end);
    const actualLineEnd = lineEnd === -1 ? value.length : lineEnd;
    const currentLine = value.slice(lineStart, actualLineEnd);

    if (currentLine.startsWith(prefix)) {
      // Toggle off: remove prefix
      const newLine = currentLine.slice(prefix.length);
      textarea.setSelectionRange(lineStart, actualLineEnd);
      document.execCommand('insertText', false, newLine);
      cursorStart = cursorEnd = lineStart + newLine.length;
    } else {
      const content = selected || currentLine || defaultContent;
      const needsNewlineBefore = lineStart > 0 && !value.charAt(lineStart - 1)?.match(/\n/);
      const pre = needsNewlineBefore ? '\n' : '';
      replacement = `${pre}${prefix}${content}${suffix}`;

      if (selected || currentLine) {
        textarea.setSelectionRange(lineStart, actualLineEnd);
      } else {
        textarea.setSelectionRange(start, end);
      }
      document.execCommand('insertText', false, replacement);
      cursorStart = lineStart + pre.length + prefix.length;
      cursorEnd = cursorStart + content.length;
    }
  } else {
    // Inline: check if already wrapped — toggle off
    const beforePrefix = value.slice(Math.max(0, start - prefix.length), start);
    const afterSuffix = value.slice(end, end + suffix.length);

    if (beforePrefix === prefix && afterSuffix === suffix && selected.length > 0) {
      textarea.setSelectionRange(start - prefix.length, end + suffix.length);
      document.execCommand('insertText', false, selected);
      cursorStart = start - prefix.length;
      cursorEnd = cursorStart + selected.length;
    } else {
      const content = selected || defaultContent;
      replacement = `${prefix}${content}${suffix}`;
      document.execCommand('insertText', false, replacement);

      if (selected) {
        cursorStart = start + prefix.length;
        cursorEnd = cursorStart + selected.length;
      } else if (defaultContent) {
        cursorStart = start + prefix.length;
        cursorEnd = cursorStart + defaultContent.length;
      } else {
        cursorStart = cursorEnd = start + prefix.length;
      }
    }
  }

  textarea.setSelectionRange(cursorStart, cursorEnd);
  textarea.focus();

  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Insert a markdown table at the cursor position.
 */
export function insertTable(textarea: HTMLTextAreaElement, rows = 3, cols = 3): void {
  const header = `| ${Array(cols).fill(i18n.t('markdown.Header', { ns: 'common' })).join(' | ')} |`;
  const separator = `| ${Array(cols).fill('---').join(' | ')} |`;
  const dataRows = Array(rows - 1)
    .fill(`| ${Array(cols).fill('   ').join(' | ')} |`)
    .join('\n');

  const table = `\n${header}\n${separator}\n${dataRows}\n`;

  const { selectionStart: start } = textarea;
  textarea.focus();
  document.execCommand('insertText', false, table);

  const firstCellPos = start + 1 + 2; // after \n|<space>
  textarea.setSelectionRange(firstCellPos, firstCellPos + 2);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Insert a link at the cursor position. If text is selected, uses it as the link text.
 */
export function insertLink(textarea: HTMLTextAreaElement): void {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const selected = value.slice(start, end);

  if (selected) {
    const replacement = `[${selected}](url)`;
    document.execCommand('insertText', false, replacement);
    const urlStart = start + selected.length + 3;
    textarea.setSelectionRange(urlStart, urlStart + 3);
  } else {
    const linkText = i18n.t('markdown.Link text', { ns: 'common' });
    const replacement = `[${linkText}](url)`;
    document.execCommand('insertText', false, replacement);
    const textStart = start + 1;
    textarea.setSelectionRange(textStart, textStart + linkText.length);
  }

  textarea.focus();
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Set a heading level for the current line, toggling if already set.
 */
export function setHeading(textarea: HTMLTextAreaElement, level: number): void {
  const { value, selectionStart: start } = textarea;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = value.indexOf('\n', start);
  const actualLineEnd = lineEnd === -1 ? value.length : lineEnd;
  const currentLine = value.slice(lineStart, actualLineEnd);

  const headingMatch = currentLine.match(/^(#{1,6})\s/);
  const targetPrefix = `${'#'.repeat(level)} `;

  textarea.setSelectionRange(lineStart, actualLineEnd);

  if (headingMatch) {
    const stripped = currentLine.slice(headingMatch[0].length);
    if (headingMatch[1].length === level) {
      document.execCommand('insertText', false, stripped);
    } else {
      document.execCommand('insertText', false, `${targetPrefix}${stripped}`);
    }
  } else {
    document.execCommand('insertText', false, `${targetPrefix}${currentLine}`);
  }

  textarea.focus();
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Clear formatting from the current selection or line.
 */
export function clearFormat(textarea: HTMLTextAreaElement): void {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const selected = value.slice(start, end);
  if (!selected) return;

  let cleaned = selected;
  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
  cleaned = cleaned.replace(/~~(.+?)~~/g, '$1');
  cleaned = cleaned.replace(/<u>(.+?)<\/u>/g, '$1');
  cleaned = cleaned.replace(/`(.+?)`/g, '$1');
  cleaned = cleaned.replace(/==(.+?)==/g, '$1');

  if (cleaned !== selected) {
    document.execCommand('insertText', false, cleaned);
    textarea.setSelectionRange(start, start + cleaned.length);
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
