import { PanelLeft, PanelRight, Rows3 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function WorkThreadEditorShell({
  title,
  onBackToBoard,
  onGoNow,
  materialSidebarOpen,
  runtimeSidebarOpen,
  onToggleMaterialSidebar,
  onToggleRuntimeSidebar,
  leftSidebar,
  centerTop,
  centerBody,
  rightSidebar,
  onDropMarkdown,
}: {
  title: string;
  onBackToBoard: () => void;
  onGoNow: () => void;
  materialSidebarOpen: boolean;
  runtimeSidebarOpen: boolean;
  onToggleMaterialSidebar: () => void;
  onToggleRuntimeSidebar: () => void;
  leftSidebar: ReactNode;
  centerTop: ReactNode;
  centerBody: ReactNode;
  rightSidebar: ReactNode;
  onDropMarkdown: (markdown: string) => void;
}) {
  const { t } = useTranslation('think');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="mb-3 flex flex-wrap items-center gap-2 px-3 pt-2">
        <button
          type="button"
          onClick={onBackToBoard}
          className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-[11px] font-medium"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          <Rows3 size={14} />
          {t('thread_shell_back_to_board')}
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onToggleMaterialSidebar}
          className="rounded-xl border p-2"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          aria-label={t('thread_shell_toggle_material_sidebar')}
        >
          <PanelLeft size={16} />
        </button>
        <button
          type="button"
          onClick={onToggleRuntimeSidebar}
          className="rounded-xl border p-2"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          aria-label={t('thread_shell_toggle_runtime_sidebar')}
        >
          <PanelRight size={16} />
        </button>
        <button
          type="button"
          onClick={onGoNow}
          className="rounded-xl border px-3 py-2 text-[11px] font-medium"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {t('thread_shell_go_now')}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3">
        {materialSidebarOpen ? (
          <aside
            className="hidden min-h-0 w-72 shrink-0 overflow-hidden rounded-[28px] border xl:flex"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          >
            {leftSidebar}
          </aside>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {centerTop}
          <section
            className="min-h-0 flex-1 rounded-[32px] border p-3 sm:p-4"
            style={{
              borderColor: 'var(--color-border)',
              background: 'color-mix(in srgb, var(--color-surface) 96%, var(--color-bg))',
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const markdown =
                event.dataTransfer.getData('application/x-mlt-markdown') ||
                event.dataTransfer.getData('text/plain');
              if (markdown) onDropMarkdown(markdown);
            }}
          >
            {centerBody}
          </section>
        </div>

        {runtimeSidebarOpen ? (
          <aside className="hidden min-h-0 w-[340px] shrink-0 overflow-y-auto xl:block">
            {rightSidebar}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
