import type { MarkdownSlashCommand } from '../RichMarkdownEditor';

export function getWorkThreadSlashCommands(): MarkdownSlashCommand[] {
  return [
    {
      id: 'mission',
      title: '/mission',
      description: '任务块别名，用来写线程里的 mission。',
      keywords: ['mission', 'goal', 'project'],
    },
    {
      id: 'task',
      title: '/task',
      description: '明确动作或步骤。',
      keywords: ['task', 'todo', 'action'],
    },
    {
      id: 'spark',
      title: '/spark',
      description: '保留分支想法或待发散材料。',
      keywords: ['spark', 'idea', 'branch'],
    },
    {
      id: 'log',
      title: '/log',
      description: '线程内记录，可再提升到 Stream.log。',
      keywords: ['log', 'note', 'capture'],
    },
  ];
}

export function WorkThreadInlineMenu({
  onOpenCommand,
}: {
  onOpenCommand: (commandId: string) => void;
}) {
  const commands = getWorkThreadSlashCommands();

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2"
      style={{
        borderColor: 'var(--color-border)',
        background: 'color-mix(in srgb, var(--color-surface) 94%, var(--color-bg))',
      }}
    >
      <span className="text-[11px] font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>
        插入块
      </span>
      {commands.map((command) => (
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
        结构化块走 callout 语法
      </span>
    </div>
  );
}
