import { marked } from 'marked';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveFileHostUrl } from '../fileHost/urlResolver';

marked.setOptions({
  breaks: true,
  gfm: true,
});

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export function MarkdownPreview({ content, className = '' }: MarkdownPreviewProps) {
  const { t } = useTranslation('editor');
  const rootRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    if (!content.trim())
      return `<p style="color: var(--color-text-tertiary)">${t('No content')}</p>`;
    return marked.parse(content, { async: false }) as string;
  }, [content, t]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const nodes = root.querySelectorAll<HTMLImageElement | HTMLAnchorElement>('img, a');
    for (const node of nodes) {
      const attr = node instanceof HTMLImageElement ? 'src' : 'href';
      const value = node.getAttribute(attr);
      if (!value?.startsWith('blob://')) continue;
      void resolveFileHostUrl(value).then((resolved) => {
        if (root.contains(node)) {
          node.setAttribute(attr, resolved);
        }
      });
    }
  }, [html]);

  return (
    <div
      ref={rootRef}
      className={`markdown-preview max-w-none ${className}`}
      style={{ color: 'var(--color-text)' }}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: safe markdown render
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
