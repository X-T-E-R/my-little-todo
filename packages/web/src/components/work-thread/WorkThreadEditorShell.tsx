import { PanelLeft, PanelRight, Rows3, X } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
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
  const [isLargeLayout, setIsLargeLayout] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 1024px)').matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const updateLayout = () => setIsLargeLayout(mediaQuery.matches);
    updateLayout();
    mediaQuery.addEventListener('change', updateLayout);
    return () => mediaQuery.removeEventListener('change', updateLayout);
  }, []);

  const activeDrawer = useMemo<'left' | 'right' | null>(() => {
    if (isLargeLayout) return null;
    if (runtimeSidebarOpen) return 'right';
    if (materialSidebarOpen) return 'left';
    return null;
  }, [isLargeLayout, materialSidebarOpen, runtimeSidebarOpen]);

  const closeActiveDrawer = () => {
    if (activeDrawer === 'left' && materialSidebarOpen) {
      onToggleMaterialSidebar();
      return;
    }
    if (activeDrawer === 'right' && runtimeSidebarOpen) {
      onToggleRuntimeSidebar();
    }
  };

  useEffect(() => {
    if (!activeDrawer) return;
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeActiveDrawer();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [activeDrawer]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header
        className="flex flex-wrap items-center gap-2 border-b px-4 py-3"
        style={{ borderColor: 'var(--color-border)' }}
      >
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

      <div className="flex min-h-0 flex-1">
        {isLargeLayout && materialSidebarOpen ? (
          <aside
            className="min-h-0 w-72 shrink-0 overflow-hidden border-r"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          >
            {leftSidebar}
          </aside>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {centerTop}
          <section
            className="min-h-0 flex-1 overflow-hidden"
            style={{
              background: 'var(--color-surface)',
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

        {isLargeLayout && runtimeSidebarOpen ? (
          <aside
            className="min-h-0 w-[320px] shrink-0 overflow-y-auto border-l"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          >
            {rightSidebar}
          </aside>
        ) : null}
      </div>

      {!isLargeLayout && activeDrawer ? (
        <div className="fixed inset-0 z-[80] lg:hidden" role="presentation">
          <button
            type="button"
            aria-label={t('thread_shell_close_drawer')}
            onClick={closeActiveDrawer}
            className="absolute inset-0 bg-black/35"
          />
          <aside
            className={`absolute inset-y-0 ${
              activeDrawer === 'left' ? 'left-0' : 'right-0'
            } flex w-screen max-w-[28rem] flex-col ${
              activeDrawer === 'left' ? 'border-r' : 'border-l'
            }`}
            style={{
              background: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
            }}
          >
            <div
              className="flex items-center justify-between gap-3 border-b px-4 py-3"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                {activeDrawer === 'left'
                  ? t('thread_shell_material_drawer_title')
                  : t('thread_shell_runtime_drawer_title')}
              </div>
              <button
                type="button"
                onClick={closeActiveDrawer}
                className="rounded-xl border p-2"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-secondary)',
                }}
                aria-label={t('thread_shell_close_drawer')}
              >
                <X size={14} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {activeDrawer === 'left' ? leftSidebar : rightSidebar}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
