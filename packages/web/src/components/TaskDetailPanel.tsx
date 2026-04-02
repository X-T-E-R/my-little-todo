import type { Task, TaskPhase, TaskReminder, TaskResource, TaskStatus } from '@my-little-todo/core';
import {
  TASK_PHASE_ORDER,
  daysUntil,
  estimateTaskProgress,
  generateId,
  isOverdue,
} from '@my-little-todo/core';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Calendar,
  Check,
  ChevronRight,
  ExternalLink,
  Eye,
  FileText,
  Lightbulb,
  Link2,
  PenLine,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStreamStore, useTaskStore } from '../stores';
import { useIsMobile } from '../utils/useIsMobile';
import { MarkdownPreview } from './MarkdownPreview';
import { MarkdownToolbar } from './MarkdownToolbar';
import { ProgressRing } from './ProgressRing';
import { RolePill } from './RolePickerPopover';
import { SmartDatePicker } from './SmartDatePicker';

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'active', label: 'Active' },
  { value: 'today', label: 'Do Today' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

const DDL_TYPE_OPTIONS = [
  { value: 'hard', label: 'Hard' },
  { value: 'commitment', label: 'Commitment' },
  { value: 'soft', label: 'Flexible' },
] as const;

function BodyEditor({ body, onChange }: { body: string; onChange: (body: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const { t } = useTranslation('task');

  const resize = () => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = `${Math.max(ref.current.scrollHeight, 80)}px`;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: auto-resize on body change
  useEffect(resize, [body]);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* Edit / Preview toggle */}
      <div className="flex items-center gap-1 px-2 pt-1.5">
        <button
          type="button"
          onClick={() => setPreview(false)}
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors"
          style={{
            background: !preview ? 'var(--color-accent-soft)' : 'transparent',
            color: !preview ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
          }}
        >
          <PenLine size={11} />
          {t('Edit')}
        </button>
        <button
          type="button"
          onClick={() => setPreview(true)}
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors"
          style={{
            background: preview ? 'var(--color-accent-soft)' : 'transparent',
            color: preview ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
          }}
        >
          <Eye size={11} />
          {t('Preview')}
        </button>
      </div>

      {preview ? (
        <div className="px-3 py-2.5" style={{ minHeight: '80px' }}>
          <MarkdownPreview content={body} className="text-[13px]" />
        </div>
      ) : (
        <>
          <MarkdownToolbar textareaRef={ref} />
          <textarea
            ref={ref}
            value={body}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('Write notes, ideas, checklists... supports Markdown')}
            className="w-full resize-none px-3 py-2.5 text-[13px] leading-relaxed outline-none bg-transparent"
            style={{
              color: 'var(--color-text)',
              minHeight: '80px',
            }}
          />
        </>
      )}
    </div>
  );
}

function subtaskDdlLabel(
  ddl: Date,
  t: (key: string, opts?: Record<string, unknown>) => string,
): { text: string; urgent: boolean; overdue: boolean } {
  const now = new Date();
  if (isOverdue(ddl, now)) return { text: t('Overdue'), urgent: true, overdue: true };
  const days = daysUntil(ddl, now);
  if (days <= 1) return { text: t('Tomorrow'), urgent: true, overdue: false };
  if (days <= 2) return { text: t('In {{days}} days', { days }), urgent: true, overdue: false };
  return { text: `${ddl.getMonth() + 1}/${ddl.getDate()}`, urgent: false, overdue: false };
}

