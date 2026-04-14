import type { MarkdownSlashCommand } from '../RichMarkdownEditor';
import { useTranslation } from 'react-i18next';

export function getWorkThreadSlashCommands(t: (key: string) => string): MarkdownSlashCommand[] {
  return [
    {
      id: 'next-action',
      title: t('thread_slash_next_action_title'),
      description: t('thread_slash_next_action_description'),
      keywords: ['todo', 'step', 'action'],
    },
    {
      id: 'waiting',
      title: t('thread_slash_waiting_title'),
      description: t('thread_slash_waiting_description'),
      keywords: ['blocked', 'dependency', 'wait'],
    },
    {
      id: 'interrupt',
      title: t('thread_slash_interrupt_title'),
      description: t('thread_slash_interrupt_description'),
      keywords: ['distraction', 'interrupt'],
    },
    {
      id: 'note-context',
      title: t('thread_slash_note_title'),
      description: t('thread_slash_note_description'),
      keywords: ['context', 'note'],
    },
    {
      id: 'link-context',
      title: t('thread_slash_link_title'),
      description: t('thread_slash_link_description'),
      keywords: ['url', 'reference', 'link'],
    },
    {
      id: 'checkpoint',
      title: t('thread_slash_checkpoint_title'),
      description: t('thread_slash_checkpoint_description'),
      keywords: ['resume', 'save'],
    },
  ];
}

export function WorkThreadInlineMenu({
  onOpenCommand,
}: {
  onOpenCommand: (commandId: string) => void;
}) {
  const { t } = useTranslation('think');
  const commands = getWorkThreadSlashCommands(t);

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
      {commands.slice(0, 4).map((command) => (
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
