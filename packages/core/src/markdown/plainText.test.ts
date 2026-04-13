import { describe, expect, it } from 'vitest';
import { countMarkdownText, markdownToPlainText } from './plainText.js';

describe('markdownToPlainText', () => {
  it('strips common markdown syntax while preserving readable text', () => {
    const markdown = `# Weekly note

- Finish **summary**
- Review [spec](https://example.com/spec)
- Check ![diagram](https://example.com/diagram.png)
- Link [[task:t1234567|Ref Task]]
`;

    expect(markdownToPlainText(markdown)).toBe(
      'Weekly note Finish summary Review spec Check diagram Link Ref Task',
    );
  });

  it('counts readable characters instead of raw markdown source', () => {
    expect(countMarkdownText('Hello **world**')).toBe(10);
    expect(countMarkdownText('中文 **加粗** [链接](https://example.com)')).toBe(6);
  });
});
