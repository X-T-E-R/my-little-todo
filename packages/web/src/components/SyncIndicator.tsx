import { Check, Cloud, CloudOff, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSyncEngine } from '../sync';
import type { SyncState } from '../sync';

export function SyncIndicator() {
  const { t } = useTranslation('settings');
  const [states, setStates] = useState<SyncState[]>([]);
  const [hasTargets, setHasTargets] = useState(false);

  useEffect(() => {
    const engine = getSyncEngine();
    const update = (map: Map<string, SyncState>) => {
      setStates(Array.from(map.values()));
      setHasTargets(engine.hasTargets());
    };
    const unsub = engine.onStateChange(update);
    setHasTargets(engine.hasTargets());
    const initial = engine.getAllStates();
    setStates(initial);
    return unsub;
  }, []);

  const handleSync = useCallback(() => {
    getSyncEngine().syncAll();
  }, []);

  if (!hasTargets) return null;

  const syncing = states.some((s) => s.status === 'syncing');
  const hasError = states.some((s) => s.status === 'error');
  const hasConflict = states.some((s) => s.status === 'conflict');
  const isOffline = !navigator.onLine;
  const lastSync = states.reduce((max, s) => Math.max(max, s.lastSyncAt), 0);

  const formatRelative = (ts: number): string => {
    if (ts === 0) return '';
    const diff = Date.now() - ts;
    if (diff < 60_000) return '<1m';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h`;
    return `${Math.floor(diff / 86400_000)}d`;
  };

  let bgColor = 'var(--color-accent)';
  let icon = <Check size={12} />;
  let label = '';

  if (syncing) {
    icon = <Loader2 size={12} className="animate-spin" />;
    label = t('Syncing...');
  } else if (hasConflict) {
    bgColor = 'var(--color-warning, #f59e0b)';
    icon = <Cloud size={12} />;
    label = t('Conflict');
  } else if (hasError) {
    bgColor = 'var(--color-danger, #ef4444)';
    icon = <CloudOff size={12} />;
    label = t('Sync error');
  } else if (isOffline) {
    bgColor = 'var(--color-warning, #f59e0b)';
    icon = <CloudOff size={12} />;
    label = t('Offline');
  } else if (lastSync > 0) {
    icon = <Cloud size={12} />;
    label = formatRelative(lastSync);
  } else {
    icon = <RefreshCw size={12} />;
  }

  return (
    <button
      type="button"
      onClick={handleSync}
      title={
        lastSync > 0
          ? `${t('Last synced')}: ${new Date(lastSync).toLocaleString()}`
          : t('Click to sync')
      }
      className="fixed top-2 right-2 z-50 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur-md cursor-pointer transition-opacity hover:opacity-90"
      style={{ background: bgColor, color: 'white' }}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}
