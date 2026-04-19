import {
  collectProjectSubtree,
  countMarkdownText,
  daysUntil,
  displayTaskTitle,
  formatTime,
  isOverdue,
} from '@my-little-todo/core';
import type { StreamEntry, StreamEntryType } from '@my-little-todo/core';
import type { Task } from '@my-little-todo/core';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUpCircle,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Dices,
  Filter,
  FolderKanban,
  ListPlus,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Search,
  Send,
  Sparkles,
  Tag,
  Trash2,
  UserCircle,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useOpenAiChat } from '../ai/useOpenAiChat';
import { AdvancedFilterPanel } from '../components/AdvancedFilterPanel';
import { ContextMenu } from '../components/ContextMenu';
import { DndReparentProvider, DndTaskWrapper } from '../components/DndReparentContext';
import { MarkdownPreview } from '../components/MarkdownPreview';
import { OnboardingTip } from '../components/OnboardingTip';
import { ParentTaskPicker } from '../components/ParentTaskPicker';
import {
  RichMarkdownEditor,
  type RichMarkdownEditorHandle,
} from '../components/RichMarkdownEditor';
import { useFileHostUpload } from '../fileHost/useFileHostUpload';
import { RolePill } from '../components/RolePickerPopover';
import { StreamContextPanel } from '../components/StreamContextPanel';
import { ThinkSessionView } from '../components/ThinkSessionView';
import { useModuleStore } from '../modules';
import { getSetting } from '../storage/settingsApi';
import { pickTimeCapsuleEntry } from '../storage/streamRepo';
import {
  applyAdvancedFilter,
  countConditions,
  filterByRole,
  formatDdlLabel,
  groupEntriesByDate,
  useRoleStore,
  useStreamFilterStore,
  useStreamStore,
  useThinkSessionStore,
  useWorkThreadStore,
} from '../stores';
import { useNowOverrideStore, useTaskStore } from '../stores';
import { useToastStore } from '../stores/toastStore';
import { ENTRY_TYPE_KEYS, ENTRY_TYPE_META } from '../utils/entryTypeUtils';
import { useIsMobile } from '../utils/useIsMobile';

/* ── Subtask preview inside EntryCard ── */

function SubtaskPreview({ linkedTask }: { linkedTask: Task }) {
  const { t } = useTranslation('stream');
  const tasks = useTaskStore((s) => s.tasks);
  const subtaskIds = linkedTask.subtaskIds ?? [];
  if (subtaskIds.length === 0) return null;

  const subtasks = subtaskIds
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is Task => t !== undefined);

  const visible = subtasks.slice(0, 3);
  const remaining = subtasks.length - visible.length;

  return (
    <div className="mt-1.5 space-y-0.5">
      {visible.map((sub) => {
        const done = sub.status === 'completed';
        return (
          <div key={sub.id} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="flex h-3 w-3 shrink-0 items-center justify-center rounded border"
              style={{
                borderColor: done ? 'var(--color-success)' : 'var(--color-border)',
                background: done ? 'var(--color-success)' : 'transparent',
              }}
            >
              {done && <Check size={7} className="text-white" />}
            </span>
            <span
              className="truncate"
              style={{
                color: done ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                textDecoration: done ? 'line-through' : 'none',
              }}
            >
              {displayTaskTitle(sub)}
            </span>
          </div>
        );
      })}
      {remaining > 0 && (
        <span className="text-[10px] ml-4" style={{ color: 'var(--color-text-tertiary)' }}>
          {t('{{remaining}} more subtasks...', { remaining })}
        </span>
      )}
    </div>
  );
}

/* ── EntryCard ── */

type ContextMenuTriggerEvent = Pick<React.MouseEvent, 'preventDefault' | 'clientX' | 'clientY'>;

