import type { Task } from '@my-little-todo/core';
import { displayTaskTitle } from '@my-little-todo/core';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Archive,
  ArrowUp,
  Calendar,
  CheckCircle,
  ChevronRight,
  ClipboardCopy,
  Eye,
  EyeOff,
  ListPlus,
  Pencil,
  Trash2,
  UserCircle,
  Zap,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoleStore } from '../stores';
import { getViewport, positionCascadeMenu, positionContextMenu } from '../utils/menuPosition';
import { ConfirmableDeleteItem } from './ContextMenu';

interface TaskContextMenuProps {
  x: number;
  y: number;
  task: Task;
  onClose: () => void;
  onOpenDetail: () => void;
  onAddSubtask: () => void;
  onSetDdl: () => void;
  onChangeRole: (roleId: string | undefined) => void;
  onComplete: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onPromote?: () => void;
  onSetParent?: () => void;
  /** Jump to Now with this task as the focus target */
  onDoItNow?: () => void;
  /** Raise priority / mark for today */
  onBoostPriority?: () => void;
}

function CascadeSubmenu({
  submenuRef,
  parentRef,
  children,
}: {
  submenuRef: React.RefObject<HTMLDivElement | null>;
  parentRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number }>({
    left: 0,
    top: 0,
    maxHeight: Math.max(160, window.innerHeight - 16),
  });

  useLayoutEffect(() => {
    if (!parentRef.current || !submenuRef.current) return;
    const rect = parentRef.current.getBoundingClientRect();
    setPos(
      positionCascadeMenu(
        rect,
        {
          width: submenuRef.current.offsetWidth,
          height: submenuRef.current.offsetHeight,
        },
        getViewport(),
      ),
    );
  }, [parentRef]);

  return (
    <motion.div
      ref={submenuRef}
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
        maxHeight: `${pos.maxHeight}px`,
        overflowY: 'auto',
      }}
    >
      {children}
    </motion.div>
  );
}

export function TaskContextMenu({
  x,
  y,
  task,
  onClose,
  onOpenDetail,
  onAddSubtask,
  onSetDdl,
  onChangeRole,
  onComplete,
  onArchive,
  onDelete,
  onPromote,
  onSetParent,
  onDoItNow,
  onBoostPriority,
}: TaskContextMenuProps) {
  const { t } = useTranslation('task');
  const [openSub, setOpenSub] = useState<'role' | null>(null);
  const roles = useRoleStore((s) => s.roles);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const roleRowRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<{
    left: number;
    top: number;
    maxHeight: number;
  }>({
    left: x,
    top: y,
    maxHeight: Math.max(160, window.innerHeight - 16),
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        !submenuRef.current?.contains(target)
      ) {
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

  useLayoutEffect(() => {
    if (!menuRef.current) return;
    setMenuStyle(
      positionContextMenu(
        { x, y },
        {
          width: menuRef.current.offsetWidth,
          height: menuRef.current.offsetHeight,
        },
        getViewport(),
      ),
    );
  }, [x, y, openSub, task.id]);

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

  const isCompleted = task.status === 'completed';

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
          left: menuStyle.left,
          top: menuStyle.top,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          minWidth: '180px',
          maxHeight: `${menuStyle.maxHeight}px`,
          overflowY: 'auto',
        }}
        onMouseLeave={() => setOpenSub(null)}
      >
        <MenuItem icon={Pencil} label={t('Edit detail')} onClick={onOpenDetail} />

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

        {roles.length > 0 && (
          <div ref={roleRowRef}>
            <button
              type="button"
              onMouseEnter={() => setOpenSub('role')}
              onClick={() => setOpenSub(openSub === 'role' ? null : 'role')}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--color-bg)] rounded-md"
              style={{ color: 'var(--color-text)' }}
            >
              <UserCircle size={14} />
              <span className="flex-1">{t('Switch role')}</span>
              <ChevronRight size={12} style={{ color: 'var(--color-text-tertiary)' }} />
            </button>
          </div>
        )}

        <div className="my-1 mx-2" style={{ borderTop: '1px solid var(--color-border)' }} />

        <MenuItem
          icon={CheckCircle}
          label={isCompleted ? t('Mark incomplete') : t('Mark complete')}
          onClick={onComplete}
        />
        {onPromote && task.parentId && (
          <MenuItem
            icon={task.promoted ? EyeOff : Eye}
            label={task.promoted ? t('Demote to subtask') : t('Mark as independent task')}
            onClick={onPromote}
          />
        )}
        {onSetParent && (
          <MenuItem icon={ListPlus} label={t('Set as subtask...')} onClick={onSetParent} />
        )}
        <MenuItem icon={Archive} label={t('Archive')} onClick={onArchive} />
        <MenuItem
          icon={ClipboardCopy}
          label={t('Copy title')}
          onClick={() => navigator.clipboard.writeText(displayTaskTitle(task))}
        />

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

        <AnimatePresence>
          {openSub === 'role' && (
            <CascadeSubmenu submenuRef={submenuRef} parentRef={roleRowRef}>
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