function SubtaskRow({
  subtask,
  depth,
  onToggle,
  onExtract,
  onPromote,
  onOpen,
}: {
  subtask: Task;
  depth?: number;
  onToggle: () => void;
  onExtract: () => void;
  onPromote: () => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation('task');
  const done = subtask.status === 'completed';
  const isMultiLine = subtask.title.includes('\n');
  const ddlInfo = subtask.ddl && !done ? subtaskDdlLabel(subtask.ddl, t) : null;
  const isPromoted = !!subtask.promoted;
  const d = depth ?? 0;

  return (
    <div
      className="group flex items-start gap-2 rounded-lg py-1.5 transition-colors hover:bg-[var(--color-bg)] relative"
      style={{
        paddingLeft: `${8 + d * 16}px`,
        paddingRight: 8,
        background: ddlInfo?.overdue
          ? 'var(--color-danger-soft)'
          : isPromoted
            ? 'var(--color-accent-soft)'
            : undefined,
        borderLeft: ddlInfo?.overdue
          ? '2px solid var(--color-danger)'
          : isPromoted
            ? '2px solid var(--color-accent)'
            : '2px solid transparent',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex shrink-0 items-center justify-center rounded border transition-colors mt-0.5"
        style={{
          width: d > 0 ? 14 : 16,
          height: d > 0 ? 14 : 16,
          borderColor: done ? 'var(--color-success)' : 'var(--color-border)',
          background: done ? 'var(--color-success)' : 'transparent',
        }}
      >
        {done && <Check size={d > 0 ? 8 : 10} className="text-white" />}
      </button>
      <button
        type="button"
        onClick={onOpen}
        className={`flex-1 text-left ${d > 0 ? 'text-[12px]' : 'text-[13px]'} ${isMultiLine ? 'whitespace-pre-wrap line-clamp-3' : 'truncate'}`}
        style={{
          color: done
            ? 'var(--color-text-tertiary)'
            : d > 0
              ? 'var(--color-text-secondary)'
              : 'var(--color-text)',
          textDecoration: done ? 'line-through' : 'none',
        }}
      >
        {subtask.title}
        {isPromoted && (
          <span
            className="ml-1 inline-flex items-center rounded-full px-1 py-0 text-[9px] font-medium"
            style={{ background: 'var(--color-accent)', color: 'white' }}
          >
            {t('Independent')}
          </span>
        )}
      </button>
      {ddlInfo && (
        <span
          className="inline-flex items-center gap-1 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium mt-0.5"
          style={{
            background: ddlInfo.overdue
              ? 'var(--color-danger-soft)'
              : ddlInfo.urgent
                ? 'var(--color-warning-soft)'
                : 'var(--color-bg)',
            color: ddlInfo.overdue
              ? 'var(--color-danger)'
              : ddlInfo.urgent
                ? 'var(--color-warning)'
                : 'var(--color-text-tertiary)',
            fontWeight: ddlInfo.urgent ? 600 : 500,
          }}
        >
          <Calendar size={9} />
          {ddlInfo.text}
        </span>
      )}
      {d === 0 && (
        <>
          <button
            type="button"
            onClick={onPromote}
            title={isPromoted ? t('Demote to subtask') : t('Mark as independent task')}
            className="opacity-0 group-hover:opacity-100 rounded p-0.5 transition-opacity mt-0.5"
            style={{ color: isPromoted ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
          >
            <Eye size={12} />
          </button>
          <button
            type="button"
            onClick={onExtract}
            title={t('Extract as independent task')}
            className="opacity-0 group-hover:opacity-100 rounded p-0.5 transition-opacity mt-0.5"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <ExternalLink size={12} />
          </button>
        </>
      )}
    </div>
  );
}

function SubtaskTree({
  subtaskIds,
  tasks,
  depth,
  maxDepth,
  onToggle,
  onExtract,
  onPromote,
  onOpen,
}: {
  subtaskIds: string[];
  tasks: Task[];
  depth: number;
  maxDepth: number;
  onToggle: (sub: Task) => void;
  onExtract: (id: string) => void;
  onPromote: (id: string, promoted: boolean) => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation('task');
  const resolved = subtaskIds
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is Task => t !== undefined);

  if (resolved.length === 0) return null;

  return (
    <>
      {resolved.map((sub) => {
        const childIds = sub.subtaskIds ?? [];
        const showChildren = depth < maxDepth && childIds.length > 0;
        const truncatedCount = depth >= maxDepth ? childIds.length : 0;

        return (
          <div key={sub.id}>
            <SubtaskRow
              subtask={sub}
              depth={depth}
              onToggle={() => onToggle(sub)}
              onExtract={() => onExtract(sub.id)}
              onPromote={() => onPromote(sub.id, !sub.promoted)}
              onOpen={() => onOpen(sub.id)}
            />
            {showChildren && (
              <SubtaskTree
                subtaskIds={childIds}
                tasks={tasks}
                depth={depth + 1}
                maxDepth={maxDepth}
                onToggle={onToggle}
                onExtract={onExtract}
                onPromote={onPromote}
                onOpen={onOpen}
              />
            )}
            {truncatedCount > 0 && (
              <button
                type="button"
                onClick={() => onOpen(sub.id)}
                className="text-[11px] py-0.5 hover:underline"
                style={{
                  paddingLeft: `${8 + (depth + 1) * 16}px`,
                  color: 'var(--color-text-tertiary)',
                }}
              >
                +{truncatedCount} {t('Subtasks').toLowerCase()}...
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

function AddSubtaskInput({ onAdd }: { onAdd: (title: string) => void }) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const { t } = useTranslation('task');

  const resize = () => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  };

  return (
    <div className="flex items-start gap-2 px-2 py-1">
      <Plus size={14} className="mt-1 shrink-0" style={{ color: 'var(--color-text-tertiary)' }} />
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          resize();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && value.trim()) {
            e.preventDefault();
            onAdd(value.trim());
            setValue('');
            if (ref.current) ref.current.style.height = 'auto';
          }
        }}
        placeholder={t('Add subtask... (Shift+Enter for newline)')}
        rows={1}
        className="flex-1 bg-transparent text-[13px] outline-none resize-none leading-relaxed"
        style={{ color: 'var(--color-text)' }}
      />
    </div>
  );
}

function ResourcesSection({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: (t: Task) => void;
}) {
  const [inputValue, setInputValue] = useState('');
  const resources = task.resources ?? [];
  const { t } = useTranslation('task');

  const handleAdd = () => {
    const val = inputValue.trim();
    if (!val) return;
    const isUrl = /^https?:\/\//.test(val);
    const newRes: TaskResource = {
      type: isUrl ? 'link' : 'note',
      url: isUrl ? val : undefined,
      title: isUrl ? new URL(val).hostname : val,
      addedAt: new Date(),
    };
    onUpdate({ ...task, resources: [...resources, newRes] });
    setInputValue('');
  };

  const handleRemove = (idx: number) => {
    onUpdate({ ...task, resources: resources.filter((_, i) => i !== idx) });
  };

  return (
    <div>
      <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
        {t('Related materials')}
        {resources.length > 0 && <span className="ml-1">({resources.length})</span>}
      </p>
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--color-border)' }}
      >
        {resources.map((r, i) => (
          <div
            key={`res-${r.addedAt.getTime?.() ?? i}-${i}`}
            className="group flex items-center gap-2 px-3 py-2 hover:bg-[var(--color-bg)] transition-colors"
          >
            {r.type === 'link' ? (
              <Link2 size={12} style={{ color: 'var(--color-accent)' }} />
            ) : (
              <FileText size={12} style={{ color: 'var(--color-text-tertiary)' }} />
            )}
            {r.url ? (
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-[12px] truncate"
                style={{ color: 'var(--color-accent)' }}
              >
                {r.title}
              </a>
            ) : (
              <span className="flex-1 text-[12px] truncate" style={{ color: 'var(--color-text)' }}>
                {r.title}
              </span>
            )}
            <button
              type="button"
              onClick={() => handleRemove(i)}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <X size={10} />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 px-3 py-1.5">
          <Plus size={12} style={{ color: 'var(--color-text-tertiary)' }} />
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
            placeholder={t('Paste link or enter note...')}
            className="flex-1 bg-transparent text-[12px] outline-none"
            style={{ color: 'var(--color-text)' }}
          />
        </div>
      </div>
    </div>
  );
}

function RemindersSection({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: (t: Task) => void;
}) {
  const reminders = task.reminders ?? [];
  const [showCustom, setShowCustom] = useState(false);
  const [customDateTime, setCustomDateTime] = useState('');
  const { t } = useTranslation('task');

  const addReminder = (time: Date, label?: string) => {
    const newReminder: TaskReminder = {
      id: generateId('rem'),
      time,
      notified: false,
      label,
    };
    onUpdate({ ...task, reminders: [...reminders, newReminder] });
  };

  const removeReminder = (id: string) => {
    onUpdate({ ...task, reminders: reminders.filter((r) => r.id !== id) });
  };

  const quickOptions = task.ddl
    ? [
        {
          label: t('1 hour before DDL'),
          time: new Date(task.ddl.getTime() - 3600000),
        },
        {
          label: t('1 day before DDL'),
          time: new Date(task.ddl.getTime() - 86400000),
        },
      ]
    : [];

  return (
    <div>
      <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
        <Bell size={11} className="inline mr-1" />
        {t('Reminders')}
        {reminders.length > 0 && <span className="ml-1">({reminders.length})</span>}
      </p>
      <div className="space-y-1.5">
        {reminders.map((r) => (
          <div
            key={r.id}
            className="group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px]"
            style={{
              background: r.notified ? 'var(--color-bg)' : 'var(--color-warning-soft)',
              color: r.notified ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
            }}
          >
            <Bell
              size={10}
              style={{ color: r.notified ? 'var(--color-text-tertiary)' : 'var(--color-warning)' }}
            />
            <span className="flex-1">
              {r.time.getMonth() + 1}/{r.time.getDate()}{' '}
              {String(r.time.getHours()).padStart(2, '0')}:
              {String(r.time.getMinutes()).padStart(2, '0')}
              {r.label && ` · ${r.label}`}
              {r.notified && ` (${t('Notified')})`}
            </span>
            <button
              type="button"
              onClick={() => removeReminder(r.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <X size={10} />
            </button>
          </div>
        ))}
        <div className="flex flex-wrap gap-1.5">
          {quickOptions
            .filter((opt) => opt.time.getTime() > Date.now())
            .map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => addReminder(opt.time, opt.label)}
                className="rounded-md px-2 py-1 text-[10px] font-medium transition-colors"
                style={{
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                + {opt.label}
              </button>
            ))}
          <button
            type="button"
            onClick={() => setShowCustom(!showCustom)}
            className="rounded-md px-2 py-1 text-[10px] font-medium transition-colors"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-tertiary)',
            }}
          >
            + {t('Custom')}
          </button>
        </div>
        {showCustom && (
          <div className="flex items-center gap-2 mt-1">
            <input
              type="datetime-local"
              value={customDateTime}
              onChange={(e) => setCustomDateTime(e.target.value)}
              className="flex-1 rounded-lg px-2 py-1 text-[11px] outline-none"
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (customDateTime) {
                  addReminder(new Date(customDateTime));
                  setCustomDateTime('');
                  setShowCustom(false);
                }
              }}
              className="rounded-lg px-2 py-1 text-[10px] font-semibold text-white"
              style={{ background: 'var(--color-accent)' }}
            >
              {t('Add')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex panel with many interaction states
export function TaskDetailPanel() {
  const {
    tasks,
    selectedTaskId,
    selectTask,
    updateTask,
    deleteTask,
    addSubtask,
    extractSubtask,
    promoteSubtask,
    updateStatus,
  } = useTaskStore();

  const isMobile = useIsMobile();
  const task = tasks.find((t) => t.id === selectedTaskId);
  const { t } = useTranslation('task');

  const [localBody, setLocalBody] = useState('');
  const [localTitle, setLocalTitle] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bodyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTaskRef = useRef<{ id: string; body: string } | null>(null);
  const streamEntries = useStreamStore((s) => s.entries);

  const flushPendingBody = useRef(() => {
    if (bodyTimerRef.current) {
      clearTimeout(bodyTimerRef.current);
      bodyTimerRef.current = null;
    }
    if (pendingTaskRef.current) {
      const { id, body } = pendingTaskRef.current;
      pendingTaskRef.current = null;
      const t = useTaskStore.getState().tasks.find((x) => x.id === id);
      if (t && t.body !== body) {
        useTaskStore.getState().updateTask({ ...t, body });
      }
    }
  });

  const taskId = task?.id;

  useEffect(() => {
    flushPendingBody.current();
    if (!taskId) return;
    const t = tasks.find((x) => x.id === taskId);
    if (t) {
      setLocalTitle(t.title);
      setLocalBody(t.body);
      setConfirmDelete(false);
    }
  }, [taskId]);

  if (!task) return null;

  const subtasks = (task.subtaskIds ?? [])
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is Task => t !== undefined);

  const handleBodyChange = (body: string) => {
    setLocalBody(body);
    pendingTaskRef.current = { id: task.id, body };
    if (bodyTimerRef.current) clearTimeout(bodyTimerRef.current);
    bodyTimerRef.current = setTimeout(() => {
      if (pendingTaskRef.current?.id === task.id) {
        const current = useTaskStore.getState().tasks.find((x) => x.id === task.id);
        if (current && current.body !== body) {
          updateTask({ ...current, body });
        }
        pendingTaskRef.current = null;
      }
    }, 500);
  };

  const handleTitleBlur = () => {
    if (localTitle.trim() && localTitle !== task.title) {
      updateTask({ ...task, title: localTitle.trim() });
    }
  };

  const handleToggleSubtask = async (sub: Task) => {
    const newStatus: TaskStatus = sub.status === 'completed' ? 'active' : 'completed';
    await updateStatus(sub.id, newStatus);
  };

  const handleAddSubtask = async (title: string) => {
    await addSubtask(task.id, title);
  };

  const handleExtractSubtask = async (subtaskId: string) => {
    await extractSubtask(subtaskId);
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await deleteTask(task.id);
    selectTask(null);
  };

  return (
    <AnimatePresence mode="wait">
      {selectedTaskId && (
        <>
          <motion.div
            key={`overlay-${selectedTaskId}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/20"
            onClick={() => selectTask(null)}
          />
          <motion.div
            key={`panel-${selectedTaskId}`}
            initial={isMobile ? { y: '100%' } : { x: '100%' }}
            animate={isMobile ? { y: 0 } : { x: 0 }}
            exit={isMobile ? { y: '100%' } : { x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag={isMobile ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_e, info) => {
              if (isMobile && info.offset.y > 100) selectTask(null);
            }}
            className={`fixed z-50 overflow-y-auto shadow-2xl ${
              isMobile ? 'inset-x-0 bottom-0 top-[10%]' : 'right-0 top-0 bottom-0 w-full max-w-md'
            }`}
            style={{
              background: 'var(--color-surface)',
              borderLeft: isMobile ? 'none' : '1px solid var(--color-border)',
              borderTopLeftRadius: isMobile ? '24px' : '0',
              borderTopRightRadius: isMobile ? '24px' : '0',
              paddingBottom: isMobile ? 'var(--safe-area-bottom)' : undefined,
            }}
          >
            {/* Header */}
            <div
              className="sticky top-0 z-20 flex flex-col px-5 py-3"
              style={{
                background: 'var(--color-surface)',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              {/* Drag handle for mobile */}
              {isMobile && (
                <div className="flex justify-center mb-3">
                  <div
                    className="w-12 h-1.5 rounded-full"
                    style={{ background: 'var(--color-border-hover)' }}
                  />
                </div>
              )}
              <div className="flex items-center justify-between">
                <span
                  className="text-xs font-medium"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {t('Task Detail')}
                </span>
                <button
                  type="button"
                  onClick={() => selectTask(null)}
                  aria-label={t('Close')}
                  className="rounded-lg p-1"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="px-5 py-4 space-y-5">
              {/* Title */}
              <input
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                onBlur={handleTitleBlur}
                className="w-full bg-transparent text-xl font-bold outline-none"
                style={{ color: 'var(--color-text)' }}
              />

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-2">
                <RolePill
                  roleId={task.roleId}
                  onChangeRole={(newRoleId) => updateTask({ ...task, roleId: newRoleId })}
                  size="md"
                />
                <select
                  value={task.status}
                  onChange={(e) => updateStatus(task.id, e.target.value as TaskStatus)}
                  className="rounded-lg px-2 py-1 text-xs font-medium outline-none"
                  style={{
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.label)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Phase & progress (ADHD coaching) */}
              <div
                className="flex flex-wrap items-center gap-3 rounded-xl p-3"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
              >
                <ProgressRing progress={estimateTaskProgress(task, tasks)} size={40} stroke={3} />
                <div className="flex-1 min-w-[140px]">
                  <label
                    className="text-[10px] font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {t('Phase')}
                  </label>
                  <select
                    value={task.phase ?? 'understood'}
                    onChange={(e) => updateTask({ ...task, phase: e.target.value as TaskPhase })}
                    className="mt-1 w-full rounded-lg px-2 py-1.5 text-xs font-medium outline-none"
                    style={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  >
                    {TASK_PHASE_ORDER.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Planned At */}
              <SmartDatePicker
                label={t('Planned time')}
                value={task.plannedAt}
                onChange={(d) => updateTask({ ...task, plannedAt: d })}
                accent="var(--color-accent)"
              />

              {/* DDL */}
              <div className="space-y-2">
                <SmartDatePicker
                  label={t('Due date')}
                  value={task.ddl}
                  onChange={(d) => updateTask({ ...task, ddl: d })}
                  accent="var(--color-warning, #ca8a04)"
                />
                {task.ddl && (
                  <div className="flex gap-1 ml-0.5">
                    {DDL_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => updateTask({ ...task, ddlType: opt.value })}
                        className="rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors"
                        style={{
                          background:
                            task.ddlType === opt.value
                              ? 'var(--color-accent-soft)'
                              : 'var(--color-bg)',
                          color:
                            task.ddlType === opt.value
                              ? 'var(--color-accent)'
                              : 'var(--color-text-tertiary)',
                          border: '1px solid var(--color-border)',
                        }}
                      >
                        {t(opt.label)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Tags */}
              {task.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {task.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        background: 'var(--color-accent-soft)',
                        color: 'var(--color-accent)',
                      }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Body */}
              <div>
                <p
                  className="text-xs font-medium mb-2"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {t('Content')}
                </p>
                <BodyEditor body={localBody} onChange={handleBodyChange} />
              </div>

              {/* Subtasks */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p
                    className="text-xs font-medium"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {t('Subtasks')}
                    {subtasks.length > 0 && (
                      <span className="ml-1">
                        ({subtasks.filter((s) => s.status === 'completed').length}/{subtasks.length}
                        )
                      </span>
                    )}
                  </p>
                </div>
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ border: '1px solid var(--color-border)' }}
                >
                  <SubtaskTree
                    subtaskIds={task.subtaskIds ?? []}
                    tasks={tasks}
                    depth={0}
                    maxDepth={2}
                    onToggle={handleToggleSubtask}
                    onExtract={handleExtractSubtask}
                    onPromote={(id, promoted) => promoteSubtask(id, promoted)}
                    onOpen={(id) => {
                      flushPendingBody.current();
                      selectTask(id);
                    }}
                  />
                  <AddSubtaskInput onAdd={handleAddSubtask} />
                </div>
              </div>

              {/* Resources */}
              <ResourcesSection task={task} onUpdate={updateTask} />

              {/* Reminders */}
              <RemindersSection task={task} onUpdate={updateTask} />

              {/* History */}
              {(task.postponements.length > 0 ||
                task.submissions.length > 0 ||
                (task.statusHistory ?? []).length > 0) && (
                <div>
                  <p
                    className="text-xs font-medium mb-2"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {t('History')}
                  </p>
                  <div className="space-y-1.5">
                    {(task.statusHistory ?? []).map((h, i) => (
                      <div
                        key={`sh-${h.timestamp.getTime()}-${i}`}
                        className="flex items-start gap-2 text-[11px]"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        <ArrowRight
                          size={12}
                          className="shrink-0 mt-0.5"
                          style={{ color: 'var(--color-accent)' }}
                        />
                        <span>
                          {h.from} → {h.to}
                          <span className="ml-1" style={{ color: 'var(--color-text-tertiary)' }}>
                            {h.timestamp.toLocaleDateString()}{' '}
                            {h.timestamp.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </span>
                      </div>
                    ))}
                    {task.postponements.map((p, i) => (
                      <div
                        key={`post-${p.timestamp.getTime()}-${i}`}
                        className="flex items-start gap-2 text-[11px]"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        <AlertCircle
                          size={12}
                          className="shrink-0 mt-0.5"
                          style={{ color: 'var(--color-warning)' }}
                        />
                        <span>
                          {t('Postponed')} {p.fromDate.getMonth() + 1}/{p.fromDate.getDate()} →{' '}
                          {p.toDate.getMonth() + 1}/{p.toDate.getDate()}：{p.reason}
                        </span>
                      </div>
                    ))}
                    {task.submissions.map((s, i) => (
                      <div
                        key={`sub-${s.timestamp.getTime()}-${i}`}
                        className="flex items-start gap-2 text-[11px]"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        <Check
                          size={12}
                          className="shrink-0 mt-0.5"
                          style={{ color: 'var(--color-success)' }}
                        />
                        <span>
                          {s.onTime
                            ? t('On time')
                            : t('Late {{days}} days', { days: s.daysLate ?? '?' })}{' '}
                          · {s.note}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Source spark link */}
              {task.sourceStreamId &&
                (() => {
                  const source = streamEntries.find((e) => e.id === task.sourceStreamId);
                  return source ? (
                    <div
                      className="flex items-center gap-1.5 text-xs"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      <Lightbulb size={12} />
                      {t('From spark')}：
                      <span
                        className="truncate max-w-[200px]"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {source.content.slice(0, 50)}
                      </span>
                    </div>
                  ) : null;
                })()}

              {/* Parent link */}
              {task.parentId && (
                <button
                  type="button"
                  onClick={() => {
                    flushPendingBody.current();
                    if (task.parentId) selectTask(task.parentId);
                  }}
                  className="flex items-center gap-1 text-xs font-medium"
                  style={{ color: 'var(--color-accent)' }}
                >
                  <ChevronRight size={12} />
                  {t('View parent task')}
                </button>
              )}

              {/* Actions */}
              <div
                className="pt-4 flex items-center gap-3"
                style={{ borderTop: '1px solid var(--color-border)' }}
              >
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    color: confirmDelete ? 'white' : 'var(--color-danger)',
                    background: confirmDelete ? 'var(--color-danger)' : 'transparent',
                    border: `1px solid ${confirmDelete ? 'var(--color-danger)' : 'var(--color-border)'}`,
                  }}
                >
                  <Trash2 size={12} />
                  {confirmDelete ? t('Confirm delete') : t('Delete')}
                </button>
                {confirmDelete && (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs font-medium"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {t('Cancel')}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
