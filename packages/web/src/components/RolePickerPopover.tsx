import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoleStore } from '../stores';

interface RolePickerPopoverProps {
  currentRoleId?: string;
  onSelect: (roleId: string | undefined) => void;
  onClose: () => void;
}

export function RolePickerPopover({ currentRoleId, onSelect, onClose }: RolePickerPopoverProps) {
  const { t } = useTranslation('role');
  const roles = useRoleStore((s) => s.roles);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 4, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.95 }}
      transition={{ duration: 0.12 }}
      className="absolute z-50 min-w-[140px] rounded-xl p-1 shadow-lg"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => {
          onSelect(undefined);
          onClose();
        }}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors"
        style={{
          color: !currentRoleId ? 'var(--color-accent)' : 'var(--color-text-secondary)',
          background: !currentRoleId ? 'var(--color-accent-soft)' : undefined,
        }}
      >
        <div
          className="h-3 w-3 rounded-full shrink-0"
          style={{ background: 'var(--color-text-tertiary)', opacity: 0.4 }}
        />
        {t('No role')}
      </button>
      {roles.map((role) => (
        <button
          key={role.id}
          type="button"
          onClick={() => {
            onSelect(role.id);
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors"
          style={{
            color:
              currentRoleId === role.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            background: currentRoleId === role.id ? 'var(--color-accent-soft)' : undefined,
          }}
        >
          <div
            className="h-3 w-3 rounded-full shrink-0"
            style={{ background: role.color ?? 'var(--color-accent)' }}
          />
          {role.name}
        </button>
      ))}
    </motion.div>
  );
}

interface RolePillProps {
  roleId?: string;
  onChangeRole: (roleId: string | undefined) => void;
  size?: 'sm' | 'md';
}

interface RoleMultiPickerPopoverProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
}

export function RoleMultiPickerPopover({
  selectedIds,
  onChange,
  onClose,
}: RoleMultiPickerPopoverProps) {
  const { t } = useTranslation('role');
  const roles = useRoleStore((s) => s.roles);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    onChange(next);
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 4, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.95 }}
      transition={{ duration: 0.12 }}
      className="absolute z-50 min-w-[180px] max-h-[240px] overflow-y-auto rounded-xl p-1 shadow-lg"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => {
          onChange([]);
          onClose();
        }}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors"
        style={{
          color: selectedIds.length === 0 ? 'var(--color-accent)' : 'var(--color-text-secondary)',
          background:
            selectedIds.length === 0 ? 'var(--color-accent-soft)' : undefined,
        }}
      >
        <div
          className="h-3 w-3 rounded-full shrink-0"
          style={{ background: 'var(--color-text-tertiary)', opacity: 0.4 }}
        />
        {t('No role')}
      </button>
      {roles.map((role) => {
        const sel = selectedIds.includes(role.id);
        return (
          <button
            key={role.id}
            type="button"
            onClick={() => toggle(role.id)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors"
            style={{
              color: sel ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              background: sel ? 'var(--color-accent-soft)' : undefined,
            }}
          >
            <span className="w-3 shrink-0 text-center">{sel ? '✓' : '○'}</span>
            <div
              className="h-3 w-3 rounded-full shrink-0"
              style={{ background: role.color ?? 'var(--color-accent)' }}
            />
            {role.name}
          </button>
        );
      })}
    </motion.div>
  );
}

interface RolePillMultiProps {
  roleIds: string[];
  onChangeRoleIds: (ids: string[]) => void;
  size?: 'sm' | 'md';
}

/** Multi-select role pill for tasks (primary display + optional +N). */
export function RolePillMulti({ roleIds, onChangeRoleIds, size = 'sm' }: RolePillMultiProps) {
  const { t } = useTranslation('role');
  const roles = useRoleStore((s) => s.roles);
  const [open, setOpen] = useState(false);

  if (roles.length === 0) return null;

  const firstResolved = roleIds.length
    ? roles.find((r) => r.id === roleIds[0])
    : undefined;
  const extra = Math.max(0, roleIds.length - 1);

  const fontSize = size === 'sm' ? 'text-[10px]' : 'text-xs';
  const dotSize = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium transition-colors max-w-[200px] ${fontSize}`}
        style={{
          background: firstResolved ? `${firstResolved.color}18` : 'var(--color-accent-soft)',
          color: firstResolved ? firstResolved.color : 'var(--color-text-tertiary)',
        }}
      >
        {roleIds.slice(0, 3).map((id) => {
          const r = roles.find((x) => x.id === id);
          return (
            <span
              key={id}
              className={`rounded-full shrink-0 ${dotSize}`}
              style={{ background: r?.color ?? 'var(--color-text-tertiary)' }}
            />
          );
        })}
        {firstResolved ? (
          <>
            <span className="truncate min-w-0">{firstResolved.name}</span>
            {extra > 0 && <span className="shrink-0 opacity-80">+{extra}</span>}
          </>
        ) : (
          <span>{t('No role')}</span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <RoleMultiPickerPopover
            selectedIds={roleIds}
            onChange={(ids) => onChangeRoleIds(ids)}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </span>
  );
}

export function RolePill({ roleId, onChangeRole, size = 'sm' }: RolePillProps) {
  const { t } = useTranslation('role');
  const roles = useRoleStore((s) => s.roles);
  const role = roleId ? roles.find((r) => r.id === roleId) : undefined;
  const [open, setOpen] = useState(false);

  if (roles.length === 0) return null;

  const fontSize = size === 'sm' ? 'text-[10px]' : 'text-xs';
  const dotSize = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium transition-colors ${fontSize}`}
        style={{
          background: role ? `${role.color}18` : 'var(--color-accent-soft)',
          color: role ? role.color : 'var(--color-text-tertiary)',
        }}
      >
        <span
          className={`rounded-full shrink-0 ${dotSize}`}
          style={{ background: role?.color ?? 'var(--color-text-tertiary)' }}
        />
        {role?.name ?? t('No role')}
      </button>
      <AnimatePresence>
        {open && (
          <RolePickerPopover
            currentRoleId={roleId}
            onSelect={onChangeRole}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </span>
  );
}