function createContextMenuTriggerEvent(rect: DOMRect): ContextMenuTriggerEvent {
  return {
    preventDefault() {},
    clientX: rect.right,
    clientY: rect.bottom,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex card with many interaction modes
function EntryCard({
  entry,
  linkedTask,
  batchMode,
  selected,
  isEditing,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onOpenDetail,
  onAddSubtask,
  onSetDdl,
  onChangeRole,
  onContextMenu,
  onToggleSelect,
  onChangeType,
  onMarkComplete,
  onOpenSourceThread,
  isProjectHighlighted,
}: {
  entry: StreamEntry;
  linkedTask?: Task;
  batchMode: boolean;
  selected: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onSaveEdit: (content: string) => void;
  onCancelEdit: () => void;
  onOpenDetail: (entry: StreamEntry) => void;
  onAddSubtask: (entry: StreamEntry) => void;
  onSetDdl: (entry: StreamEntry) => void;
  onChangeRole: (entry: StreamEntry, roleId: string | undefined) => void;
  onContextMenu: (e: ContextMenuTriggerEvent, entry: StreamEntry) => void;
  onToggleSelect: (entryId: string) => void;
  onChangeType: (entry: StreamEntry, type: StreamEntryType) => void;
  onMarkComplete?: (entry: StreamEntry) => void;
  onOpenSourceThread?: (threadId: string) => void;
  isProjectHighlighted?: boolean;
}) {
  const { t } = useTranslation('stream');
  const roles = useRoleStore((s) => s.roles);
  const [editText, setEditText] = useState(entry.content);
  const tasks = useTaskStore((s) => s.tasks);

  const subtaskCount = linkedTask ? (linkedTask.subtaskIds ?? []).length : 0;
  const completedSubtasks = linkedTask
    ? (linkedTask.subtaskIds ?? [])
        .map((id) => tasks.find((t) => t.id === id))
        .filter((t) => t?.status === 'completed').length
    : 0;

  useEffect(() => {
    if (isEditing) {
      setEditText(entry.content);
    }
  }, [isEditing, entry.content]);

  const isTask = entry.entryType === 'task';
  const typeMeta = ENTRY_TYPE_META[entry.entryType] ?? ENTRY_TYPE_META.spark;

  const handleClick = (e: React.MouseEvent) => {
    if (isEditing) return;
    if (batchMode) {
      e.preventDefault();
      onToggleSelect(entry.id);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onToggleSelect(entry.id);
      return;
    }
    onOpenDetail(entry);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative flex gap-3"
      onContextMenu={(e) => onContextMenu(e, entry)}
    >
      {batchMode && (
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(entry.id)}
            className="h-4 w-4 rounded accent-[var(--color-accent)]"
          />
        </div>
      )}

      <div className="flex w-11 shrink-0 flex-col items-end pt-2">
        <span
          className="text-[11px] font-medium tabular-nums"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {formatTime(entry.timestamp)}
        </span>
        {isTask && linkedTask ? (
          <button
            type="button"
            className="mt-0.5 flex items-center justify-center rounded-full transition-colors"
            style={{
              width: 14,
              height: 14,
              border: `2px solid ${linkedTask.status === 'completed' ? 'var(--color-success, #22c55e)' : 'var(--color-accent)'}`,
              background:
                linkedTask.status === 'completed' ? 'var(--color-success, #22c55e)' : 'transparent',
            }}
            title={linkedTask.status === 'completed' ? t('Completed') : t('Mark complete')}
            onClick={(e) => {
              e.stopPropagation();
              if (onMarkComplete) onMarkComplete(entry);
            }}
          >
            {linkedTask.status === 'completed' && (
              <Check size={8} className="text-white" strokeWidth={3} />
            )}
          </button>
        ) : isTask ? (
          <div
            className="mt-0.5"
            style={{
              width: 14,
              height: 14,
              borderRadius: 3,
              border: `2px solid ${typeMeta.dotColor}`,
              background: 'transparent',
            }}
          />
        ) : (
          <div
            className="mt-1"
            style={{
              width: 8,
              height: 8,
              borderRadius: entry.entryType === 'spark' ? '50%' : 2,
              background: typeMeta.dotColor,
            }}
          />
        )}
      </div>

      <div
        className="relative flex-1 rounded-xl p-3 shadow-sm transition-shadow hover:shadow-md cursor-pointer outline-none"
        style={{
          background: selected ? 'var(--color-accent-soft)' : 'var(--color-surface)',
          borderTop: `1px solid ${typeMeta.borderColor}`,
          borderRight: `1px solid ${typeMeta.borderColor}`,
          borderBottom: `1px solid ${typeMeta.borderColor}`,
          borderLeft: isProjectHighlighted
            ? '3px solid var(--color-accent)'
            : `1px solid ${typeMeta.borderColor}`,
        }}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isEditing) onOpenDetail(entry);
        }}
        role="presentation"
        tabIndex={-1}
      >
        {/* Inline editing mode */}
        {isEditing ? (
          <div className="space-y-2">
            <RichMarkdownEditor
              editorId={`stream-entry-${entry.id}`}
              initialMarkdown={editText}
              onMarkdownChange={setEditText}
              variant="compact"
              topBar={false}
              toolbar={false}
              blockEdit={false}
              autoFocus
              onSubmitShortcut={() => onSaveEdit(editText)}
              className="border-none bg-transparent shadow-none"
            />
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSaveEdit(editText);
                }}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white"
                style={{ background: 'var(--color-accent)' }}
              >
                <Check size={11} />
                {t('Save')}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelEdit();
                }}
                className="text-[11px] font-medium"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {t('Cancel')}
              </button>
              <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {t('Ctrl+Enter to save')}
              </span>
            </div>
            {/* Inline subtask editing when in edit mode */}
            {linkedTask && (linkedTask.subtaskIds ?? []).length > 0 && (
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                <InlineSubtaskInput
                  onAdd={() => onAddSubtask(entry)}
                  onCancel={() => {}}
                  placeholder={t('Add new subtask...')}
                />
              </div>
            )}
          </div>
        ) : (
          <>
            <MarkdownPreview
              content={entry.content}
              className={`markdown-preview--compact stream-entry-markdown ${
                linkedTask?.status === 'completed' ? 'opacity-60' : ''
              }`}
            />

            {/* Inline task info: DDL pill + subtask count */}
            {linkedTask && (
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                {linkedTask.ddl &&
                  (() => {
                    const taskCompleted = linkedTask.status === 'completed';
                    const overdue = isOverdue(linkedTask.ddl);
                    const days = daysUntil(linkedTask.ddl);
                    let bg: string;
                    let fg: string;
                    let label: string;
                    if (taskCompleted && overdue) {
                      bg = 'var(--color-success-soft, rgba(34,197,94,0.1))';
                      fg = 'var(--color-success, #22c55e)';
                      label = t('Completed');
                    } else if (overdue) {
                      bg = 'var(--color-danger-soft, rgba(239,68,68,0.1))';
                      fg = 'var(--color-danger, #ef4444)';
                      label = formatDdlLabel(linkedTask.ddl);
                    } else if (days <= 2) {
                      bg = 'var(--color-warning-soft, rgba(234,179,8,0.1))';
                      fg = 'var(--color-warning, #ca8a04)';
                      label = formatDdlLabel(linkedTask.ddl);
                    } else {
                      bg = 'var(--color-bg)';
                      fg = 'var(--color-text-secondary)';
                      label = formatDdlLabel(linkedTask.ddl);
                    }
                    return (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{ background: bg, color: fg }}
                      >
                        {taskCompleted && overdue ? <Check size={10} /> : <Calendar size={10} />}
                        {label}
                      </span>
                    );
                  })()}
                {subtaskCount > 0 && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      background: 'var(--color-accent-soft)',
                      color: 'var(--color-accent)',
                    }}
                  >
                    {t('{{completed}}/{{total}} subtasks', {
                      completed: completedSubtasks,
                      total: subtaskCount,
                    })}
                  </span>
                )}
              </div>
            )}

            {/* Subtask preview */}
            {linkedTask && <SubtaskPreview linkedTask={linkedTask} />}
            {entry.threadMeta?.sourceThreadId ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    background: 'var(--color-accent-soft)',
                    color: 'var(--color-accent)',
                  }}
                >
                  {t('thread_origin_badge')}
                </span>
                {onOpenSourceThread ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenSourceThread(entry.threadMeta?.sourceThreadId ?? '');
                    }}
                    className="text-[10px] font-medium"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    {t('thread_origin_open')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        )}

        {/* Role pill + action buttons (only when not editing) */}
        {!isEditing && (
          <div className="mt-1.5 flex items-center gap-1.5">
            {roles.length > 0 && (
              <RolePill
                roleId={entry.roleId}
                onChangeRole={(newRoleId) => onChangeRole(entry, newRoleId)}
              />
            )}

            <div className="flex-1" />

            <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              {!isTask && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeType(entry, 'task');
                  }}
                  className="rounded-md p-1 transition-colors hover:bg-[var(--color-bg)]"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  title={t('Promote to task')}
                >
                  <ArrowUpCircle size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartEdit();
                }}
                className="rounded-md p-1 transition-colors hover:bg-[var(--color-bg)]"
                style={{ color: 'var(--color-text-tertiary)' }}
                title={t('Edit')}
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddSubtask(entry);
                }}
                className="rounded-md p-1 transition-colors hover:bg-[var(--color-bg)]"
                style={{ color: 'var(--color-text-tertiary)' }}
                title={t('Add subtask')}
              >
                <ListPlus size={13} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSetDdl(entry);
                }}
                className="rounded-md p-1 transition-colors hover:bg-[var(--color-bg)]"
                style={{ color: 'var(--color-text-tertiary)' }}
                title={t('Set deadline')}
              >
                <Calendar size={13} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  onContextMenu(createContextMenuTriggerEvent(rect), entry);
                }}
                className="rounded-md p-1 transition-colors hover:bg-[var(--color-bg)]"
                style={{ color: 'var(--color-text-tertiary)' }}
                title={t('More')}
              >
                <MoreHorizontal size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ── Inline helpers ── */

function InlineSubtaskInput({
  onAdd,
  onCancel,
  placeholder,
}: {
  onAdd: (title: string) => void;
  onCancel: () => void;
  placeholder?: string;
}) {
  const { t } = useTranslation('stream');
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2"
      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-accent)' }}
    >
      <ListPlus size={14} style={{ color: 'var(--color-accent)' }} />
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) {
            onAdd(value.trim());
            setValue('');
          }
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={placeholder ?? t('Enter subtask title, press Enter to add...')}
        className="flex-1 bg-transparent text-[13px] outline-none"
        style={{ color: 'var(--color-text)' }}
      />
      <button
        type="button"
        onClick={onCancel}
        className="rounded p-0.5"
        style={{ color: 'var(--color-text-tertiary)' }}
        title={t('Close')}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function InlineDdlInput({
  onSet,
  onCancel,
}: {
  onSet: (ddl: Date) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('stream');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2"
      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-accent)' }}
    >
      <Calendar size={14} style={{ color: 'var(--color-accent)' }} />
      <input
        ref={ref}
        type="datetime-local"
        onChange={(e) => {
          if (e.target.value) {
            onSet(new Date(e.target.value));
          }
        }}
        className="flex-1 bg-transparent text-[13px] outline-none"
        style={{ color: 'var(--color-text)' }}
      />
      <button
        type="button"
        onClick={onCancel}
        className="rounded p-0.5"
        style={{ color: 'var(--color-text-tertiary)' }}
        title={t('Close')}
      >
        <X size={14} />
      </button>
    </div>
  );
}

