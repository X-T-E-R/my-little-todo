import { daysUntil, formatTime, isOverdue } from '@my-little-todo/core';
import type { StreamEntry, StreamEntryType } from '@my-little-todo/core';
import type { Task } from '@my-little-todo/core';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUpCircle,
  Calendar,
  Check,
  Clock,
  Filter,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Send,
  Sparkles,
  Tag,
  Trash2,
  UserCircle,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { ContextMenu } from '../components/ContextMenu';
import { DndReparentProvider, DndTaskWrapper } from '../components/DndReparentContext';
import { MarkdownToolbar } from '../components/MarkdownToolbar';
import { ParentTaskPicker } from '../components/ParentTaskPicker';
import { OnboardingTip } from '../components/OnboardingTip';
import { RolePill } from '../components/RolePickerPopover';
import { getAttachmentConfig, uploadBlob } from '../storage/blobApi';
import type { AttachmentConfig } from '../storage/blobApi';
import { useShortcutStore } from '../stores';
import {
  filterByRole,
  formatDdlLabel,
  groupEntriesByDate,
  useRoleStore,
  useStreamStore,
} from '../stores';
import { useTaskStore } from '../stores';
import { ENTRY_TYPE_KEYS, ENTRY_TYPE_META } from '../utils/entryTypeUtils';
import {
  clearFormat,
  insertLink,
  insertMarkdown,
  insertTable,
  setHeading,
} from '../utils/markdownInsert';
import { matchesShortcut } from '../utils/shortcuts';

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
              {sub.title}
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
  onContextMenu: (e: React.MouseEvent, entry: StreamEntry) => void;
  onToggleSelect: (entryId: string) => void;
  onChangeType: (entry: StreamEntry, type: StreamEntryType) => void;
  onMarkComplete?: (entry: StreamEntry) => void;
}) {
  const { t } = useTranslation('stream');
  const roles = useRoleStore((s) => s.roles);
  const [editText, setEditText] = useState(entry.content);
  const editRef = useRef<HTMLTextAreaElement>(null);
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
      setTimeout(() => editRef.current?.focus(), 50);
    }
  }, [isEditing, entry.content]);

  const isTask = entry.entryType === 'task';
  const typeMeta = ENTRY_TYPE_META[entry.entryType] ?? ENTRY_TYPE_META.spark;

  const renderContent = (content: string) => {
    let offset = 0;
    return content.split(/(#[^\s]+)/g).map((part) => {
      const key = `${offset}:${part}`;
      offset += part.length;
      if (part.startsWith('#')) {
        return (
          <span
            key={key}
            className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium"
            style={{
              background: 'var(--color-accent-soft)',
              color: 'var(--color-accent)',
            }}
          >
            {part}
          </span>
        );
      }
      return <span key={key}>{part}</span>;
    });
  };

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
              background: linkedTask.status === 'completed' ? 'var(--color-success, #22c55e)' : 'transparent',
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
          border: `1px solid ${typeMeta.borderColor}`,
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
          <div>
            <textarea
              ref={editRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onCancelEdit();
                if (e.key === 'Enter' && e.ctrlKey) {
                  e.preventDefault();
                  onSaveEdit(editText);
                }
              }}
              className="w-full resize-none bg-transparent text-[14px] leading-relaxed outline-none"
              style={{ color: 'var(--color-text)', minHeight: '40px' }}
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
                {t('Ctrl+Enter to save, Esc to cancel')}
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
            <p
              className={`text-[14px] leading-relaxed whitespace-pre-wrap${linkedTask?.status === 'completed' ? ' line-through opacity-60' : ''}`}
              style={{ color: 'var(--color-text)' }}
            >
              {renderContent(entry.content)}
            </p>

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
                  onContextMenu({ preventDefault: () => {}, clientX: rect.right, clientY: rect.bottom } as any, entry);
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

/* ── Filter Bar ── */

