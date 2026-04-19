import type { MarkdownSlashCommand } from '../RichMarkdownEditor';
import { useTranslation } from 'react-i18next';

export function getWorkThreadSlashCommands(t: (key: string) => string): MarkdownSlashCommand[] {
  return [
    {
      id: 'intent',
      title: t('thread_slash_intent_title'),
      description: t('thread_slash_intent_description'),
      keywords: ['intent', 'plan', 'direction'],
    },
    {
      id: 'spark',
      title: t('thread_slash_spark_title'),
      description: t('thread_slash_spark_description'),
      keywords: ['spark', 'idea', 'branch'],
    },
    {
      id: 'next-action',
      title: t('thread_slash_next_action_title'),
      description: t('thread_slash_next_action_description'),
      keywords: ['todo', 'step', 'action'],
    },
    {
      id: 'block',
      title: t('thread_slash_block_title'),
      description: t('thread_slash_block_description'),
      keywords: ['block', 'stuck', 'blocked'],
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
