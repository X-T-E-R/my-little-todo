import type { StreamEntry, StreamEntryType } from '@my-little-todo/core';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUp,
  Calendar,
  CheckSquare,
  ChevronRight,
  ClipboardCopy,
  ListPlus,
  Pencil,
  RefreshCw,
  Trash2,
  UserCircle,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoleStore } from '../stores';
import { ENTRY_TYPE_KEYS, ENTRY_TYPE_META } from '../utils/entryTypeUtils';

export interface ContextMenuAction {
  label: string;
  icon: React.FC<{ size?: number }>;
  action: () => void;
  danger?: boolean;
  dividerAfter?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  entry: StreamEntry;
  onClose: () => void;
  onEdit: () => void;
  onOpenDetail: () => void;
  onAddSubtask: () => void;
  onSetDdl: () => void;
  onChangeRole: (roleId: string | undefined) => void;
  onCopy: () => void;
  onDelete: () => void;
  onBatchSelect: () => void;
  onAddToThread?: () => void;
  onCreateThread?: () => void;
  onChangeType?: (type: StreamEntryType) => void;
  onMarkComplete?: () => void;
  isCompleted?: boolean;
  onSetParent?: () => void;
  onDoItNow?: () => void;
  onBoostPriority?: () => void;
}

export function ConfirmableDeleteItem({
  icon: Icon,
  label,
  confirmLabel,
  onConfirm,
}: {
  icon: React.FC<{ size?: number }>;
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleClick = useCallback(() => {
    if (confirming) {
      onConfirm();
    } else {
      setConfirming(true);
      timerRef.current = setTimeout(() => setConfirming(false), 3000);
    }
  }, [confirming, onConfirm]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--color-bg)] rounded-md"
      style={{ color: 'var(--color-danger)' }}
    >
      <Icon size={14} />
      {confirming ? confirmLabel : label}
    </button>
  );
}

function CascadeSubmenu({
  parentRef,
  children,
}: {
  parentRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const subRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  useEffect(() => {
    if (!parentRef.current) return;
    const rect = parentRef.current.getBoundingClientRect();
    let left = rect.right + 4;
    const top = rect.top;
    if (left + 180 > window.innerWidth) {
      left = rect.left - 184;
    }
    setPos({
      left: Math.max(4, left),
      top: Math.min(top, window.innerHeight - 250),
    });
  }, [parentRef]);

  return (
    <motion.div
      ref={subRef}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.12 }}
      className="fixed z-[101] rounded-xl p-1 shadow-xl"
      style={{
        left: pos.left,
        top: pos.top,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        minWidth: '160px',
      }}
    >
      {children}
    </motion.div>
  );
}