function StreamFilterBar({
  typeFilter,
  onTypeFilterChange,
  tagFilter,
  onTagFilterChange,
  availableTags,
}: {
  typeFilter: 'all' | StreamEntryType;
  onTypeFilterChange: (f: 'all' | StreamEntryType) => void;
  tagFilter: Set<string>;
  onTagFilterChange: (tags: Set<string>) => void;
  availableTags: string[];
}) {
  const { t } = useTranslation('stream');
  const [showTags, setShowTags] = useState(false);
  const isFiltering = typeFilter !== 'all' || tagFilter.size > 0;

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mb-1">
      <div
        className="flex items-center gap-1 rounded-lg p-0.5 shrink-0"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        {[
          { key: 'all' as const, label: t('All'), icon: null },
          ...ENTRY_TYPE_KEYS.map((k) => ({
            key: k as const,
            label: t(ENTRY_TYPE_META[k].labelKey),
            icon: ENTRY_TYPE_META[k].icon,
          })),
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onTypeFilterChange(key)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
            style={{
              background: typeFilter === key ? 'var(--color-accent-soft)' : 'transparent',
              color: typeFilter === key ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
            }}
          >
            {Icon && <Icon size={11} />}
            {label}
          </button>
        ))}
      </div>

      {availableTags.length > 0 && (
        <button
          type="button"
          onClick={() => setShowTags(!showTags)}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors shrink-0"
          style={{
            background:
              showTags || tagFilter.size > 0 ? 'var(--color-accent-soft)' : 'var(--color-surface)',
            color:
              showTags || tagFilter.size > 0 ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
            border: '1px solid var(--color-border)',
          }}
        >
          <Filter size={11} />
          {tagFilter.size > 0 ? t('Tags ({{count}})', { count: tagFilter.size }) : t('Tags')}
        </button>
      )}

      {isFiltering && (
        <button
          type="button"
          onClick={() => {
            onTypeFilterChange('all');
            onTagFilterChange(new Set());
          }}
          className="text-[10px] font-medium shrink-0"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {t('Clear filters')}
        </button>
      )}

      {showTags && (
        <div className="w-full flex flex-wrap gap-1 mt-1">
          {availableTags.map((tag) => {
            const active = tagFilter.has(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  const next = new Set(tagFilter);
                  if (active) next.delete(tag);
                  else next.add(tag);
                  onTagFilterChange(next);
                }}
                className="rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors"
                style={{
                  background: active ? 'var(--color-accent-soft)' : 'var(--color-bg)',
                  color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                  border: active
                    ? '1px solid var(--color-accent)'
                    : '1px solid var(--color-border)',
                }}
              >
                #{tag}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Main StreamView ── */

const DRAFT_KEY = 'mlt-stream-draft';

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
  const [typeFilter, setTypeFilter] = useState<'all' | StreamEntryType>('all');
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);

  const entries = useStreamStore((s) => s.entries);
  const loading = useStreamStore((s) => s.loading);
  const load = useStreamStore((s) => s.load);
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
  const reparentTask = useTaskStore((s) => s.reparentTask);
  const currentRoleId = useRoleStore((s) => s.currentRoleId);
  const roles = useRoleStore((s) => s.roles);
  const currentRole = currentRoleId ? roles.find((r) => r.id === currentRoleId) : undefined;
  const shortcuts = useShortcutStore((s) => s.shortcuts);
  const editorShortcuts = useMemo(() => shortcuts.filter((s) => s.scope === 'editor'), [shortcuts]);

  const roleFiltered = useMemo(
    () => filterByRole(entries, currentRoleId),
    [entries, currentRoleId],
  );

  const filtered = useMemo(() => {
    let result = roleFiltered;
    if (typeFilter !== 'all') {
      result = result.filter((e) => e.entryType === typeFilter);
    }
    if (tagFilter.size > 0) {
      result = result.filter((e) => e.tags.some((t) => tagFilter.has(t)));
    }
    return result;
  }, [roleFiltered, typeFilter, tagFilter]);

  const groups = groupEntriesByDate(filtered);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const e of roleFiltered) {
      for (const t of e.tags) tags.add(t);
    }
    return [...tags].sort();
  }, [roleFiltered]);

  const taskMap = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of tasks) map.set(t.id, t);
    return map;
  }, [tasks]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => textareaRef.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new entries
  useEffect(() => {
    bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    const data = { input, selectedEntryType, metaDdlDate, metaDdlType, metaTags };
    if (!input && selectedEntryType === 'spark' && !metaDdlDate && !metaTags) {
      localStorage.removeItem(DRAFT_KEY);
    } else {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    }
  }, [input, selectedEntryType, metaDdlDate, metaDdlType, metaTags]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: resize on input change
  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  const [attachmentConfig, setAttachmentConfig] = useState<AttachmentConfig | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    getAttachmentConfig()
      .then(setAttachmentConfig)
      .catch(() => {});
  }, []);

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!attachmentConfig?.allow_attachments) return;
      if (file.size > (attachmentConfig?.max_size ?? 10 * 1024 * 1024)) {
        return;
      }
      setIsUploading(true);
      try {
        const result = await uploadBlob(file);
        const isImage = result.mime_type.startsWith('image/');
        const md = isImage
          ? `![${result.filename}](${result.url})`
          : `[${result.filename}](${result.url})`;
        setInput((prev) => (prev ? `${prev}\n${md}` : md));
      } catch {
        // upload failed silently
      } finally {
        setIsUploading(false);
      }
    },
    [attachmentConfig],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleFileUpload(file);
          return;
        }
      }
    },
    [handleFileUpload],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (!files?.length) return;
      handleFileUpload(files[0]);
    },
    [handleFileUpload],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleSubmit = () => {
    if (!input.trim()) return;
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
    };
    addEntry(input.trim(), isTask, meta).catch(() => {});
    setInput('');
    setMetaDdlDate('');
    setMetaDdlType('soft');
    setMetaTags('');
  };

  const handleSaveEdit = async (entryId: string, content: string) => {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry || !content.trim()) return;
    await updateEntry({ ...entry, content: content.trim() });
    setEditingEntryId(null);
  };

  const handleOpenDetail = async (entry: StreamEntry) => {
    let taskId = entry.extractedTaskId;
    if (!taskId) {
      taskId = await enrichEntry(entry.id);
      await loadTasks();
    }
    selectTask(taskId);
  };

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

  const handleContextMenu = (e: React.MouseEvent, entry: StreamEntry) => {
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

  const handleBatchChangeRole = async (roleId: string | undefined) => {
    for (const id of selectedIds) {
      const entry = entries.find((e) => e.id === id);
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

  return (
    <div className="relative flex h-full flex-col" style={{ background: 'var(--color-bg)' }}>
      {/* Filter bar */}
      <div className="px-4 pt-3 pb-1">
        <div className="mx-auto max-w-2xl">
          <StreamFilterBar
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            tagFilter={tagFilter}
            onTagFilterChange={setTagFilter}
            availableTags={availableTags}
          />
        </div>
      </div>

      {/* Onboarding tip */}
      <div className="px-4 pt-1 pb-0">
        <div className="mx-auto max-w-2xl">
          <OnboardingTip tipId="stream-intro">
            <Trans
              i18nKey="This is the <1>Stream View</1> — record ideas, tasks, and inspirations anytime. Right-click entries for quick actions, the bottom input bar supports Markdown shortcuts."
              ns="stream"
              components={{ 1: <strong /> }}
            />
          </OnboardingTip>
        </div>
      </div>

      {/* Stream entries */}
      <DndReparentProvider>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-2 pb-52 scroll-smooth">
        <div className="mx-auto max-w-2xl space-y-3">
          {loading && filtered.length === 0 && (
            <div className="flex items-center justify-center py-32">
              <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                {t('Loading...')}
              </span>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <Sparkles size={36} style={{ color: 'var(--color-text-tertiary)', opacity: 0.5 }} />
              <p
                className="mt-3 text-lg font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {t('No entries yet')}
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                {t('Record an inspiration below')}
              </p>
            </div>
          )}

          {groups.map((group) => (
            <div key={group.dateKey}>
              <div className="flex items-center justify-center pt-3 pb-1">
                <span
                  className="rounded-full px-3 py-1 text-[11px] font-medium shadow-sm"
                  style={{
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-tertiary)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {group.label}
                </span>
              </div>

              <div className="space-y-2 mt-1">
                {group.entries.map((entry) => {
                  const entryCard = (
                    <EntryCard
                      entry={entry}
                      linkedTask={
                        entry.extractedTaskId ? taskMap.get(entry.extractedTaskId) : undefined
                      }
                      batchMode={batchMode}
                      selected={selectedIds.has(entry.id)}
                      isEditing={editingEntryId === entry.id}
                      onStartEdit={() => setEditingEntryId(entry.id)}
                      onSaveEdit={(content) => handleSaveEdit(entry.id, content)}
                      onCancelEdit={() => setEditingEntryId(null)}
                      onOpenDetail={handleOpenDetail}
                      onAddSubtask={(e) => setSubtaskEntryId(e.id)}
                      onSetDdl={(e) => setDdlEntryId(e.id)}
                      onChangeRole={handleChangeRole}
                      onContextMenu={handleContextMenu}
                      onToggleSelect={handleToggleSelect}
                      onChangeType={(e, type) => handleChangeType(e.id, type)}
                      onMarkComplete={
                        entry.entryType === 'task' && entry.extractedTaskId
                          ? (e) => {
                              if (e.extractedTaskId) {
                                const t = taskMap.get(e.extractedTaskId);
                                updateStatus(e.extractedTaskId, t?.status === 'completed' ? 'active' : 'completed');
                              }
                            }
                          : undefined
                      }
                    />
                  );

                  return (
                  <div key={entry.id}>
                    {entry.extractedTaskId ? (
                      <DndTaskWrapper taskId={entry.extractedTaskId}>
                        {entryCard}
                      </DndTaskWrapper>
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
                })}
              </div>
            </div>
          ))}

          <div ref={bottomAnchorRef} />
        </div>
      </div>
      </DndReparentProvider>

      {/* Gradient fade overlay */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0"
        style={{
          height: '160px',
          background: 'linear-gradient(to bottom, transparent, var(--color-bg) 70%)',
        }}
      />

      {/* Floating input area */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10 px-4"
        style={{ paddingBottom: 'calc(16px + var(--safe-area-bottom))' }}
      >
        <div className="mx-auto max-w-2xl">
          {/* Current role indicator */}
          {currentRole && (
            <div className="mb-2 flex items-center gap-1.5 ml-1">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ background: currentRole.color ?? 'var(--color-accent)' }}
              />
              <span
                className="text-[11px] font-medium"
                style={{ color: currentRole.color ?? 'var(--color-text-tertiary)' }}
              >
                {t('Recording to: {{name}}', { name: currentRole.name })}
              </span>
            </div>
          )}

          <div
            className="overflow-hidden rounded-2xl shadow-lg transition-colors"
            style={{
              background: 'color-mix(in srgb, var(--color-surface) 85%, transparent)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: isFocused ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
            }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            {/* Markdown toolbar (above input) */}
            <MarkdownToolbar textareaRef={textareaRef} />

            {isUploading && (
              <div className="px-3.5 py-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {t('Uploading...')}
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={handlePaste}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  e.preventDefault();
                  handleSubmit();
                  return;
                }
                const ta = textareaRef.current;
                if (!ta) return;
                const nativeEvent = e.nativeEvent;
                for (const binding of editorShortcuts) {
                  if (matchesShortcut(nativeEvent, binding.keys)) {
                    e.preventDefault();
                    const editorActions: Record<string, () => void> = {
                      'editor.bold': () =>
                        insertMarkdown(ta, {
                          prefix: '**',
                          suffix: '**',
                          defaultContent: t('Bold'),
                        }),
                      'editor.italic': () =>
                        insertMarkdown(ta, {
                          prefix: '*',
                          suffix: '*',
                          defaultContent: t('Italic'),
                        }),
                      'editor.underline': () =>
                        insertMarkdown(ta, {
                          prefix: '<u>',
                          suffix: '</u>',
                          defaultContent: t('Underline'),
                        }),
                      'editor.strikethrough': () =>
                        insertMarkdown(ta, {
                          prefix: '~~',
                          suffix: '~~',
                          defaultContent: t('Strikethrough'),
                        }),
                      'editor.inlineCode': () =>
                        insertMarkdown(ta, { prefix: '`', suffix: '`', defaultContent: 'code' }),
                      'editor.codeBlock': () =>
                        insertMarkdown(ta, { prefix: '```\n', suffix: '\n```' }),
                      'editor.link': () => insertLink(ta),
                      'editor.quote': () => insertMarkdown(ta, { prefix: '> ', blockLevel: true }),
                      'editor.orderedList': () =>
                        insertMarkdown(ta, { prefix: '1. ', blockLevel: true }),
                      'editor.unorderedList': () =>
                        insertMarkdown(ta, { prefix: '- ', blockLevel: true }),
                      'editor.table': () => insertTable(ta),
                      'editor.clearFormat': () => clearFormat(ta),
                      'editor.heading1': () => setHeading(ta, 1),
                      'editor.heading2': () => setHeading(ta, 2),
                      'editor.heading3': () => setHeading(ta, 3),
                      'editor.heading4': () => setHeading(ta, 4),
                    };
                    editorActions[binding.action]?.();
                    return;
                  }
                }
              }}
              placeholder={t('Record an inspiration... (Ctrl+Enter to send)')}
              className="block w-full resize-none bg-transparent px-3.5 pt-2.5 pb-1.5 text-[14px] leading-relaxed outline-none"
              style={{ color: 'var(--color-text)', minHeight: '40px' }}
              rows={1}
            />

            {/* Bottom action bar */}
            <div className="flex items-center justify-between px-3 py-1.5">
              <div className="flex items-center gap-3">
                <span
                  className="shrink-0 text-[11px] tabular-nums"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {t('{{count}} characters', { count: input.length })}
                </span>
                <div className="flex items-center gap-0.5 rounded-md p-0.5" style={{ background: 'var(--color-bg)' }}>
                  {ENTRY_TYPE_KEYS.map((k) => {
                    const meta = ENTRY_TYPE_META[k];
                    const TypeIcon = meta.icon;
                    const active = selectedEntryType === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setSelectedEntryType(k)}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors"
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
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!input.trim()}
                className="shrink-0 flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold text-white shadow-sm transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
                style={{ background: 'var(--color-accent)' }}
              >
                <Send size={11} />
                {t('Record')}
              </button>
            </div>

            {/* Collapsible task metadata panel */}
            <AnimatePresence>
              {selectedEntryType === 'task' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div
                    className="flex flex-wrap items-center gap-3 border-t px-3 py-2"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <div className="flex items-center gap-1.5">
                      <Clock size={13} className="text-[var(--color-text-tertiary)]" />
                      <input
                        type="datetime-local"
                        value={metaDdlDate}
                        onChange={(e) => setMetaDdlDate(e.target.value)}
                        className="rounded border border-[var(--color-border)] bg-transparent px-2 py-0.5 text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                      />
                    </div>

                    {metaDdlDate && (
                      <div className="flex gap-1">
                        {(['soft', 'commitment', 'hard'] as const).map((dt) => (
                          <button
                            key={dt}
                            type="button"
                            onClick={() => setMetaDdlType(dt)}
                            className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
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
                        className="w-28 rounded border border-[var(--color-border)] bg-transparent px-2 py-0.5 text-[11px] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] outline-none focus:border-[var(--color-accent)]"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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
          onChangeType={(type) => handleChangeType(contextMenu.entry.id, type)}
          isCompleted={
            contextMenu.entry.extractedTaskId
              ? taskMap.get(contextMenu.entry.extractedTaskId)?.status === 'completed'
              : false
          }
          onMarkComplete={
            contextMenu.entry.entryType === 'task' && contextMenu.entry.extractedTaskId
              ? () => {
                  const taskId = contextMenu.entry.extractedTaskId;
                  if (taskId) {
                    const t = taskMap.get(taskId);
                    updateStatus(taskId, t?.status === 'completed' ? 'active' : 'completed');
                  }
                }
              : undefined
          }
          onSetParent={
            contextMenu.entry.extractedTaskId
              ? () => setParentPickerTargetId(contextMenu.entry.extractedTaskId!)
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
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
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
    </div>
  );
}
