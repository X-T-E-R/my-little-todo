import type { Role } from '@my-little-todo/core';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Inbox, Layers, Palette, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NO_ROLE_FILTER, useRoleStore } from '../stores';

function RoleAvatar({ role, size = 32 }: { role: Role; size?: number }) {
  const initial = role.name.charAt(0).toUpperCase();
  return (
    <div
      className="flex items-center justify-center rounded-lg font-bold text-white shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: role.color ?? 'var(--color-accent)',
      }}
    >
      {initial}
    </div>
  );
}

function AddRoleInline({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('role');
  const [name, setName] = useState('');
  const createRole = useRoleStore((s) => s.createRole);

  const handleCreate = async () => {
    if (!name.trim()) return;
    const colors = ['#6b8cce', '#5eb376', '#e8a05c', '#d96c6c', '#9b7ed8', '#3ba0a8', '#c06dab'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    await createRole(name.trim(), { color });
    setName('');
    onDone();
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="px-2 py-1.5">
        <input
          // biome-ignore lint/a11y/noAutofocus: sidebar inline input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate();
            if (e.key === 'Escape') onDone();
          }}
          onBlur={() => {
            if (!name.trim()) onDone();
          }}
          placeholder={t('Role name')}
          className="w-full rounded-lg px-2 py-1.5 text-xs outline-none"
          style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-accent)',
            color: 'var(--color-text)',
          }}
        />
      </div>
    </motion.div>
  );
}

const ROLE_COLORS = [
  '#6b8cce',
  '#5eb376',
  '#e8a05c',
  '#d96c6c',
  '#9b7ed8',
  '#3ba0a8',
  '#c06dab',
  '#5c9e8f',
  '#c4785e',
  '#7b8ec7',
];

function RoleContextMenu({
  role,
  x,
  y,
  onClose,
}: {
  role: Role;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const { t } = useTranslation('role');
  const menuRef = useRef<HTMLDivElement>(null);
  const updateRole = useRoleStore((s) => s.updateRole);
  const deleteRole = useRoleStore((s) => s.deleteRole);
  const reorderRoles = useRoleStore((s) => s.reorderRoles);
  const roles = useRoleStore((s) => s.roles);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState(role.name);
  const [pickingColor, setPickingColor] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const sorted = [...roles].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((r) => r.id === role.id);

  const moveToTop = async () => {
    const ids = sorted.map((r) => r.id);
    ids.splice(idx, 1);
    ids.unshift(role.id);
    await reorderRoles(ids);
    onClose();
  };

  const moveToBottom = async () => {
    const ids = sorted.map((r) => r.id);
    ids.splice(idx, 1);
    ids.push(role.id);
    await reorderRoles(ids);
    onClose();
  };

  const handleRename = async () => {
    if (renameName.trim() && renameName.trim() !== role.name) {
      await updateRole(role.id, { name: renameName.trim() });
    }
    setRenaming(false);
    onClose();
  };

  const handleDelete = async () => {
    if (
      window.confirm(
        t('Delete role "{{name}}"? Tasks will become uncategorized.', { name: role.name }),
      )
    ) {
      await deleteRole(role.id);
    }
    onClose();
  };

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 9999,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    minWidth: 160,
  };

  return (
    <div ref={menuRef} className="rounded-lg py-1 shadow-xl" style={menuStyle}>
      {renaming ? (
        <div className="px-2 py-1">
          <input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') {
                setRenaming(false);
                onClose();
              }
            }}
            onBlur={handleRename}
            className="w-full rounded px-2 py-1 text-xs outline-none"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-accent)',
              color: 'var(--color-text)',
            }}
          />
        </div>
      ) : pickingColor ? (
        <div className="flex flex-wrap gap-1.5 px-2 py-2 max-w-[180px]">
          {ROLE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={async () => {
                await updateRole(role.id, { color: c });
                setPickingColor(false);
                onClose();
              }}
              className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                background: c,
                borderColor: c === role.color ? 'var(--color-text)' : 'transparent',
              }}
            />
          ))}
        </div>
      ) : (
        <>
          <CtxItem
            icon={<Pencil size={14} />}
            label={t('Rename')}
            onClick={() => setRenaming(true)}
          />
          <CtxItem
            icon={<Palette size={14} />}
            label={t('Change color')}
            onClick={() => setPickingColor(true)}
          />
          <div className="my-1 mx-2 border-t" style={{ borderColor: 'var(--color-border)' }} />
          <CtxItem
            icon={<ArrowUp size={14} />}
            label={t('Move to top')}
            onClick={moveToTop}
            disabled={idx === 0}
          />
          <CtxItem
            icon={<ArrowDown size={14} />}
            label={t('Move to bottom')}
            onClick={moveToBottom}
            disabled={idx === sorted.length - 1}
          />
          <div className="my-1 mx-2 border-t" style={{ borderColor: 'var(--color-border)' }} />
          <CtxItem icon={<Trash2 size={14} />} label={t('Delete')} onClick={handleDelete} danger />
        </>
      )}
    </div>
  );
}

