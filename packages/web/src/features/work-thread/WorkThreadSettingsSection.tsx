import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSetting, putSetting } from '../../storage/settingsApi';
import { useWorkThreadStore } from '../../stores';
import {
  WORK_THREAD_MARKDOWN_AUTO_IMPORT_KEY,
  WORK_THREAD_MARKDOWN_SYNC_ENABLED_KEY,
  WORK_THREAD_MARKDOWN_SYNC_ROOT_KEY,
} from '../../utils/workThreadSync';
import {
  MATERIAL_SIDEBAR_DEFAULT_OPEN_KEY,
  NOW_DEFAULT_VIEW_KEY,
  NOW_SHOW_AUTO_VIEW_KEY,
  type NowViewMode,
  type RuntimeSidebarDefault,
  THREAD_OPEN_MODE_KEY,
  THREAD_RUNTIME_SIDEBAR_DEFAULT_KEY,
  type ThreadOpenMode,
} from '../../utils/workThreadUiPrefs';

type SchedulerPolicy = 'manual' | 'coach' | 'semi_auto';

const POLICY_OPTIONS: SchedulerPolicy[] = ['manual', 'coach', 'semi_auto'];

export function WorkThreadSettingsSection() {
  const { t } = useTranslation(['settings', 'think']);
  const loadSchedulerPolicy = useWorkThreadStore((s) => s.loadSchedulerPolicy);
  const setSchedulerPolicy = useWorkThreadStore((s) => s.setSchedulerPolicy);
  const [policy, setPolicy] = useState<SchedulerPolicy>('coach');
  const [nowDefaultView, setNowDefaultView] = useState<NowViewMode>('task');
  const [showAutoView, setShowAutoView] = useState(true);
  const [threadOpenMode, setThreadOpenMode] = useState<ThreadOpenMode>('resume-last');
  const [runtimeSidebarDefault, setRuntimeSidebarDefault] =
    useState<RuntimeSidebarDefault>('remember');
  const [materialSidebarDefaultOpen, setMaterialSidebarDefaultOpen] = useState(true);
  const [markdownSyncEnabled, setMarkdownSyncEnabled] = useState(false);
  const [markdownSyncRoot, setMarkdownSyncRoot] = useState('');
  const [markdownAutoImport, setMarkdownAutoImport] = useState(true);

  useEffect(() => {
    void loadSchedulerPolicy().then((value) => {
      setPolicy(value);
    });
    void Promise.all([
      getSetting(NOW_DEFAULT_VIEW_KEY),
      getSetting(NOW_SHOW_AUTO_VIEW_KEY),
      getSetting(THREAD_OPEN_MODE_KEY),
      getSetting(THREAD_RUNTIME_SIDEBAR_DEFAULT_KEY),
      getSetting(MATERIAL_SIDEBAR_DEFAULT_OPEN_KEY),
      getSetting(WORK_THREAD_MARKDOWN_SYNC_ENABLED_KEY),
      getSetting(WORK_THREAD_MARKDOWN_SYNC_ROOT_KEY),
      getSetting(WORK_THREAD_MARKDOWN_AUTO_IMPORT_KEY),
    ]).then(
      ([
        view,
        autoView,
        openMode,
        runtimeDefault,
        materialOpen,
        syncEnabled,
        syncRoot,
        autoImport,
      ]) => {
        setNowDefaultView(view === 'thread' || view === 'auto' ? view : 'task');
        setShowAutoView(autoView !== 'false');
        setThreadOpenMode(openMode === 'board-first' ? 'board-first' : 'resume-last');
        setRuntimeSidebarDefault(
          runtimeDefault === 'open' || runtimeDefault === 'closed' ? runtimeDefault : 'remember',
        );
        setMaterialSidebarDefaultOpen(materialOpen !== 'false');
        setMarkdownSyncEnabled(syncEnabled === 'true');
        setMarkdownSyncRoot(syncRoot ?? '');
        setMarkdownAutoImport(autoImport !== 'false');
      },
    );
  }, [loadSchedulerPolicy]);

  return (
    <section
      className="rounded-2xl border p-4"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
    >
      <h3 className="text-sm font-semibold text-[var(--color-text)]">
        {t('work_thread_settings_title')}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
        {t('work_thread_settings_intro')}
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">
            {t('work_thread_settings_scheduler_label')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {POLICY_OPTIONS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setPolicy(item);
                  void setSchedulerPolicy(item);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: policy === item ? 'var(--color-accent-soft)' : 'var(--color-bg)',
                  color: policy === item ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  border: `1px solid ${policy === item ? 'var(--color-accent)' : 'var(--color-border)'}`,
                }}
              >
                {t(`thread_scheduler_policy_${item}`, { ns: 'think' })}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-tertiary)]">
            {t(`work_thread_settings_policy_hint_${policy}`)}
          </p>
        </div>

        <div>
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">
            {t('work_thread_settings_now_default_view')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['task', 'thread', 'auto'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setNowDefaultView(item);
                  void putSetting(NOW_DEFAULT_VIEW_KEY, item);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background:
                    nowDefaultView === item ? 'var(--color-accent-soft)' : 'var(--color-bg)',
                  color:
                    nowDefaultView === item ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  border: `1px solid ${
                    nowDefaultView === item ? 'var(--color-accent)' : 'var(--color-border)'
                  }`,
                }}
              >
                {t(`work_thread_settings_now_view_${item}`)}
              </button>
            ))}
          </div>
        </div>

        <div
          className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
        >
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">
              {t('work_thread_settings_show_auto_title')}
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
              {t('work_thread_settings_show_auto_hint')}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={showAutoView}
            onClick={() => {
              const next = !showAutoView;
              setShowAutoView(next);
              void putSetting(NOW_SHOW_AUTO_VIEW_KEY, next ? 'true' : 'false');
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              showAutoView ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
            }`}
          >
            <span
              className={`inline-block h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform ${
                showAutoView ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div>
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">
            {t('work_thread_settings_thread_open_mode')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ['resume-last', t('work_thread_settings_thread_open_resume_last')],
                ['board-first', t('work_thread_settings_thread_open_board_first')],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setThreadOpenMode(id);
                  void putSetting(THREAD_OPEN_MODE_KEY, id);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background:
                    threadOpenMode === id ? 'var(--color-accent-soft)' : 'var(--color-bg)',
                  color:
                    threadOpenMode === id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  border: `1px solid ${threadOpenMode === id ? 'var(--color-accent)' : 'var(--color-border)'}`,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">
            {t('work_thread_settings_runtime_sidebar_default')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ['remember', t('work_thread_settings_runtime_sidebar_remember')],
                ['open', t('work_thread_settings_runtime_sidebar_open')],
                ['closed', t('work_thread_settings_runtime_sidebar_closed')],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setRuntimeSidebarDefault(id);
                  void putSetting(THREAD_RUNTIME_SIDEBAR_DEFAULT_KEY, id);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background:
                    runtimeSidebarDefault === id ? 'var(--color-accent-soft)' : 'var(--color-bg)',
                  color:
                    runtimeSidebarDefault === id
                      ? 'var(--color-accent)'
                      : 'var(--color-text-secondary)',
                  border: `1px solid ${
                    runtimeSidebarDefault === id ? 'var(--color-accent)' : 'var(--color-border)'
                  }`,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div
          className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
        >
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">
              {t('work_thread_settings_material_sidebar_title')}
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
              {t('work_thread_settings_material_sidebar_hint')}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={materialSidebarDefaultOpen}
            onClick={() => {
              const next = !materialSidebarDefaultOpen;
              setMaterialSidebarDefaultOpen(next);
              void putSetting(MATERIAL_SIDEBAR_DEFAULT_OPEN_KEY, next ? 'true' : 'false');
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              materialSidebarDefaultOpen ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
            }`}
          >
            <span
              className={`inline-block h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform ${
                materialSidebarDefaultOpen ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div
          className="rounded-2xl border px-4 py-3"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">
                {t('work_thread_settings_markdown_sync_title')}
              </p>
              <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
                {t('work_thread_settings_markdown_sync_hint')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={markdownSyncEnabled}
              onClick={() => {
                const next = !markdownSyncEnabled;
                setMarkdownSyncEnabled(next);
                void putSetting(WORK_THREAD_MARKDOWN_SYNC_ENABLED_KEY, next ? 'true' : 'false');
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                markdownSyncEnabled ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
              }`}
            >
              <span
                className={`inline-block h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform ${
                  markdownSyncEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-xs font-medium text-[var(--color-text-secondary)]">
                {t('work_thread_settings_markdown_root_label')}
              </p>
              <input
                value={markdownSyncRoot}
                onChange={(event) => setMarkdownSyncRoot(event.target.value)}
                onBlur={() =>
                  void putSetting(WORK_THREAD_MARKDOWN_SYNC_ROOT_KEY, markdownSyncRoot.trim())
                }
                placeholder={t('work_thread_settings_markdown_root_placeholder')}
                className="mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">
                  {t('work_thread_settings_auto_import_title')}
                </p>
                <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
                  {t('work_thread_settings_auto_import_hint')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={markdownAutoImport}
                onClick={() => {
                  const next = !markdownAutoImport;
                  setMarkdownAutoImport(next);
                  void putSetting(WORK_THREAD_MARKDOWN_AUTO_IMPORT_KEY, next ? 'true' : 'false');
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  markdownAutoImport ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
                }`}
              >
                <span
                  className={`inline-block h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform ${
                    markdownAutoImport ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
