import { Check, Cloud, CloudOff, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSyncEngine } from '../sync';
import type { SyncState } from '../sync';

const FADE_MS = 3000;

/** Embedded in tab bar — not fixed. Healthy: green dot only, fades to subtle after {@link FADE_MS}. Problems stay visible. */
export function SyncIndicator() {
  const { t } = useTranslation('settings');
  const [states, setStates] = useState<SyncState[]>([]);
  const [hasTargets, setHasTargets] = useState(false);
  const [healthyHidden, setHealthyHidden] = useState(false);

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

  const syncing = states.some((s) => s.status === 'syncing');
  const errorState = states.find((s) => s.status === 'error');
  const hasError = !!errorState;
  const hasConflict = states.some((s) => s.status === 'conflict');
  const isOffline = !navigator.onLine;
  const lastSync = states.reduce((max, s) => Math.max(max, s.lastSyncAt), 0);

  const needsAttention = syncing || hasConflict || hasError || isOffline;

  useEffect(() => {
    if (needsAttention) {
      setHealthyHidden(false);
      return;
    }
    setHealthyHidden(false);
    const id = window.setTimeout(() => setHealthyHidden(true), FADE_MS);
    return () => window.clearTimeout(id);
  }, [needsAttention, lastSync]);

  const handleSync = useCallback(() => {
    setHealthyHidden(false);
    getSyncEngine().syncAll();
  }, []);

  if (!hasTargets) return null;

  const formatRelative = (ts: number): string => {
    if (ts === 0) return '';
    const diff = Date.now() - ts;
    if (diff < 60_000) return '<1m';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h`;
    return `${Math.floor(diff / 86400_000)}d`;
  };

  let bgColor = 'var(--color-success, #22c55e)';
  let icon = <Check size={12} />;
  let label = '';

  if (syncing) {
    bgColor = 'var(--color-accent)';
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

  const title =
    hasError && errorState?.error
      ? `${t('Sync error')}: ${errorState.error}`
      : lastSync > 0
        ? `${t('Last synced')}: ${new Date(lastSync).toLocaleString()}`
        : t('Click to sync');

  if (!needsAttention) {
    return (
      <button
        type="button"
        onClick={handleSync}
        title={title}
        aria-label={title}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-opacity duration-500 ${
          healthyHidden ? 'opacity-25 hover:opacity-100' : 'opacity-100'
        }`}
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: 'var(--color-success, #22c55e)' }}
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleSync}
      title={title}
      className="flex max-w-[120px] shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium leading-tight transition-opacity cursor-pointer hover:opacity-90"
      style={{ background: bgColor, color: 'white' }}
    >
      {icon}
      {label && <span className="truncate">{label}</span>}
    </button>
  );
}
