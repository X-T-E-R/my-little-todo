import { marked } from 'marked';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

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

  const html = useMemo(() => {
    if (!content.trim()) return `<p style="color: var(--color-text-tertiary)">${t('No content')}</p>`;
    return marked.parse(content, { async: false }) as string;
  }, [content, t]);

  return (
    <div
      className={`markdown-preview prose prose-sm max-w-none ${className}`}
      style={{ color: 'var(--color-text)' }}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: safe markdown render
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
