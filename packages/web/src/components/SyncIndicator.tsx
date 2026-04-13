import { Cloud, CloudOff, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSyncEngine } from '../sync';
import type { SyncState } from '../sync';

const FADE_MS = 3000;

type SyncIndicatorTranslator = (key: string) => string;

type SyncPresentation = {
  bgColor: string;
  icon: React.JSX.Element;
  label: string;
};

function formatRelativeSync(ts: number): string {
  if (ts === 0) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '<1m';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

function getSyncPresentation(
  t: SyncIndicatorTranslator,
  syncing: boolean,
  hasConflict: boolean,
  hasError: boolean,
  isOffline: boolean,
  lastSync: number,
): SyncPresentation {
  if (syncing) {
    return {
      bgColor: 'var(--color-accent)',
      icon: <Loader2 size={12} className="animate-spin" />,
      label: t('Syncing...'),
    };
  }

  if (hasConflict) {
    return {
      bgColor: 'var(--color-warning, #f59e0b)',
      icon: <Cloud size={12} />,
      label: t('Conflict'),
    };
  }

  if (hasError) {
    return {
      bgColor: 'var(--color-danger, #ef4444)',
      icon: <CloudOff size={12} />,
      label: t('Sync error'),
    };
  }

  if (isOffline) {
    return {
      bgColor: 'var(--color-warning, #f59e0b)',
      icon: <CloudOff size={12} />,
      label: t('Offline'),
    };
  }

  if (lastSync > 0) {
    return {
      bgColor: 'var(--color-success, #22c55e)',
      icon: <Cloud size={12} />,
      label: formatRelativeSync(lastSync),
    };
  }

  return {
    bgColor: 'var(--color-success, #22c55e)',
    icon: <RefreshCw size={12} />,
    label: '',
  };
}

function getSyncTitle(
  t: SyncIndicatorTranslator,
  hasError: boolean,
  errorState: SyncState | undefined,
  lastSync: number,
): string {
  if (hasError && errorState?.error) {
    return `${t('Sync error')}: ${errorState.error}`;
  }

  if (lastSync > 0) {
    return `${t('Last synced')}: ${new Date(lastSync).toLocaleString()}`;
  }

  return t('Click to sync');
}

/** Embedded in tab bar, not fixed. Healthy: green dot only, fades to subtle after {@link FADE_MS}. Problems stay visible. */
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
    setStates(engine.getAllStates());
    return unsub;
  }, []);

  const syncing = states.some((state) => state.status === 'syncing');
  const errorState = states.find((state) => state.status === 'error');
  const hasError = Boolean(errorState);
  const hasConflict = states.some((state) => state.status === 'conflict');
  const isOffline = !navigator.onLine;
  const lastSync = states.reduce((max, state) => Math.max(max, state.lastSyncAt), 0);
  const needsAttention = syncing || hasConflict || hasError || isOffline;

  useEffect(() => {
    if (needsAttention) {
      setHealthyHidden(false);
      return;
    }

    setHealthyHidden(false);
    if (lastSync <= 0) return;

    const id = window.setTimeout(() => setHealthyHidden(true), FADE_MS);
    return () => window.clearTimeout(id);
  }, [needsAttention, lastSync]);

  const handleSync = useCallback(() => {
    setHealthyHidden(false);
    getSyncEngine().syncAll();
  }, []);

  if (!hasTargets) return null;

  const { bgColor, icon, label } = getSyncPresentation(
    t,
    syncing,
    hasConflict,
    hasError,
    isOffline,
    lastSync,
  );
  const title = getSyncTitle(t, hasError, errorState, lastSync);

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
      className="flex max-w-[120px] shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium leading-tight transition-opacity hover:opacity-90"
      style={{ background: bgColor, color: 'white' }}
    >
      {icon}
      {label && <span className="truncate">{label}</span>}
    </button>
  );
}
