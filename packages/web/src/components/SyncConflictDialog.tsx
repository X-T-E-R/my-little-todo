import { motion } from 'framer-motion';
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSyncEngine } from '../sync';
import type { ConflictResolution, ResolvedConflict, SyncConflict } from '../sync';

export function SyncConflictDialog() {
  const { t } = useTranslation('settings');
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [targetId, setTargetId] = useState('');
  const [resolutions, setResolutions] = useState<Map<string, ConflictResolution>>(new Map());

  useEffect(() => {
    const engine = getSyncEngine();
    const unsub = engine.onConflict((c, tid) => {
      setConflicts(c);
      setTargetId(tid);
      setResolutions(new Map());
    });
    return unsub;
  }, []);

  const setResolution = useCallback((key: string, resolution: ConflictResolution) => {
    setResolutions((prev) => {
      const next = new Map(prev);
      next.set(key, resolution);
      return next;
    });
  }, []);

  const setAllResolutions = useCallback(
    (resolution: ConflictResolution) => {
      const next = new Map<string, ConflictResolution>();
      for (const c of conflicts) {
        next.set(`${c.table}:${c.key}`, resolution);
      }
      setResolutions(next);
    },
    [conflicts],
  );

  const handleSubmit = useCallback(() => {
    const resolved: ResolvedConflict[] = conflicts.map((c) => ({
      conflict: c,
      resolution: resolutions.get(`${c.table}:${c.key}`) ?? 'local',
    }));
    getSyncEngine().resolveConflicts(resolved);
    setConflicts([]);
    setTargetId('');
  }, [conflicts, resolutions]);

  if (conflicts.length === 0) return null;

  const allResolved = conflicts.every((c) => resolutions.has(`${c.table}:${c.key}`));

  const formatPreview = (content: string | null): string => {
    if (content === null) return `(${t('deleted')})`;
    if (content.length > 120) return `${content.slice(0, 120)}...`;
    return content;
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2 px-6 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <AlertTriangle size={18} className="text-amber-500" />
          <h2 className="text-base font-bold text-[var(--color-text)]">
            {t('Sync Conflicts')} ({conflicts.length})
          </h2>
        </div>

        <div className="flex items-center gap-2 px-6 py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <button
            type="button"
            onClick={() => setAllResolutions('local')}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)]"
          >
            <ArrowUp size={12} />
            {t('Keep All Local')}
          </button>
          <button
            type="button"
            onClick={() => setAllResolutions('remote')}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)]"
          >
            <ArrowDown size={12} />
            {t('Use All Remote')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-3">
          {conflicts.map((c) => {
            const cKey = `${c.table}:${c.key}`;
            const chosen = resolutions.get(cKey);
            return (
              <div
                key={cKey}
                className="rounded-xl border p-3"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <p className="text-xs font-mono text-[var(--color-text-tertiary)] mb-2 truncate">
                  [{c.table}] {c.key}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setResolution(cKey, 'local')}
                    className="rounded-lg p-2 text-left text-xs transition-all border"
                    style={{
                      borderColor: chosen === 'local' ? 'var(--color-accent)' : 'var(--color-border)',
                      background: chosen === 'local' ? 'var(--color-accent-light, rgba(59,130,246,0.08))' : 'transparent',
                    }}
                  >
                    <span className="font-medium text-[var(--color-text)]">{t('Local')}</span>
                    <br />
                    <span className="text-[var(--color-text-tertiary)]">
                      {new Date(c.local.updatedAt).toLocaleString()}
                    </span>
                    <br />
                    <span className="text-[var(--color-text-secondary)] break-all">
                      {formatPreview(c.local.content)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setResolution(cKey, 'remote')}
                    className="rounded-lg p-2 text-left text-xs transition-all border"
                    style={{
                      borderColor: chosen === 'remote' ? 'var(--color-accent)' : 'var(--color-border)',
                      background: chosen === 'remote' ? 'var(--color-accent-light, rgba(59,130,246,0.08))' : 'transparent',
                    }}
                  >
                    <span className="font-medium text-[var(--color-text)]">{t('Remote')}</span>
                    <br />
                    <span className="text-[var(--color-text-tertiary)]">
                      {new Date(c.remote.updatedAt).toLocaleString()}
                    </span>
                    <br />
                    <span className="text-[var(--color-text-secondary)] break-all">
                      {formatPreview(c.remote.content)}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <span className="flex-1 text-xs text-[var(--color-text-tertiary)] self-center">
            {t('Target')}: {targetId}
          </span>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allResolved}
            className="flex items-center gap-1.5 rounded-xl px-5 py-2 text-sm font-medium text-white transition-all bg-[var(--color-accent)] hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          >
            <CheckCircle size={14} />
            {t('Apply Resolutions')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
