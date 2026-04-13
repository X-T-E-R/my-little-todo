import { taskRoleIds } from '@my-little-todo/core';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoleStore, useTaskStore } from '../stores';
import { useWindowContextStore } from '../stores/windowContextStore';

export function ContextBar() {
  const { t } = useTranslation('widget');
  const tasks = useTaskStore((s) => s.tasks);
  const roles = useRoleStore((s) => s.roles);
  const currentRoleId = useRoleStore((s) => s.currentRoleId);
  const matched = useWindowContextStore((s) => s.matched);
  const [hovered, setHovered] = useState(false);

  const effectiveRoleIds = useMemo(() => {
    if (matched?.roleIds?.length) return matched.roleIds;
    if (currentRoleId) return [currentRoleId];
    return [];
  }, [matched, currentRoleId]);

  const activeRole = useMemo(() => {
    if (effectiveRoleIds.length === 0) return null;
    return roles.find((r) => r.id === effectiveRoleIds[0]) ?? null;
  }, [effectiveRoleIds, roles]);

  const roleNames = useMemo(() => {
    return effectiveRoleIds
      .map((id) => roles.find((r) => r.id === id)?.name)
      .filter(Boolean) as string[];
  }, [effectiveRoleIds, roles]);

  const openCount = useMemo(() => {
    const open = tasks.filter((x) => x.status === 'active' || x.status === 'today');
    if (effectiveRoleIds.length === 0) return open.length;
    return open.filter((task) => {
      const tr = taskRoleIds(task);
      if (tr.length === 0) return false;
      return tr.some((id) => effectiveRoleIds.includes(id));
    }).length;
  }, [tasks, effectiveRoleIds]);

  const noteSnippet = matched?.note?.trim().split('\n')[0]?.slice(0, 100) ?? '';
  const roleColor = activeRole?.color ?? 'var(--color-accent)';

  return (
    <div
      className="flex h-full items-center gap-3 rounded-xl px-4 py-1 transition-all duration-200"
      style={{
        background: hovered
          ? 'color-mix(in oklab, var(--color-surface) 90%, transparent)'
          : 'color-mix(in oklab, var(--color-surface) 75%, transparent)',
        backdropFilter: hovered ? 'blur(16px)' : 'blur(24px)',
        WebkitBackdropFilter: hovered ? 'blur(16px)' : 'blur(24px)',
        border: '1px solid color-mix(in oklab, var(--color-border) 40%, transparent)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        className="inline-block size-[6px] shrink-0 rounded-full"
        style={{ background: roleColor }}
      />
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-xs font-medium transition-opacity duration-200"
          style={{
            color: 'var(--color-text)',
            opacity: hovered ? 1 : 0.85,
          }}
        >
          {roleNames.length > 0 ? roleNames.join(' · ') : t('no_role_filter')}
        </p>
        <p
          className="truncate text-[10px] transition-opacity duration-200"
          style={{
            color: 'var(--color-text-tertiary)',
            opacity: hovered ? 0.7 : 0.45,
          }}
        >
          {t('context_bar_sub', { count: openCount })}
          {noteSnippet ? ` — ${noteSnippet}` : ''}
        </p>
      </div>
    </div>
  );
}
