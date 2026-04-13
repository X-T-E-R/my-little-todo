import { motion } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useRoleStore } from '../stores';

interface RolePickerPopoverProps {
  currentRoleId?: string;
  onSelect: (roleId: string | undefined) => void;
  onClose: () => void;
  /** Anchor for fixed positioning (portal); avoids parent overflow clipping */
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function RolePickerPopover({
  currentRoleId,
  onSelect,
  onClose,
  anchorRef,
}: RolePickerPopoverProps) {
  const { t } = useTranslation('role');
  const roles = useRoleStore((s) => s.roles);
  const ref = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const minW = 140;
    const maxH = 240;
    const width = Math.max(rect.width, minW);
    let left = rect.left;
    let top = rect.bottom + 4;
    if (left + width > vw - 8) left = Math.max(8, vw - 8 - width);
    if (left < 8) left = 8;
    // Prefer below; flip above if not enough room
    const estHeight = Math.min(roles.length * 40 + 48, maxH);
    if (top + estHeight > vh - 8 && rect.top > estHeight + 8) {
      top = rect.top - 4 - estHeight;
    }
    setPopoverStyle({
      position: 'fixed',
      top,
      left,
      minWidth: minW,
      width,
      maxHeight: maxH,
      zIndex: 9999,
    });
  }, [anchorRef, roles.length]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);

  useEffect(() => {
    const onScroll = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [updatePosition]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchorRef]);

  const popover = (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 4, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.12 }}
      className="max-h-[240px] overflow-y-auto rounded-xl p-1 shadow-lg"
      style={{
        ...popoverStyle,
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

  if (typeof document === 'undefined') return null;
  return createPortal(popover, document.body);
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
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function RoleMultiPickerPopover({
  selectedIds,
  onChange,
  onClose,
  anchorRef,
}: RoleMultiPickerPopoverProps) {
  const { t } = useTranslation('role');
  const roles = useRoleStore((s) => s.roles);
  const ref = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const minW = 180;
    const maxH = 240;
    const width = Math.max(rect.width, minW);
    let left = rect.left;
    let top = rect.bottom + 4;
    if (left + width > vw - 8) left = Math.max(8, vw - 8 - width);
    if (left < 8) left = 8;
    const estHeight = Math.min(roles.length * 40 + 48, maxH);
    if (top + estHeight > vh - 8 && rect.top > estHeight + 8) {
      top = rect.top - 4 - estHeight;
    }
    setPopoverStyle({
      position: 'fixed',
      top,
      left,
      minWidth: minW,
      width,
      maxHeight: maxH,
      zIndex: 9999,
    });
  }, [anchorRef, roles.length]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);

  useEffect(() => {
    const onScroll = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [updatePosition]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchorRef]);

  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    onChange(next);
  };

  const popover = (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 4, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.12 }}
      className="overflow-y-auto rounded-xl p-1 shadow-lg"
      style={{
        ...popoverStyle,
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
          background: selectedIds.length === 0 ? 'var(--color-accent-soft)' : undefined,
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

  if (typeof document === 'undefined') return null;
  return createPortal(popover, document.body);
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
  const anchorRef = useRef<HTMLButtonElement>(null);

  if (roles.length === 0) return null;

  const firstResolved = roleIds.length ? roles.find((r) => r.id === roleIds[0]) : undefined;
  const extra = Math.max(0, roleIds.length - 1);

  const fontSize = size === 'sm' ? 'text-[10px]' : 'text-xs';
  const dotSize = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';

  return (
    <span className="relative inline-flex">
      <button
        ref={anchorRef}
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
      {open && (
        <RoleMultiPickerPopover
          anchorRef={anchorRef}
          selectedIds={roleIds}
          onChange={(ids) => onChangeRoleIds(ids)}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}

export function RolePill({ roleId, onChangeRole, size = 'sm' }: RolePillProps) {
  const { t } = useTranslation('role');
  const roles = useRoleStore((s) => s.roles);
  const role = roleId ? roles.find((r) => r.id === roleId) : undefined;
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  if (roles.length === 0) return null;

  const fontSize = size === 'sm' ? 'text-[10px]' : 'text-xs';
  const dotSize = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';

  return (
    <span className="relative inline-flex">
      <button
        ref={anchorRef}
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
      {open && (
        <RolePickerPopover
          anchorRef={anchorRef}
          currentRoleId={roleId}
          onSelect={onChangeRole}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}
