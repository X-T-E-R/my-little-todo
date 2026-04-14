import type { MarkdownSlashCommand } from '../RichMarkdownEditor';
import { useTranslation } from 'react-i18next';

export const WORK_THREAD_SLASH_COMMANDS: MarkdownSlashCommand[] = [
  {
    id: 'next-action',
    title: 'Next action',
    description: 'Add a concrete next step for this thread',
    keywords: ['todo', 'step', 'action'],
  },
  {
    id: 'waiting',
    title: 'Waiting condition',
    description: 'Capture what this thread is waiting on',
    keywords: ['blocked', 'dependency', 'wait'],
  },
  {
    id: 'interrupt',
    title: 'Interrupt',
    description: 'Record a new interrupt without losing context',
    keywords: ['distraction', 'interrupt'],
  },
  {
    id: 'note-context',
    title: 'Pinned note',
    description: 'Add a short note into the thread context',
    keywords: ['context', 'note'],
  },
  {
    id: 'link-context',
    title: 'Link context',
    description: 'Attach a URL to the working context',
    keywords: ['url', 'reference', 'link'],
  },
  {
    id: 'checkpoint',
    title: 'Checkpoint',
    description: 'Save a resume checkpoint right now',
    keywords: ['resume', 'save'],
  },
];

export function WorkThreadInlineMenu({
  onOpenCommand,
}: {
  onOpenCommand: (commandId: string) => void;
}) {
  const { t } = useTranslation('think');

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2"
      style={{
        borderColor: 'var(--color-border)',
        background: 'color-mix(in srgb, var(--color-surface) 94%, var(--color-bg))',
      }}
    >
      <span className="text-[11px] font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>
        {t('thread_inline_menu_label')}
      </span>
      {WORK_THREAD_SLASH_COMMANDS.slice(0, 4).map((command) => (
        <button
          key={command.id}
          type="button"
          onClick={() => onOpenCommand(command.id)}
          className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
          style={{
            borderColor: 'var(--color-border)',
            background: 'var(--color-bg)',
            color: 'var(--color-text-secondary)',
          }}
        >
          {command.title}
        </button>
      ))}
      <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
        {t('thread_inline_task_ref_hint')}
      </span>
    </div>
  );
}
