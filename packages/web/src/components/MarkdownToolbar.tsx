import {
  Bold,
  ChevronDown,
  Code,
  Eraser,
  Hash,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Highlighter,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  SquareCode,
  Strikethrough,
  Table,
  Underline,
} from 'lucide-react';
import { type RefObject, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  clearFormat,
  insertLink,
  insertMarkdown,
  insertTable,
  setHeading,
} from '../utils/markdownInsert';

interface MarkdownToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

type TFn = (key: string) => string;

interface ToolButton {
  icon: React.FC<{ size?: number }>;
  labelKey: string;
  shortcut?: string;
  action: (textarea: HTMLTextAreaElement, t: TFn) => void;
}

const INLINE_TOOLS: ToolButton[] = [
  {
    icon: Bold,
    labelKey: 'Bold',
    shortcut: 'Ctrl+B',
    action: (ta, t) => insertMarkdown(ta, { prefix: '**', suffix: '**', defaultContent: t('Bold') }),
  },
  {
    icon: Italic,
    labelKey: 'Italic',
    shortcut: 'Ctrl+I',
    action: (ta, t) => insertMarkdown(ta, { prefix: '*', suffix: '*', defaultContent: t('Italic') }),
  },
  {
    icon: Strikethrough,
    labelKey: 'Strikethrough',
    shortcut: 'Alt+Shift+5',
    action: (ta, t) => insertMarkdown(ta, { prefix: '~~', suffix: '~~', defaultContent: t('Strikethrough') }),
  },
  {
    icon: Underline,
    labelKey: 'Underline',
    shortcut: 'Ctrl+U',
    action: (ta, t) => insertMarkdown(ta, { prefix: '<u>', suffix: '</u>', defaultContent: t('Underline') }),
  },
  {
    icon: Code,
    labelKey: 'Inline code',
    shortcut: 'Ctrl+Shift+`',
    action: (ta) => insertMarkdown(ta, { prefix: '`', suffix: '`', defaultContent: 'code' }),
  },
  {
    icon: Highlighter,
    labelKey: 'Highlight',
    action: (ta, t) => insertMarkdown(ta, { prefix: '==', suffix: '==', defaultContent: t('Highlight') }),
  },
  {
    icon: Eraser,
    labelKey: 'Clear format',
    shortcut: 'Ctrl+\\',
    action: (ta) => clearFormat(ta),
  },
];

const BLOCK_TOOLS: ToolButton[] = [
  {
    icon: Quote,
    labelKey: 'Quote',
    shortcut: 'Ctrl+Shift+Q',
    action: (ta) => insertMarkdown(ta, { prefix: '> ', blockLevel: true }),
  },
  {
    icon: List,
    labelKey: 'Unordered list',
    shortcut: 'Ctrl+Shift+]',
    action: (ta) => insertMarkdown(ta, { prefix: '- ', blockLevel: true }),
  },
  {
    icon: ListOrdered,
    labelKey: 'Ordered list',
    shortcut: 'Ctrl+Shift+[',
    action: (ta) => insertMarkdown(ta, { prefix: '1. ', blockLevel: true }),
  },
  {
    icon: ListChecks,
    labelKey: 'Checkbox',
    action: (ta) => insertMarkdown(ta, { prefix: '- [ ] ', blockLevel: true }),
  },
  {
    icon: SquareCode,
    labelKey: 'Code block',
    shortcut: 'Ctrl+Shift+K',
    action: (ta) =>
      insertMarkdown(ta, {
        prefix: '```\n',
        suffix: '\n```',
        blockLevel: false,
        defaultContent: '',
      }),
  },
  {
    icon: Table,
    labelKey: 'Table',
    shortcut: 'Ctrl+T',
    action: (ta) => insertTable(ta),
  },
  {
    icon: Link2,
    labelKey: 'Link',
    shortcut: 'Ctrl+K',
    action: (ta) => insertLink(ta),
  },
  {
    icon: Minus,
    labelKey: 'Divider',
    action: (ta) => insertMarkdown(ta, { prefix: '\n---\n', blockLevel: false }),
  },
  {
    icon: Hash,
    labelKey: 'Tag',
    action: (ta) => {
      const pos = ta.selectionStart;
      const before = ta.value.slice(0, pos);
      const needSpace = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n');
      insertMarkdown(ta, { prefix: needSpace ? ' #' : '#' });
    },
  },
];

function HeadingDropdown({ textareaRef }: { textareaRef: RefObject<HTMLTextAreaElement | null> }) {
  const { t } = useTranslation('editor');
  const [open, setOpen] = useState(false);
  const headings = [
    { level: 1, icon: Heading1, labelKey: 'Heading 1', shortcut: 'Ctrl+1' },
    { level: 2, icon: Heading2, labelKey: 'Heading 2', shortcut: 'Ctrl+2' },
    { level: 3, icon: Heading3, labelKey: 'Heading 3', shortcut: 'Ctrl+3' },
    { level: 4, icon: Heading4, labelKey: 'Heading 4', shortcut: 'Ctrl+4' },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-0.5 rounded-md px-1.5 py-1 transition-colors hover:bg-[var(--color-surface)]"
        style={{ color: 'var(--color-text-tertiary)' }}
        title={t('Heading')}
      >
        <Heading1 size={15} />
        <ChevronDown size={10} />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
            }}
            role="button"
            tabIndex={0}
            aria-label={t('Close')}
          />
          <div
            className="absolute left-0 top-full z-40 mt-1 rounded-lg py-1 shadow-lg"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              minWidth: '140px',
            }}
          >
            {headings.map((h) => (
              <button
                key={h.level}
                type="button"
                onClick={() => {
                  if (textareaRef.current) setHeading(textareaRef.current, h.level);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--color-bg)]"
                style={{ color: 'var(--color-text)' }}
              >
                <h.icon size={14} />
                <span className="flex-1">{t(h.labelKey)}</span>
                <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {h.shortcut}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function MarkdownToolbar({ textareaRef }: MarkdownToolbarProps) {
  const { t } = useTranslation('editor');

  const handleAction = (action: (textarea: HTMLTextAreaElement, t: TFn) => void) => {
    if (textareaRef.current) action(textareaRef.current, t);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 px-1"
      style={{ borderTop: '1px solid color-mix(in srgb, var(--color-border) 50%, transparent)' }}
    >
      {/* Inline formatting */}
      {INLINE_TOOLS.map((tool) => (
        <button
          key={tool.labelKey}
          type="button"
          onClick={() => handleAction(tool.action)}
          className="shrink-0 rounded-md p-1 transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
          style={{ color: 'var(--color-text-tertiary)' }}
          title={`${t(tool.labelKey)}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
        >
          <tool.icon size={15} />
        </button>
      ))}

      <div className="mx-0.5 h-4 w-px" style={{ background: 'var(--color-border)' }} />

      {/* Heading dropdown */}
      <HeadingDropdown textareaRef={textareaRef} />

      {/* Block-level tools */}
      {BLOCK_TOOLS.map((tool) => (
        <button
          key={tool.labelKey}
          type="button"
          onClick={() => handleAction(tool.action)}
          className="shrink-0 rounded-md p-1 transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
          style={{ color: 'var(--color-text-tertiary)' }}
          title={`${t(tool.labelKey)}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
        >
          <tool.icon size={15} />
        </button>
      ))}
    </div>
  );
}