function CtxItem({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--color-bg)] disabled:opacity-30"
      style={{ color: danger ? 'var(--color-danger)' : 'var(--color-text)' }}
    >
      {icon}
      {label}
    </button>
  );
}

export function RoleSidebar({ horizontal = false }: { horizontal?: boolean }) {
  const { t } = useTranslation('role');
  const roles = useRoleStore((s) => s.roles);
  const currentRoleId = useRoleStore((s) => s.currentRoleId);
  const switchRole = useRoleStore((s) => s.switchRole);
  const settings = useRoleStore((s) => s.settings);
  const [showAdd, setShowAdd] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ role: Role; x: number; y: number } | null>(null);

  const handleRoleContextMenu = useCallback((e: React.MouseEvent, role: Role) => {
    e.preventDefault();
    setCtxMenu({ role, x: e.clientX, y: e.clientY });
  }, []);

  const canAdd = roles.length < settings.maxRoles;

  if (horizontal) {
    return (
      <div
        className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto shrink-0"
        style={{
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <HorizontalChip
          active={currentRoleId === null}
          onClick={() => switchRole(null)}
          label={t('All')}
        />
        <HorizontalChip
          active={currentRoleId === NO_ROLE_FILTER}
          onClick={() => switchRole(NO_ROLE_FILTER)}
          label={t('Uncategorized')}
        />
        {roles
          .sort((a, b) => a.order - b.order)
          .map((role) => (
            <HorizontalChip
              key={role.id}
              active={currentRoleId === role.id}
              onClick={() => switchRole(role.id)}
              onContextMenu={(e) => handleRoleContextMenu(e, role)}
              label={role.name}
              color={role.color}
            />
          ))}
        {ctxMenu && (
          <RoleContextMenu
            role={ctxMenu.role}
            x={ctxMenu.x}
            y={ctxMenu.y}
            onClose={() => setCtxMenu(null)}
          />
        )}
      </div>
    );
  }

  return (
    <nav
      className="flex h-full w-[68px] flex-col items-center border-r py-3 gap-1.5 shrink-0 overflow-y-auto"
      style={{
        background: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      {/* "全部" button */}
      <SidebarButton
        active={currentRoleId === null}
        onClick={() => switchRole(null)}
        label={t('All')}
        icon={<Layers size={18} />}
      />

      {/* "无角色" button */}
      <SidebarButton
        active={currentRoleId === NO_ROLE_FILTER}
        onClick={() => switchRole(NO_ROLE_FILTER)}
        label={t('Uncategorized')}
        icon={<Inbox size={18} />}
      />

      <div className="w-8 my-1" style={{ borderBottom: '1px solid var(--color-border)' }} />

      {/* Role list */}
      {roles
        .sort((a, b) => a.order - b.order)
        .map((role) => (
          <SidebarButton
            key={role.id}
            active={currentRoleId === role.id}
            onClick={() => switchRole(role.id)}
            onContextMenu={(e) => handleRoleContextMenu(e, role)}
            label={role.name}
            avatar={<RoleAvatar role={role} size={28} />}
            accentColor={role.color}
          />
        ))}

      <AnimatePresence>
        {showAdd && <AddRoleInline onDone={() => setShowAdd(false)} />}
      </AnimatePresence>

      {/* Add role button */}
      {canAdd && !showAdd && (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="mt-1 flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
          title={t('Add role')}
        >
          <Plus size={16} />
        </button>
      )}

      {ctxMenu && (
        <RoleContextMenu
          role={ctxMenu.role}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </nav>
  );
}

function HorizontalChip({
  active,
  onClick,
  onContextMenu,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all whitespace-nowrap"
      style={{
        background: active ? (color ?? 'var(--color-accent)') : 'var(--color-bg)',
        color: active ? 'white' : 'var(--color-text-secondary)',
        border: active
          ? `1px solid ${color ?? 'var(--color-accent)'}`
          : '1px solid var(--color-border)',
      }}
    >
      {label}
    </button>
  );
}

function SidebarButton({
  active,
  onClick,
  onContextMenu,
  label,
  icon,
  avatar,
  accentColor,
}: {
  active: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  label: string;
  icon?: React.ReactNode;
  avatar?: React.ReactNode;
  accentColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={label}
      className="relative flex w-14 flex-col items-center gap-0.5 rounded-xl px-1 py-2 transition-all"
      style={{
        background: active
          ? 'color-mix(in srgb, var(--color-accent-soft) 80%, transparent)'
          : 'transparent',
        color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
      }}
    >
      {active && (
        <motion.div
          layoutId="roleSidebarIndicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
          style={{ background: accentColor ?? 'var(--color-accent)' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
      )}
      {avatar ?? icon}
      <span
        className="text-[10px] font-medium leading-tight truncate w-full text-center"
        style={{
          color: active ? (accentColor ?? 'var(--color-accent)') : 'var(--color-text-tertiary)',
        }}
      >
        {label}
      </span>
    </button>
  );
}
