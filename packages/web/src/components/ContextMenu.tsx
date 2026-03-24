import type { StreamEntry, StreamEntryType } from '@my-little-todo/core';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Calendar,
  CheckSquare,
  ClipboardCopy,
  ListPlus,
  Pencil,
  RefreshCw,
  Trash2,
  UserCircle,
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
  onChangeType?: (type: StreamEntryType) => void;
  onMarkComplete?: () => void;
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
  onChangeType,
  onMarkComplete,
}: ContextMenuProps) {
  const { t } = useTranslation('task');
  const { t: tStream } = useTranslation('stream');
  const [roleSubmenu, setRoleSubmenu] = useState(false);
  const [typeSubmenu, setTypeSubmenu] = useState(false);
  const roles = useRoleStore((s) => s.roles);
  const menuRef = useRef<HTMLDivElement>(null);

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
      >
        <MenuItem icon={Pencil} label={t('Edit content')} onClick={onEdit} />
        <MenuItem icon={CheckSquare} label={t('Open detail')} onClick={onOpenDetail} />

        <div className="my-1 mx-2" style={{ borderTop: '1px solid var(--color-border)' }} />

        <MenuItem icon={ListPlus} label={t('Add subtask')} onClick={onAddSubtask} />
        <MenuItem icon={Calendar} label={t('Set due date')} onClick={onSetDdl} />

        {onMarkComplete && (
          <MenuItem icon={CheckSquare} label={tStream('Mark complete')} onClick={onMarkComplete} />
        )}

        {onChangeType && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setTypeSubmenu(!typeSubmenu)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--color-bg)] rounded-md"
              style={{ color: 'var(--color-text)' }}
            >
              <RefreshCw size={14} />
              <span className="flex-1">{tStream('Change type')}</span>
              <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {typeSubmenu ? '▲' : '▼'}
              </span>
            </button>
            {typeSubmenu && (
              <div className="ml-5 py-0.5">
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
                      className="flex w-full items-center gap-2 px-2 py-1 text-left text-[12px] transition-colors hover:bg-[var(--color-bg)] rounded-md"
                      style={{ color: 'var(--color-text)' }}
                    >
                      <TypeIcon size={12} />
                      {tStream(meta.labelKey)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Role submenu */}
        {roles.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setRoleSubmenu(!roleSubmenu)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--color-bg)] rounded-md"
              style={{ color: 'var(--color-text)' }}
            >
              <UserCircle size={14} />
              <span className="flex-1">{t('Switch role')}</span>
              <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {roleSubmenu ? '▲' : '▼'}
              </span>
            </button>
            {roleSubmenu && (
              <div className="ml-5 py-0.5">
                <button
                  type="button"
                  onClick={() => {
                    onChangeRole(undefined);
                    onClose();
                  }}
                  className="flex w-full items-center gap-2 px-2 py-1 text-left text-[12px] transition-colors hover:bg-[var(--color-bg)] rounded-md"
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
                    className="flex w-full items-center gap-2 px-2 py-1 text-left text-[12px] transition-colors hover:bg-[var(--color-bg)] rounded-md"
                    style={{ color: 'var(--color-text)' }}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ background: role.color ?? 'var(--color-accent)' }}
                    />
                    {role.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="my-1 mx-2" style={{ borderTop: '1px solid var(--color-border)' }} />

        <MenuItem icon={ClipboardCopy} label={t('Copy content')} onClick={onCopy} />
        <MenuItem icon={CheckSquare} label={t('Batch select')} onClick={onBatchSelect} />

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
      </motion.div>
    </AnimatePresence>
  );
}