/* ── Main StreamView ── */

const DRAFT_KEY = 'mlt-stream-draft';
const STREAM_PROJECT_PANEL_KEY = 'mlt-stream-project-panel-open';

function loadProjectPanelOpen(): boolean {
  try {
    return localStorage.getItem(STREAM_PROJECT_PANEL_KEY) === 'true';
  } catch {
    return false;
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as {
      input?: string;
      saveAsTask?: boolean;
      selectedEntryType?: StreamEntryType;
      metaDdlDate?: string;
      metaDdlType?: 'soft' | 'commitment' | 'hard';
      metaTags?: string;
    };
  } catch {
    return {};
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: StreamView manages many interactive states
export function StreamView() {
  const { t } = useTranslation('stream');
  const { t: tTask } = useTranslation('task');
  const draft = useRef(loadDraft()).current;
  const [input, setInput] = useState(draft.input ?? '');
  const [isFocused, setIsFocused] = useState(false);
  const [selectedEntryType, setSelectedEntryType] = useState<StreamEntryType>(
    draft.selectedEntryType ?? (draft.saveAsTask ? 'task' : 'spark'),
  );
  const [metaDdlDate, setMetaDdlDate] = useState(draft.metaDdlDate ?? '');
  const [metaDdlType, setMetaDdlType] = useState<'soft' | 'commitment' | 'hard'>(
    draft.metaDdlType ?? 'soft',
  );
  const [metaTags, setMetaTags] = useState(draft.metaTags ?? '');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [subtaskEntryId, setSubtaskEntryId] = useState<string | null>(null);
  const [ddlEntryId, setDdlEntryId] = useState<string | null>(null);
  const [parentPickerTargetId, setParentPickerTargetId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    entry: StreamEntry;
  } | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState('');
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(() => new Set());
  const [typeFilter, setTypeFilter] = useState<'all' | StreamEntryType>('all');
  const [sortMode, setSortMode] = useState<'default' | 'newest' | 'oldest'>('default');
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [projectPanelOpen, setProjectPanelOpen] = useState(loadProjectPanelOpen);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [composerRevision, setComposerRevision] = useState(0);
  const [isComposerExpanded, setIsComposerExpanded] = useState(
    Boolean(
      (draft.input ?? '').trim() ||
        draft.selectedEntryType === 'task' ||
        draft.metaDdlDate ||
        draft.metaTags,
    ),
  );
  const [isComposerManuallyCollapsed, setIsComposerManuallyCollapsed] = useState(false);
  const [isNearComposerEdge, setIsNearComposerEdge] = useState(true);
  const filterToolbarRef = useRef<HTMLDivElement>(null);
  const composerEditorRef = useRef<RichMarkdownEditorHandle>(null);
  const composerShellRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const shouldStickToStreamEdgeRef = useRef(true);
  const pendingAutoScrollRef = useRef<'bottom' | 'top' | null>(null);

  const entries = useStreamStore((s) => s.entries);
  const loading = useStreamStore((s) => s.loading);
  const streamError = useStreamStore((s) => s.error);
  const load = useStreamStore((s) => s.load);
  const loadMore = useStreamStore((s) => s.loadMore);
  const runSearch = useStreamStore((s) => s.runSearch);
  const clearSearch = useStreamStore((s) => s.clearSearch);
  const searchResults = useStreamStore((s) => s.searchResults);
  const daysLoaded = useStreamStore((s) => s.daysLoaded);
  const addEntry = useStreamStore((s) => s.addEntry);
  const updateEntry = useStreamStore((s) => s.updateEntry);
  const deleteEntry = useStreamStore((s) => s.deleteEntry);
  const enrichEntry = useStreamStore((s) => s.enrichEntry);
  const setEntryType = useStreamStore((s) => s.setEntryType);
  const addSubtaskToEntry = useStreamStore((s) => s.addSubtaskToEntry);
  const setEntryDdl = useStreamStore((s) => s.setEntryDdl);
  const tasks = useTaskStore((s) => s.tasks);
  const loadTasks = useTaskStore((s) => s.load);
  const selectTask = useTaskStore((s) => s.selectTask);
  const updateStatus = useTaskStore((s) => s.updateStatus);
  const updateTask = useTaskStore((s) => s.updateTask);
  const reparentTask = useTaskStore((s) => s.reparentTask);
  const currentRoleId = useRoleStore((s) => s.currentRoleId);
  const roles = useRoleStore((s) => s.roles);
  const switchRole = useRoleStore((s) => s.switchRole);

  const filterRoot = useStreamFilterStore((s) => s.root);
  const setFilterRoot = useStreamFilterStore((s) => s.setRoot);
  const resetFilter = useStreamFilterStore((s) => s.reset);
  const showToast = useToastStore((s) => s.showToast);
  const advancedFilterEnabled = useModuleStore((s) => s.isEnabled('advanced-filter'));
  const streamContextPanelEnabled = useModuleStore((s) => s.isEnabled('stream-context-panel'));
  const isMobile = useIsMobile();
  const thinkSessionEnabled = useModuleStore((s) => s.isEnabled('think-session'));
  const aiAgentEnabled = useModuleStore((s) => s.isEnabled('ai-agent'));
  const openAiChat = useOpenAiChat();
  const { t: tAi } = useTranslation('ai');
  const streamPanelMode = useThinkSessionStore((s) => s.streamMode);
  const setStreamPanelMode = useThinkSessionStore((s) => s.setStreamMode);
  const addStreamToThread = useWorkThreadStore((s) => s.addStreamToThread);
  const openThread = useWorkThreadStore((s) => s.openThread);

  useEffect(() => {
    if (!advancedFilterEnabled) resetFilter();
  }, [advancedFilterEnabled, resetFilter]);

  useEffect(() => {
    try {
      localStorage.setItem(STREAM_PROJECT_PANEL_KEY, projectPanelOpen ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  }, [projectPanelOpen]);

  const roleFiltered = useMemo(
    () => filterByRole(entries, currentRoleId),
    [entries, currentRoleId],
  );

  const taskMap = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of tasks) map.set(t.id, t);
    return map;
  }, [tasks]);

  const focusedProjectSubtreeIds = useMemo(() => {
    if (!selectedProjectId) return new Set<string>();
    const proj = tasks.find((x) => x.id === selectedProjectId && x.taskType === 'project');
    if (!proj) return new Set<string>();
    return new Set(collectProjectSubtree(proj, tasks).map((t) => t.id));
  }, [selectedProjectId, tasks]);

  const displayEntries = useMemo(() => {
    let result = roleFiltered;
    if (searchResults !== null) result = searchResults;
    if (typeFilter !== 'all') {
      result = result.filter((e) => e.entryType === typeFilter);
    }
    if (advancedFilterEnabled) result = applyAdvancedFilter(result, filterRoot);
    const arr = [...result];
    if (sortMode === 'newest') arr.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    else if (sortMode === 'oldest')
      arr.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return arr;
  }, [roleFiltered, searchResults, typeFilter, filterRoot, sortMode, advancedFilterEnabled]);

  const groups = groupEntriesByDate(displayEntries);
  const visibleEntryIds = useMemo(() => displayEntries.map((entry) => entry.id), [displayEntries]);
  const [streamDirection, setStreamDirection] = useState<'bottom-up' | 'top-down'>('bottom-up');
  const initialScrollDone = useRef(false);

  const applyStreamDirection = useCallback((value: 'bottom-up' | 'top-down') => {
    initialScrollDone.current = false;
    shouldStickToStreamEdgeRef.current = value === 'bottom-up';
    pendingAutoScrollRef.current = value === 'bottom-up' ? 'bottom' : 'top';
    setStreamDirection(value);
  }, []);

  /** Scroll to entry after opening Stream from project detail (sessionStorage set by TaskDetailPanel). */
  useEffect(() => {
    const id = sessionStorage.getItem('mlt-stream-scroll-to');
    if (!id) return;
    if (!visibleEntryIds.includes(id)) return;
    let cancelled = false;
    const tryScroll = (attempt: number) => {
      if (cancelled) return;
      const escaped =
        typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id;
      const el = document.querySelector(`[data-stream-entry-id="${escaped}"]`);
      if (el) {
        sessionStorage.removeItem('mlt-stream-scroll-to');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (attempt < 20) {
        window.setTimeout(() => tryScroll(attempt + 1), 100);
      }
    };
    const t = window.setTimeout(() => tryScroll(0), 80);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [visibleEntryIds]);

  useEffect(() => {
    let cancelled = false;
    getSetting('stream-direction').then((v) => {
      if (!cancelled && (v === 'top-down' || v === 'bottom-up')) applyStreamDirection(v);
    });
    return () => {
      cancelled = true;
    };
  }, [applyStreamDirection]);

  useEffect(() => {
    let cancelled = false;
    const onFocus = () => {
      getSetting('stream-direction').then((v) => {
        if (!cancelled && (v === 'top-down' || v === 'bottom-up')) applyStreamDirection(v);
      });
    };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, [applyStreamDirection]);

  const visibleGroups = useMemo(() => {
    if (streamDirection === 'bottom-up') return groups;
    return [...groups].reverse().map((g) => ({
      ...g,
      entries: [...g.entries].reverse(),
    }));
  }, [groups, streamDirection]);

  const filterCondCount = countConditions(filterRoot);
  const isComposerPristine =
    !input.trim() && selectedEntryType === 'spark' && !metaDdlDate && !metaTags;
  const shouldAutoExpandComposer =
    !isComposerManuallyCollapsed &&
    (isFocused || selectedEntryType === 'task' || !isComposerPristine);
  const activeEntryTypeMeta = ENTRY_TYPE_META[selectedEntryType];
  const ActiveEntryTypeIcon = activeEntryTypeMeta.icon;
  const composerPreview = input.trim().replace(/\s+/g, ' ').slice(0, 84);

  const openThreadWorkspace = useCallback(() => {
    setStreamPanelMode('work-thread');
  }, [setStreamPanelMode]);

  const openSourceThread = useCallback(
    (threadId: string) => {
      if (!threadId) return;
      setStreamPanelMode('work-thread');
      void openThread(threadId);
    },
    [openThread, setStreamPanelMode],
  );

  const toggleDateGroup = useCallback((key: string) => {
    setCollapsedDates((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const e of roleFiltered) {
      for (const t of e.tags) tags.add(t);
    }
    return [...tags].sort();
  }, [roleFiltered]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!filterPanelOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = filterToolbarRef.current;
      if (el && !el.contains(e.target as Node)) setFilterPanelOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [filterPanelOpen]);

  const expandComposer = useCallback(() => {
    setIsComposerManuallyCollapsed(false);
    setIsComposerExpanded(true);
    window.setTimeout(() => composerEditorRef.current?.focus(), 40);
  }, []);

  const collapseComposer = useCallback(() => {
    setIsFocused(false);
    setIsComposerManuallyCollapsed(true);
    setIsComposerExpanded(false);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, []);

  useEffect(() => {
    if (shouldAutoExpandComposer) {
      setIsComposerExpanded(true);
    }
  }, [shouldAutoExpandComposer]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (streamDirection === 'bottom-up') {
      if (!pendingAutoScrollRef.current && !shouldStickToStreamEdgeRef.current) return;
      el.scrollTo({ top: Math.max(0, el.scrollHeight - el.clientHeight), behavior: 'smooth' });
      pendingAutoScrollRef.current = null;
      shouldStickToStreamEdgeRef.current = true;
      return;
    }
    if (pendingAutoScrollRef.current === 'top') {
      el.scrollTo({ top: 0, behavior: 'smooth' });
      pendingAutoScrollRef.current = null;
    }
  }, [entries.length, streamDirection]);

  useEffect(() => {
    if (streamDirection !== 'bottom-up') return;
    if (loading || groups.length === 0) return;
    if (initialScrollDone.current) return;

    const container = scrollRef.current;
    if (!container) return;
    const scrollToBottom = () => {
      container.scrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      shouldStickToStreamEdgeRef.current = true;
      initialScrollDone.current = true;
    };
    scrollToBottom();
    requestAnimationFrame(scrollToBottom);
  }, [streamDirection, loading, groups.length]);

  useEffect(() => {
    if (groups.length === 0) initialScrollDone.current = false;
  }, [groups.length]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const updateEdgeState = () => {
      if (streamDirection === 'bottom-up') {
        const distance = container.scrollHeight - container.clientHeight - container.scrollTop;
        const near = distance < 180;
        shouldStickToStreamEdgeRef.current = near;
        setIsNearComposerEdge(near);
        if (!near && isComposerPristine && !isFocused && !isComposerManuallyCollapsed) {
          setIsComposerExpanded(false);
        }
        return;
      }

      const near = container.scrollTop < 120;
      setIsNearComposerEdge(near);
      if (!near && isComposerPristine && !isFocused && !isComposerManuallyCollapsed) {
        setIsComposerExpanded(false);
      }
    };

    updateEdgeState();
    container.addEventListener('scroll', updateEdgeState, { passive: true });
    return () => container.removeEventListener('scroll', updateEdgeState);
  }, [streamDirection, isComposerPristine, isFocused, isComposerManuallyCollapsed]);

  useEffect(() => {
    const data = { input, selectedEntryType, metaDdlDate, metaDdlType, metaTags };
    if (!input && selectedEntryType === 'spark' && !metaDdlDate && !metaTags) {
      localStorage.removeItem(DRAFT_KEY);
    } else {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    }
  }, [input, selectedEntryType, metaDdlDate, metaDdlType, metaTags]);

  const [composerAttachments, setComposerAttachments] = useState<StreamEntry['attachments']>([]);
  const composerFileInputRef = useRef<HTMLInputElement>(null);

  const {
    isUploading,
    handlePaste,
    handleDrop,
    handleDragOver,
    handleFileInputChange,
  } = useFileHostUpload({
    getAttachments: () => composerAttachments,
    onAttachmentsChange: (attachments) => {
      setComposerAttachments(attachments);
    },
    onInsertMarkdown: (markdown) => {
      if (composerEditorRef.current) {
        composerEditorRef.current.insertText(markdown);
        return;
      }
      setInput((prev) => (prev ? `${prev}\n${markdown}` : markdown));
    },
    onUploadError: (message) => {
      showToast({ type: 'error', message });
    },
  });

  const handleSubmit = () => {
    if (!input.trim()) return;
    pendingAutoScrollRef.current = streamDirection === 'bottom-up' ? 'bottom' : 'top';
    const isTask = selectedEntryType === 'task';
    const meta: Parameters<typeof addEntry>[2] = {
      entryType: selectedEntryType,
      ...(isTask && {
        ddl: metaDdlDate ? new Date(metaDdlDate) : undefined,
        ddlType: metaDdlDate ? metaDdlType : undefined,
        tags:
          metaTags
            .split(/[\s,]+/)
            .map((t) => t.trim())
            .filter(Boolean) || undefined,
      }),
      attachments: composerAttachments.length > 0 ? composerAttachments : undefined,
    };
    addEntry(input.trim(), isTask, meta).catch(() => {});
    setInput('');
    setComposerAttachments([]);
    setComposerRevision((value) => value + 1);
    setMetaDdlDate('');
    setMetaDdlType('soft');
    setMetaTags('');
    setIsComposerManuallyCollapsed(false);
  };

  const handleSaveEdit = async (entryId: string, content: string) => {
    const entry =
      entries.find((e) => e.id === entryId) ?? searchResults?.find((e) => e.id === entryId);
    if (!entry || !content.trim()) return;
    await updateEntry({ ...entry, content: content.trim() });
    setEditingEntryId(null);
  };

  const handleOpenDetail = async (entry: StreamEntry) => {
    let taskId = entry.extractedTaskId;
    try {
      if (!taskId) {
        taskId = await enrichEntry(entry.id);
        await loadTasks();
      }
    } catch {
      showToast({ type: 'error', message: t('Open task failed') });
      return;
    }
    if (!taskId) {
      showToast({ type: 'error', message: t('Open task failed') });
      return;
    }
    selectTask(taskId);
  };

  const handleTagFilter = useCallback(
    (tag: string) => {
      const q = tag.startsWith('#') ? tag : `#${tag}`;
      setSearchInput(q);
      void runSearch(q);
    },
    [runSearch],
  );

  const handleAddSubtask = async (entryId: string, title: string) => {
    await addSubtaskToEntry(entryId, title);
    await loadTasks();
  };

  const handleSetDdl = async (entryId: string, ddl: Date) => {
    await setEntryDdl(entryId, ddl);
    await loadTasks();
    setDdlEntryId(null);
  };

  const handleChangeRole = async (entry: StreamEntry, newRoleId: string | undefined) => {
    await updateEntry({ ...entry, roleId: newRoleId });
  };

  const handleChangeType = async (entryId: string, newType: StreamEntryType) => {
    await setEntryType(entryId, newType);
    if (newType === 'task') await loadTasks();
  };

  const handleContextMenu = (e: ContextMenuTriggerEvent, entry: StreamEntry) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const handleToggleSelect = (entryId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      if (!batchMode && next.size > 0) setBatchMode(true);
      if (next.size === 0 && batchMode) setBatchMode(false);
      return next;
    });
  };

  const renderStreamEntry = (entry: StreamEntry) => {
    const linkedTask = entry.extractedTaskId ? taskMap.get(entry.extractedTaskId) : undefined;
    const canMarkComplete = entry.entryType === 'task' && Boolean(entry.extractedTaskId);
    const isProjectHighlighted = Boolean(
      selectedProjectId &&
        entry.extractedTaskId &&
        focusedProjectSubtreeIds.has(entry.extractedTaskId),
    );

    const entryCard = (
      <EntryCard
        entry={entry}
        linkedTask={linkedTask}
        batchMode={batchMode}
        selected={selectedIds.has(entry.id)}
        isEditing={editingEntryId === entry.id}
        onStartEdit={() => setEditingEntryId(entry.id)}
        onSaveEdit={(content) => handleSaveEdit(entry.id, content)}
        onCancelEdit={() => setEditingEntryId(null)}
        onOpenDetail={handleOpenDetail}
        onAddSubtask={(selectedEntry) => setSubtaskEntryId(selectedEntry.id)}
        onSetDdl={(selectedEntry) => setDdlEntryId(selectedEntry.id)}
        onChangeRole={handleChangeRole}
        onContextMenu={handleContextMenu}
        onToggleSelect={handleToggleSelect}
        onChangeType={(selectedEntry, type) => handleChangeType(selectedEntry.id, type)}
        onOpenSourceThread={openSourceThread}
        onMarkComplete={
          canMarkComplete
            ? (selectedEntry) => {
                if (!selectedEntry.extractedTaskId) return;
                const task = taskMap.get(selectedEntry.extractedTaskId);
                updateStatus(
                  selectedEntry.extractedTaskId,
                  task?.status === 'completed' ? 'active' : 'completed',
                );
              }
            : undefined
        }
        isProjectHighlighted={isProjectHighlighted}
      />
    );

    return (
      <div key={entry.id} data-stream-entry-id={entry.id}>
        {entry.extractedTaskId ? (
          <DndTaskWrapper taskId={entry.extractedTaskId}>{entryCard}</DndTaskWrapper>
        ) : (
          entryCard
        )}
        {subtaskEntryId === entry.id && (
          <div className="ml-14 mt-1">
            <InlineSubtaskInput
              onAdd={(title) => handleAddSubtask(entry.id, title)}
              onCancel={() => setSubtaskEntryId(null)}
            />
          </div>
        )}
        {ddlEntryId === entry.id && (
          <div className="ml-14 mt-1">
            <InlineDdlInput
              onSet={(ddl) => handleSetDdl(entry.id, ddl)}
              onCancel={() => setDdlEntryId(null)}
            />
          </div>
        )}
      </div>
    );
  };

  const handleBatchChangeRole = async (roleId: string | undefined) => {
    for (const id of selectedIds) {
      const entry = entries.find((e) => e.id === id) ?? searchResults?.find((e) => e.id === id);
      if (entry) {
        await updateEntry({ ...entry, roleId });
      }
    }
    setBatchMode(false);
    setSelectedIds(new Set());
  };

  const handleBatchDelete = async () => {
    for (const id of selectedIds) {
      await deleteEntry(id);
    }
    setBatchMode(false);
    setSelectedIds(new Set());
  };

  const cancelBatch = () => {
    setBatchMode(false);
    setSelectedIds(new Set());
  };

  const handleFlipCapsule = async () => {
    const entry = await pickTimeCapsuleEntry(30);
    if (!entry) {
      showToast({ type: 'info', message: t('No old sparks yet'), duration: 3200 });
      return;
    }
    showToast({
      type: 'info',
      message: t('Time capsule hint', { preview: entry.content.slice(0, 160) }),
      duration: 14000,
    });
  };

  const composerInner = (
    <div className="mx-auto max-w-4xl xl:max-w-5xl">
      <div
        ref={composerShellRef}
        className={`stream-composer-shell overflow-hidden transition-[border-color,background-color,box-shadow] duration-200 ${
          isComposerExpanded
            ? 'rounded-[var(--radius-panel)] shadow-md'
            : 'rounded-[var(--radius-pill)] shadow-sm'
        }`}
        style={{
          background: isComposerExpanded
            ? 'color-mix(in srgb, var(--color-surface) 96%, transparent)'
            : 'color-mix(in srgb, var(--color-surface) 88%, transparent)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border:
            isFocused || isComposerExpanded
              ? '1px solid color-mix(in srgb, var(--color-accent) 30%, var(--color-border))'
              : '1px solid color-mix(in srgb, var(--color-border) 78%, transparent)',
          boxShadow: isComposerExpanded
            ? '0 6px 18px color-mix(in srgb, var(--color-accent) 6%, transparent)'
            : '0 2px 8px color-mix(in srgb, black 4%, transparent)',
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <input
          ref={composerFileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileInputChange}
        />
        {isUploading && (
          <div className="px-3.5 py-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {t('Uploading...')}
          </div>
        )}
        <AnimatePresence initial={false} mode="wait">
          {isComposerExpanded ? (
            <motion.div
              key="expanded"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 0.78, 0.22, 1] }}
              className="overflow-hidden"
            >
              <div
                onFocusCapture={() => {
                  setIsFocused(true);
                  setIsComposerManuallyCollapsed(false);
                  setIsComposerExpanded(true);
                }}
                onBlurCapture={() => {
                  window.setTimeout(() => {
                    const stillInside = composerShellRef.current?.contains(document.activeElement);
                    setIsFocused(Boolean(stillInside));
                    if (
                      !stillInside &&
                      !input.trim() &&
                      selectedEntryType === 'spark' &&
                      !metaDdlDate &&
                      !metaTags
                    ) {
                      setIsComposerExpanded(false);
                      setIsComposerManuallyCollapsed(false);
                    }
                  }, 0);
                }}
                className="px-1.5 pt-0"
              >
                <RichMarkdownEditor
                  ref={composerEditorRef}
                  editorId={`stream-composer-${composerRevision}`}
                  initialMarkdown={input}
                  onMarkdownChange={setInput}
                  variant="standard"
                  topBar
                  toolbar={false}
                  blockEdit={false}
                  autoFocus={isComposerExpanded}
                  onSubmitShortcut={handleSubmit}
                  onPasteCapture={handlePaste}
                  className="stream-composer-editor border-none bg-transparent shadow-none"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-1.5 px-3 pb-1.5 pt-0">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span
                    className="shrink-0 text-[9.5px] tabular-nums"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {t('{{count}} characters', { count: countMarkdownText(input) })}
                  </span>
                  {!!input.trim() && (
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[9.5px] font-medium"
                      style={{
                        background: 'color-mix(in srgb, var(--color-accent-soft) 92%, transparent)',
                        color: 'var(--color-accent)',
                      }}
                    >
                      {t('Draft saved')}
                    </span>
                  )}
                  <RolePill
                    roleId={currentRoleId ?? undefined}
                    onChangeRole={(roleId) => switchRole(roleId ?? null)}
                  />
                  <div
                    className="flex items-center gap-0.5 rounded-full p-0.5"
                    style={{ background: 'color-mix(in srgb, var(--color-bg) 92%, transparent)' }}
                  >
                    {ENTRY_TYPE_KEYS.map((k) => {
                      const meta = ENTRY_TYPE_META[k];
                      const TypeIcon = meta.icon;
                      const active = selectedEntryType === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setSelectedEntryType(k)}
                          className="flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-1 text-[9.5px] font-medium transition-colors"
                          style={{
                            background: active ? 'var(--color-accent-soft)' : 'transparent',
                            color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                          }}
                          title={t(meta.labelKey)}
                        >
                          <TypeIcon size={10} />
                          {active && <span>{t(meta.labelKey)}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => composerFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border px-2.5 py-1 text-[9.5px] font-medium transition-colors hover:bg-[var(--color-bg)]"
                    style={{
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-secondary)',
                    }}
                    title={t('Attach file')}
                  >
                    <Paperclip size={11} />
                    {t('Attach')}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      collapseComposer();
                    }}
                    className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border px-2.5 py-1 text-[9.5px] font-medium transition-colors hover:bg-[var(--color-bg)]"
                    style={{
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-secondary)',
                    }}
                    title={t('Collapse composer')}
                  >
                    <ChevronDown size={11} />
                    {t('Collapse')}
                  </button>
                  {aiAgentEnabled && (
                    <button
                      type="button"
                      onClick={() =>
                        openAiChat(
                          'magic',
                          input.trim()
                            ? `Draft in composer:\n${input.slice(0, 2000)}`
                            : 'Give one short suggestion for what to capture or do next based on my recent tasks and stream.',
                        )
                      }
                      className="flex items-center gap-1 rounded-[var(--radius-pill)] border px-2.5 py-1 text-[9.5px] font-semibold transition-colors hover:bg-[var(--color-bg)]"
                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}
                      title={tAi('Stream magic hint')}
                    >
                      <Sparkles size={11} />
                      {tAi('Stream magic')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!input.trim()}
                    className="flex shrink-0 items-center gap-1 rounded-[var(--radius-pill)] px-3 py-1.5 text-[9.5px] font-semibold text-white shadow-sm transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
                    style={{ background: 'var(--color-accent)' }}
                  >
                    <Send size={11} />
                    {t('Record')}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {selectedEntryType === 'task' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-wrap items-center gap-2 px-3 pb-1.5 pt-0">
                      <div className="flex items-center gap-1.5">
                        <Clock size={13} className="text-[var(--color-text-tertiary)]" />
                        <input
                          type="datetime-local"
                          value={metaDdlDate}
                          onChange={(e) => setMetaDdlDate(e.target.value)}
                          className="rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-transparent px-2.5 py-1 text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                        />
                      </div>

                      {metaDdlDate && (
                        <div className="flex gap-1">
                          {(['soft', 'commitment', 'hard'] as const).map((dt) => (
                            <button
                              key={dt}
                              type="button"
                              onClick={() => setMetaDdlType(dt)}
                              className={`rounded-[var(--radius-pill)] px-2 py-1 text-[10px] font-medium transition-colors ${
                                metaDdlType === dt
                                  ? 'bg-[var(--color-accent)] text-white'
                                  : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
                              }`}
                            >
                              {dt}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-1.5">
                        <Tag size={13} className="text-[var(--color-text-tertiary)]" />
                        <input
                          value={metaTags}
                          onChange={(e) => setMetaTags(e.target.value)}
                          placeholder={t('Tags (space separated)')}
                          className="w-28 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-transparent px-2.5 py-1 text-[11px] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] outline-none focus:border-[var(--color-accent)]"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div
              key="collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              className="flex items-center gap-2 px-3 py-2"
              role="button"
              tabIndex={0}
              onClick={expandComposer}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  expandComposer();
                }
              }}
            >
              <RolePill
                roleId={currentRoleId ?? undefined}
                onChangeRole={(roleId) => switchRole(roleId ?? null)}
              />
              <div
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium"
                style={{
                  background: 'color-mix(in srgb, var(--color-bg) 92%, transparent)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <ActiveEntryTypeIcon size={10} />
                {t(activeEntryTypeMeta.labelKey)}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-[11px]"
                  style={{
                    color: isNearComposerEdge ? 'var(--color-text)' : 'var(--color-text-secondary)',
                  }}
                >
                  {composerPreview || t('Record an inspiration... (Ctrl+Enter to send)')}
                </div>
                {!!input.trim() && (
                  <div
                    className="mt-0.5 text-[10px]"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {t('Draft saved')}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  expandComposer();
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-pill)] px-2 py-1 text-[10px] font-semibold"
                style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)' }}
              >
                <ChevronUp size={11} />
                {t('Expand composer')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  const contextMenuTaskId = contextMenu?.entry.extractedTaskId;
  const contextMenuTask = contextMenuTaskId ? taskMap.get(contextMenuTaskId) : undefined;

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      style={{ background: 'var(--color-bg)' }}
    >
      {thinkSessionEnabled && (
        <div className="border-b border-[var(--color-border)] px-4 py-2">
          <div className="mx-auto flex max-w-4xl justify-center xl:max-w-5xl">
            <div
              className="inline-flex rounded-[var(--radius-pill)] p-0.5"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
            >
              <button
                type="button"
                onClick={() => setStreamPanelMode('stream')}
                className={`rounded-[var(--radius-pill)] px-4 py-1.5 text-[11px] font-semibold transition-colors ${
                  streamPanelMode === 'stream'
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                    : 'text-[var(--color-text-tertiary)]'
                }`}
              >
                {t('mode_stream')}
              </button>
              {thinkSessionEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    setStreamPanelMode('think-session');
                  }}
                  className={`rounded-[var(--radius-pill)] px-4 py-1.5 text-[11px] font-semibold transition-colors ${
                    streamPanelMode === 'think-session'
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                      : 'text-[var(--color-text-tertiary)]'
                  }`}
                >
                  {t('mode_think')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {thinkSessionEnabled && streamPanelMode === 'think-session' ? (
        <ThinkSessionView
          onGoNow={() =>
            window.dispatchEvent(new CustomEvent('mlt-navigate', { detail: { view: 'now' } }))
          }
        />
      ) : (
        <>
          {/* Unified toolbar: sort + types + advanced filter + search */}
          <div className="px-4 pt-3 pb-1">
            <div className="mx-auto max-w-4xl space-y-2 xl:max-w-5xl" ref={filterToolbarRef}>
              <div className="flex flex-wrap items-center gap-2">
                {!isMobile && streamContextPanelEnabled && (
                  <button
                    type="button"
                    onClick={() => setProjectPanelOpen((o) => !o)}
                    className="shrink-0 rounded-lg border p-2"
                    style={{
                      borderColor: 'var(--color-border)',
                      background: projectPanelOpen
                        ? 'var(--color-accent-soft)'
                        : 'var(--color-surface)',
                      color: projectPanelOpen
                        ? 'var(--color-accent)'
                        : 'var(--color-text-secondary)',
                    }}
                    title={tTask('Toggle project panel')}
                    aria-label={tTask('Toggle project panel')}
                    aria-pressed={projectPanelOpen}
                  >
                    <FolderKanban size={16} />
                  </button>
                )}
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as 'default' | 'newest' | 'oldest')}
                  className="rounded-lg border px-2 py-1.5 text-[11px] font-medium shrink-0 bg-[var(--color-bg)]"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  aria-label={t('Sort')}
                >
                  <option value="default">{t('sort_default')}</option>
                  <option value="newest">{t('sort_newest')}</option>
                  <option value="oldest">{t('sort_oldest')}</option>
                </select>

                <div
                  className="flex items-center gap-1 rounded-lg p-0.5 shrink-0 flex-wrap"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {[
                    { key: 'all' as const, label: t('All'), icon: null },
                    ...ENTRY_TYPE_KEYS.map((k) => ({
                      key: k,
                      label: t(ENTRY_TYPE_META[k].labelKey),
                      icon: ENTRY_TYPE_META[k].icon,
                    })),
                  ].map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTypeFilter(key)}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
                      style={{
                        background: typeFilter === key ? 'var(--color-accent-soft)' : 'transparent',
                        color:
                          typeFilter === key ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                      }}
                    >
                      {Icon && <Icon size={11} />}
                      {label}
                    </button>
                  ))}
                </div>

                {advancedFilterEnabled && (
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setFilterPanelOpen((o) => !o)}
                      className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium border"
                      style={{
                        borderColor: 'var(--color-border)',
                        background:
                          filterPanelOpen || filterCondCount > 0
                            ? 'var(--color-accent-soft)'
                            : 'var(--color-surface)',
                        color: 'var(--color-text-secondary)',
                      }}
                      aria-expanded={filterPanelOpen}
                    >
                      <Filter size={16} />
                      {t('Filter active')}
                      {filterCondCount > 0 && (
                        <span
                          className="min-w-[1.1rem] rounded-full px-1 text-center text-[10px] font-bold"
                          style={{ background: 'var(--color-accent)', color: 'white' }}
                        >
                          {filterCondCount}
                        </span>
                      )}
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleFlipCapsule}
                  className="shrink-0 rounded-lg p-2 border"
                  style={{
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-secondary)',
                  }}
                  title={t('Flip old card')}
                  aria-label={t('Flip old card')}
                >
                  <Dices size={16} />
                </button>

                <div
                  className="flex min-w-[120px] flex-1 items-center gap-2 rounded-xl px-2 py-1.5"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <Search
                    size={14}
                    className="shrink-0"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  />
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        runSearch(searchInput);
                      }
                    }}
                    placeholder={t('Search entire stream')}
                    aria-label={t('Search entire stream')}
                    className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                    style={{ color: 'var(--color-text)' }}
                  />
                  <button
                    type="button"
                    onClick={() => runSearch(searchInput)}
                    className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold"
                    style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
                  >
                    {t('Search')}
                  </button>
                  {searchResults !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        clearSearch();
                        setSearchInput('');
                      }}
                      className="shrink-0 text-[11px] font-medium"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {t('Clear search')}
                    </button>
                  )}
                </div>
              </div>

              {(typeFilter !== 'all' || (advancedFilterEnabled && filterCondCount > 0)) && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setTypeFilter('all');
                      resetFilter();
                    }}
                    className="text-[10px] font-medium"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {t('Clear filters')}
                  </button>
                </div>
              )}

              {filterPanelOpen && advancedFilterEnabled && (
                <AdvancedFilterPanel
                  root={filterRoot}
                  onChange={setFilterRoot}
                  availableTags={availableTags}
                  roles={roles}
                  onClear={() => resetFilter()}
                  onClose={() => setFilterPanelOpen(false)}
                />
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-row">
            {!isMobile && projectPanelOpen && streamContextPanelEnabled && (
              <StreamContextPanel
                tasks={tasks}
                entries={roleFiltered}
                currentRoleId={currentRoleId}
                selectedProjectId={selectedProjectId}
                onSelectProject={setSelectedProjectId}
                onOpenProjectDetail={(id) => selectTask(id)}
                onOpenTask={(id) => selectTask(id)}
                onTagFilter={handleTagFilter}
                onClose={() => setProjectPanelOpen(false)}
              />
            )}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {/* Onboarding tip */}
              <div className="px-4 pt-1 pb-0">
                <div className="mx-auto max-w-4xl xl:max-w-5xl">
                  <OnboardingTip tipId="stream-intro">
                    <Trans
                      i18nKey="This is the <1>Stream View</1> — record ideas, tasks, and inspirations anytime. Right-click entries for quick actions, the bottom input bar supports Markdown shortcuts."
                      ns="stream"
                      components={{ 1: <strong /> }}
                    />
                  </OnboardingTip>
                </div>
              </div>

              {streamDirection === 'top-down' && (
                <div className="relative z-10 shrink-0 bg-[var(--color-bg)]/82 px-4 pb-2 pt-1 backdrop-blur-[8px]">
                  {composerInner}
                </div>
              )}

              <div className="relative flex min-h-0 flex-1 flex-col">
                {/* Stream entries */}
                <DndReparentProvider>
                  <div
                    ref={scrollRef}
                    className={`min-h-0 flex-1 overflow-y-auto scroll-smooth px-4 py-2 ${
                      streamDirection === 'bottom-up' ? '' : 'pt-2'
                    }`}
                    style={{
                      paddingBottom:
                        streamDirection === 'bottom-up'
                          ? `calc(${isComposerExpanded ? 122 : 58}px + var(--safe-area-bottom))`
                          : undefined,
                    }}
                  >
                    <div className="mx-auto max-w-4xl space-y-3 xl:max-w-5xl">
                      {searchResults === null &&
                        visibleGroups.length > 0 &&
                        streamDirection === 'bottom-up' && (
                          <div className="flex justify-center py-4">
                            <button
                              type="button"
                              onClick={() => loadMore()}
                              disabled={loading}
                              className="rounded-full px-4 py-2 text-xs font-medium transition-opacity"
                              style={{
                                border: '1px solid var(--color-border)',
                                color: 'var(--color-text-secondary)',
                                opacity: loading ? 0.5 : 1,
                              }}
                            >
                              {t('Load more history', { days: daysLoaded })}
                            </button>
                          </div>
                        )}

                      {loading && groups.length === 0 && searchResults === null && (
                        <div className="flex items-center justify-center py-32">
                          <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                            {t('Loading...')}
                          </span>
                        </div>
                      )}

                      {streamError && entries.length === 0 && !loading && (
                        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
                          <span className="text-sm" style={{ color: 'var(--color-danger)' }}>
                            {t('Failed to load stream')}
                          </span>
                          <button
                            type="button"
                            onClick={() => load()}
                            className="rounded-lg px-4 py-1.5 text-xs font-medium"
                            style={{
                              background: 'var(--color-surface)',
                              border: '1px solid var(--color-border)',
                            }}
                          >
                            {t('Retry')}
                          </button>
                        </div>
                      )}

                      {!loading && searchResults !== null && searchResults.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-24 text-center">
                          <p
                            className="text-sm font-medium"
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            {t('No matches')}
                          </p>
                        </div>
                      )}

                      {!loading && displayEntries.length === 0 && searchResults === null && (
                        <div className="flex flex-col items-center justify-center py-32 text-center">
                          <Sparkles
                            size={36}
                            style={{ color: 'var(--color-text-tertiary)', opacity: 0.5 }}
                          />
                          <p
                            className="mt-3 text-lg font-medium"
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            {t('No entries yet')}
                          </p>
                          <p
                            className="mt-1 text-sm"
                            style={{ color: 'var(--color-text-tertiary)' }}
                          >
                            {t('Record an inspiration below')}
                          </p>
                        </div>
                      )}

                      {visibleGroups.map((group) => (
                        <div key={group.dateKey}>
                          <div className="flex items-center justify-center pt-3 pb-1">
                            <button
                              type="button"
                              onClick={() => toggleDateGroup(group.dateKey)}
                              className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium shadow-sm transition-colors hover:bg-[var(--color-bg)]"
                              style={{
                                background: 'var(--color-surface)',
                                color: 'var(--color-text-tertiary)',
                                border: '1px solid var(--color-border)',
                              }}
                            >
                              {group.label}
                              <ChevronDown
                                size={12}
                                className="transition-transform"
                                style={{
                                  transform: collapsedDates.has(group.dateKey)
                                    ? 'rotate(-90deg)'
                                    : undefined,
                                }}
                              />
                            </button>
                          </div>

                          <div className="space-y-2 mt-1">
                            {!collapsedDates.has(group.dateKey) &&
                              group.entries.map(renderStreamEntry)}
                          </div>
                        </div>
                      ))}

                      {searchResults === null &&
                        visibleGroups.length > 0 &&
                        streamDirection === 'top-down' && (
                          <div className="flex justify-center py-6">
                            <button
                              type="button"
                              onClick={() => loadMore()}
                              disabled={loading}
                              className="rounded-full px-4 py-2 text-xs font-medium transition-opacity"
                              style={{
                                border: '1px solid var(--color-border)',
                                color: 'var(--color-text-secondary)',
                                opacity: loading ? 0.5 : 1,
                              }}
                            >
                              {t('Load more history', { days: daysLoaded })}
                            </button>
                          </div>
                        )}

                      <div ref={bottomAnchorRef} />
                    </div>
                  </div>
                </DndReparentProvider>

                {streamDirection === 'bottom-up' && (
                  <div
                    className="relative z-10 shrink-0 bg-[var(--color-bg)]/82 px-4 pb-2 pt-0.5 backdrop-blur-[10px]"
                    style={{ paddingBottom: 'calc(10px + var(--safe-area-bottom))' }}
                  >
                    {composerInner}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Context menu */}
          {contextMenu && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              entry={contextMenu.entry}
              onClose={() => setContextMenu(null)}
              onEdit={() => setEditingEntryId(contextMenu.entry.id)}
              onOpenDetail={() => handleOpenDetail(contextMenu.entry)}
              onAddSubtask={() => setSubtaskEntryId(contextMenu.entry.id)}
              onSetDdl={() => setDdlEntryId(contextMenu.entry.id)}
              onChangeRole={(roleId) => handleChangeRole(contextMenu.entry, roleId)}
              onCopy={() => {
                navigator.clipboard.writeText(contextMenu.entry.content);
              }}
              onDelete={() => deleteEntry(contextMenu.entry.id)}
              onBatchSelect={() => {
                handleToggleSelect(contextMenu.entry.id);
              }}
              onAddToThread={() => {
                void addStreamToThread(contextMenu.entry, 'current');
                openThreadWorkspace();
              }}
              onCreateThread={() => {
                void addStreamToThread(contextMenu.entry, 'new');
                openThreadWorkspace();
              }}
              onChangeType={(type) => handleChangeType(contextMenu.entry.id, type)}
              isCompleted={contextMenuTask ? contextMenuTask.status === 'completed' : false}
              onMarkComplete={
                contextMenu.entry.entryType === 'task' && contextMenuTaskId
                  ? () => {
                      updateStatus(
                        contextMenuTaskId,
                        contextMenuTask?.status === 'completed' ? 'active' : 'completed',
                      );
                    }
                  : undefined
              }
              onSetParent={
                contextMenuTaskId ? () => setParentPickerTargetId(contextMenuTaskId) : undefined
              }
              onDoItNow={
                contextMenuTaskId
                  ? () => useNowOverrideStore.getState().requestDoItNow(contextMenuTaskId)
                  : undefined
              }
              onBoostPriority={
                contextMenu.entry.extractedTaskId
                  ? () => {
                      const tid = contextMenu.entry.extractedTaskId;
                      if (!tid) return;
                      const tk = taskMap.get(tid);
                      if (!tk) return;
                      updateTask({
                        ...tk,
                        priority: Math.min(10, (tk.priority ?? 5) + 1),
                        status:
                          tk.status === 'inbox' || tk.status === 'active' ? 'today' : tk.status,
                      });
                    }
                  : undefined
              }
            />
          )}

          {parentPickerTargetId && (
            <ParentTaskPicker
              childId={parentPickerTargetId}
              onSelect={async (parentId) => {
                await reparentTask(parentPickerTargetId, parentId);
                setParentPickerTargetId(null);
              }}
              onClose={() => setParentPickerTargetId(null)}
            />
          )}

          {/* Batch action bar */}
          <AnimatePresence>
            {batchMode && selectedIds.size > 0 && (
              <motion.div
                initial={{ y: 60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 60, opacity: 0 }}
                className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 flex items-center gap-3 rounded-2xl px-5 py-3 shadow-2xl"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <span
                  className="text-xs font-medium"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {t('Selected {{count}} items', { count: selectedIds.size })}
                </span>

                <div className="h-4 w-px" style={{ background: 'var(--color-border)' }} />

                {roles.length > 0 && (
                  <div className="relative group/batch">
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-bg)]"
                      style={{ color: 'var(--color-text)' }}
                    >
                      <UserCircle size={14} />
                      {t('Change role')}
                    </button>
                    <div
                      className="absolute bottom-full left-0 mb-1 hidden group-hover/batch:block rounded-lg py-1 shadow-lg"
                      style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        minWidth: '120px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleBatchChangeRole(undefined)}
                        className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs hover:bg-[var(--color-bg)]"
                        style={{ color: 'var(--color-text-tertiary)' }}
                      >
                        {t('No role')}
                      </button>
                      {roles.map((role) => (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => handleBatchChangeRole(role.id)}
                          className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs hover:bg-[var(--color-bg)]"
                          style={{ color: 'var(--color-text)' }}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: role.color ?? 'var(--color-accent)' }}
                          />
                          {role.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleBatchDelete}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-danger-soft)]"
                  style={{ color: 'var(--color-danger)' }}
                >
                  <Trash2 size={14} />
                  {t('Delete')}
                </button>

                <button
                  type="button"
                  onClick={cancelBatch}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-bg)]"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {t('Cancel')}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