export function ContextMenu({
  x,
  y,
  entry,
  onClose,
  onEdit,
  onOpenDetail,
  onAddSubtask,
  onSetDdl,
  onChangeRole,
  onCopy,
  onDelete,
  onBatchSelect,
  onAddToThread,
  onCreateThread,
  onChangeType,
  onMarkComplete,
  isCompleted,
  onSetParent,
  onDoItNow,
  onBoostPriority,
}: ContextMenuProps) {
  const { t } = useTranslation('task');
  const { t: tStream } = useTranslation('stream');
  const [openSub, setOpenSub] = useState<'type' | 'role' | null>(null);
  const roles = useRoleStore((s) => s.roles);
  const menuRef = useRef<HTMLDivElement>(null);
  const typeRowRef = useRef<HTMLDivElement>(null);
  const roleRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - 350);

  const MenuItem = ({
    icon: Icon,
    label,
    onClick,
    danger,
  }: {
    icon: React.FC<{ size?: number }>;
    label: string;
    onClick: () => void;
    danger?: boolean;
  }) => (
    <button
      type="button"
      onClick={() => {
        onClick();
        onClose();
      }}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--color-bg)] rounded-md"
      style={{ color: danger ? 'var(--color-danger)' : 'var(--color-text)' }}
    >
      <Icon size={14} />
      {label}
    </button>
  );

  const SubMenuItem = ({
    icon: Icon,
    label,
    subKey,
    rowRef,
  }: {
    icon: React.FC<{ size?: number }>;
    label: string;
    subKey: 'type' | 'role';
    rowRef: React.RefObject<HTMLDivElement | null>;
  }) => (
    <div ref={rowRef}>
      <button
        type="button"
        onMouseEnter={() => setOpenSub(subKey)}
        onClick={() => setOpenSub(openSub === subKey ? null : subKey)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--color-bg)] rounded-md"
        style={{ color: 'var(--color-text)' }}
      >
        <Icon size={14} />
        <span className="flex-1">{label}</span>
        <ChevronRight size={12} style={{ color: 'var(--color-text-tertiary)' }} />
      </button>
    </div>
  );

  return (
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.1 }}
        className="fixed z-[100] rounded-xl p-1 shadow-xl"
        style={{
          left: adjustedX,
          top: adjustedY,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          minWidth: '180px',
        }}
        onMouseLeave={() => setOpenSub(null)}
      >
        <MenuItem icon={Pencil} label={t('Edit content')} onClick={onEdit} />
        <MenuItem icon={CheckSquare} label={t('Open detail')} onClick={onOpenDetail} />

        {(onDoItNow || onBoostPriority) && (
          <>
            <div className="my-1 mx-2" style={{ borderTop: '1px solid var(--color-border)' }} />
            {onDoItNow && <MenuItem icon={Zap} label={t('Do it now')} onClick={onDoItNow} />}
            {onBoostPriority && (
              <MenuItem icon={ArrowUp} label={t('Boost priority')} onClick={onBoostPriority} />
            )}
          </>
        )}

        <div className="my-1 mx-2" style={{ borderTop: '1px solid var(--color-border)' }} />

        <MenuItem icon={ListPlus} label={t('Add subtask')} onClick={onAddSubtask} />
        <MenuItem icon={Calendar} label={t('Set due date')} onClick={onSetDdl} />

        {onMarkComplete && (
          <MenuItem
            icon={CheckSquare}
            label={tStream(isCompleted ? 'Mark incomplete' : 'Mark complete')}
            onClick={onMarkComplete}
          />
        )}

        {onChangeType && (
          <SubMenuItem
            icon={RefreshCw}
            label={tStream('Change type')}
            subKey="type"
            rowRef={typeRowRef}
          />
        )}

        {roles.length > 0 && (
          <SubMenuItem
            icon={UserCircle}
            label={t('Switch role')}
            subKey="role"
            rowRef={roleRowRef}
          />
        )}

        {onSetParent && (
          <MenuItem icon={ListPlus} label={t('Set as subtask...')} onClick={onSetParent} />
        )}

        <div className="my-1 mx-2" style={{ borderTop: '1px solid var(--color-border)' }} />

        <MenuItem icon={ClipboardCopy} label={t('Copy content')} onClick={onCopy} />
        <MenuItem icon={CheckSquare} label={t('Batch select')} onClick={onBatchSelect} />
        {onAddToThread && (
          <MenuItem icon={ListPlus} label={tStream('Add to thread')} onClick={onAddToThread} />
        )}
        {onCreateThread && (
          <MenuItem
            icon={ListPlus}
            label={tStream('New thread from this')}
            onClick={onCreateThread}
          />
        )}

        <div className="my-1 mx-2" style={{ borderTop: '1px solid var(--color-border)' }} />

        <ConfirmableDeleteItem
          icon={Trash2}
          label={t('Delete')}
          confirmLabel={t('Confirm delete?')}
          onConfirm={() => {
            onDelete();
            onClose();
          }}
        />

        {/* Cascade submenus */}
        <AnimatePresence>
          {openSub === 'type' && onChangeType && (
            <CascadeSubmenu parentRef={typeRowRef}>
              {ENTRY_TYPE_KEYS.filter((k) => k !== entry.entryType).map((k) => {
                const meta = ENTRY_TYPE_META[k];
                const TypeIcon = meta.icon;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      onChangeType(k);
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--color-bg)] rounded-md"
                    style={{ color: 'var(--color-text)' }}
                  >
                    <TypeIcon size={13} />
                    {tStream(meta.labelKey)}
                  </button>
                );
              })}
            </CascadeSubmenu>
          )}
          {openSub === 'role' && (
            <CascadeSubmenu parentRef={roleRowRef}>
              <button
                type="button"
                onClick={() => {
                  onChangeRole(undefined);
                  onClose();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--color-bg)] rounded-md"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {t('No role')}
              </button>
              {roles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => {
                    onChangeRole(role.id);
                    onClose();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--color-bg)] rounded-md"
                  style={{ color: 'var(--color-text)' }}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: role.color ?? 'var(--color-accent)' }}
                  />
                  {role.name}
                </button>
              ))}
            </CascadeSubmenu>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
