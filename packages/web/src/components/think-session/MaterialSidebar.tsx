import type { StreamEntry, Task } from '@my-little-todo/core';
import { ChevronDown, FileText, FolderKanban, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStreamStore, useTaskStore } from '../../stores';
import {
  type MaterialSidebarItem,
  buildMaterialSidebarSections,
} from '../../utils/materialSidebarModel';
import { formatTaskRefMarkdown } from '../../utils/taskRefs';
import { MaterialSidebarContextMenu } from './MaterialSidebarContextMenu';

type SidebarContextState = {
  x: number;
  y: number;
  item: MaterialSidebarItem;
} | null;

function formatStreamMarkdown(entry: StreamEntry): string {
  const compact = entry.content.replace(/\s+/g, ' ').trim();
  return compact ? `> ${compact}\n` : '';
}

function draggableMarkdown(item: MaterialSidebarItem): string {
  if (item.kind === 'stream' && item.streamEntry) {
    return formatStreamMarkdown(item.streamEntry);
  }
  if (item.task) {
    return formatTaskRefMarkdown(item.task);
  }
  return item.title;
}

export function MaterialSidebar({
  currentRoleId,
  onInsertMarkdown,
  onOpenTask,
  onCreateThreadFromTask,
  onAddTaskToWorkingSet,
  onAddStreamToThread,
}: {
  currentRoleId: string | null;
  onInsertMarkdown: (markdown: string) => void;
  onOpenTask?: (taskId: string) => void;
  onCreateThreadFromTask?: (task: Task) => void;
  onAddTaskToWorkingSet?: (task: Task) => void;
  onAddStreamToThread?: (entry: StreamEntry) => void;
}) {
  const { t } = useTranslation('think');
  const tasks = useTaskStore((s) => s.tasks);
  const streamEntries = useStreamStore((s) => s.entries);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<SidebarContextState>(null);

  const sections = useMemo(
    () =>
      buildMaterialSidebarSections({
        tasks,
        streamEntries,
        currentRoleId,
        query,
      }),
    [currentRoleId, query, streamEntries, tasks],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg)]">
      <div className="shrink-0 border-b border-[var(--color-border)] p-2">
        <div
          className="flex items-center gap-2 rounded-xl px-2 py-1.5"
          style={{ background: 'var(--color-surface)' }}
        >
          <Search size={14} className="shrink-0 opacity-50" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('sidebar_search_placeholder')}
            className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
            style={{ color: 'var(--color-text)' }}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 py-2 text-[11px]">
        {sections.map((section) => {
          const isCollapsed = collapsed[section.id] ?? false;
          return (
            <section key={section.id}>
              <button
                type="button"
                onClick={() =>
                  setCollapsed((state) => ({ ...state, [section.id]: !isCollapsed }))
                }
                className="mb-1.5 flex w-full items-center justify-between rounded-lg px-1 py-1 text-left font-semibold uppercase tracking-wide opacity-70"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <span>{t(`material_section_${section.id}`)}</span>
                <ChevronDown
                  size={12}
                  style={{ transform: isCollapsed ? 'rotate(-90deg)' : undefined }}
                />
              </button>
              {!isCollapsed && (
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        draggable
                        onDragStart={(event) => {
                          const markdown = draggableMarkdown(item);
                          event.dataTransfer.setData('text/plain', markdown);
                          event.dataTransfer.setData('application/x-mlt-markdown', markdown);
                        }}
                        onClick={() => onInsertMarkdown(draggableMarkdown(item))}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setContextMenu({
                            x: event.clientX,
                            y: event.clientY,
                            item,
                          });
                        }}
                        className="w-full rounded-xl border px-2.5 py-2 text-left transition-colors hover:bg-[var(--color-surface)]"
                        style={{
                          borderColor: 'var(--color-border)',
                          background: 'color-mix(in srgb, var(--color-surface) 84%, var(--color-bg))',
                          color: 'var(--color-text)',
                        }}
                      >
                        <div className="flex items-start gap-2">
                          {item.kind === 'stream' ? (
                            <FileText size={14} className="mt-0.5 shrink-0 opacity-60" />
                          ) : (
                            <FolderKanban size={14} className="mt-0.5 shrink-0 opacity-60" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="line-clamp-2 font-medium">{item.title}</div>
                            {item.subtitle ? (
                              <div
                                className="mt-0.5 line-clamp-2 text-[10px]"
                                style={{ color: 'var(--color-text-tertiary)' }}
                              >
                                {item.subtitle}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}

        {sections.length === 0 ? (
          <div
            className="rounded-xl border border-dashed px-3 py-4 text-center"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}
          >
            {t('material_sidebar_empty')}
          </div>
        ) : null}
      </div>

      {contextMenu ? (
        <MaterialSidebarContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          actions={[
            {
              id: 'insert',
              label: t('material_action_insert'),
              icon: 'insert',
              onSelect: () => onInsertMarkdown(draggableMarkdown(contextMenu.item)),
            },
            ...(contextMenu.item.task && onOpenTask
              ? [
                  {
                    id: 'open',
                    label: t('material_action_open_task'),
                    icon: 'open' as const,
                    onSelect: () => onOpenTask(contextMenu.item.task?.id ?? ''),
                  },
                ]
              : []),
            ...(contextMenu.item.task && onCreateThreadFromTask
              ? [
                  {
                    id: 'thread',
                    label: t('material_action_create_thread'),
                    icon: 'thread' as const,
                    onSelect: () => onCreateThreadFromTask(contextMenu.item.task as Task),
                  },
                ]
              : []),
            ...(contextMenu.item.task && onAddTaskToWorkingSet
              ? [
                  {
                    id: 'pin',
                    label: t('material_action_add_working_set'),
                    icon: 'pin' as const,
                    onSelect: () => onAddTaskToWorkingSet(contextMenu.item.task as Task),
                  },
                ]
              : []),
            ...(contextMenu.item.streamEntry && onAddStreamToThread
              ? [
                  {
                    id: 'pin-stream',
                    label: t('material_action_add_thread_context'),
                    icon: 'pin' as const,
                    onSelect: () => onAddStreamToThread(contextMenu.item.streamEntry as StreamEntry),
                  },
                ]
              : []),
          ]}
        />
      ) : null}
    </div>
  );
}
