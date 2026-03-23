import { AnimatePresence, motion } from 'framer-motion';
import { Clock, ListChecks } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { filterByRole, useRoleStore, useTaskStore } from '../stores';

export function RoleLandingCard() {
  const { t } = useTranslation('role');
  const landingRoleId = useRoleStore((s) => s.landingRoleId);
  const roles = useRoleStore((s) => s.roles);
  const dismissLanding = useRoleStore((s) => s.dismissLanding);
  const tasks = useTaskStore((s) => s.tasks);

  const role = useMemo(() => roles.find((r) => r.id === landingRoleId), [roles, landingRoleId]);

  const stats = useMemo(() => {
    if (!landingRoleId) return null;
    const roleTasks = filterByRole(tasks, landingRoleId);
    const active = roleTasks.filter(
      (t) => t.status === 'active' || t.status === 'today' || t.status === 'inbox',
    );
    const dueToday = active.filter((t) => {
      if (!t.ddl) return false;
      const now = new Date();
      const days = Math.ceil((t.ddl.getTime() - now.getTime()) / 86400000);
      return days <= 1;
    });
    return { total: active.length, dueToday: dueToday.length };
  }, [tasks, landingRoleId]);

  useEffect(() => {
    if (!landingRoleId) return;
    const timer = setTimeout(dismissLanding, 2000);
    return () => clearTimeout(timer);
  }, [landingRoleId, dismissLanding]);

  return (
    <AnimatePresence>
      {role && stats && (
        <motion.div
          key={role.id}
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          onClick={dismissLanding}
          className="absolute inset-x-0 top-4 z-30 mx-auto max-w-sm cursor-pointer"
        >
          <div
            className="mx-4 flex items-center gap-4 rounded-2xl px-5 py-4 shadow-lg backdrop-blur-md"
            style={{
              background: 'color-mix(in srgb, var(--color-surface) 90%, transparent)',
              border: `1px solid ${role.color ?? 'var(--color-border)'}`,
              borderLeftWidth: '4px',
              borderLeftColor: role.color ?? 'var(--color-accent)',
            }}
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white"
              style={{ background: role.color ?? 'var(--color-accent)' }}
            >
              {role.name.charAt(0)}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                {role.name}
              </p>

              {role.lastActivitySummary && (
                <p
                  className="text-xs truncate mt-0.5"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {t('Last: {{summary}}', { summary: role.lastActivitySummary })}
                </p>
              )}

              <div className="mt-1.5 flex items-center gap-3">
                <span
                  className="flex items-center gap-1 text-[11px] font-medium"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  <ListChecks size={12} />
                  {t('{{count}} pending tasks', { count: stats.total })}
                </span>
                {stats.dueToday > 0 && (
                  <span
                    className="flex items-center gap-1 text-[11px] font-medium"
                    style={{ color: 'var(--color-warning)' }}
                  >
                    <Clock size={12} />
                    {t('{{count}} due today', { count: stats.dueToday })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
