import { Cloud, CloudOff, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getQueueSize, onQueueChange } from '../storage/offlineQueue';
import { getSetting, subscribeSetting } from '../storage/settingsApi';
import { getSyncEngine } from '../sync';
import type { SyncState } from '../sync';

const FADE_MS = 3000;
const SYNC_INDICATOR_STYLE_KEY = 'sync-indicator-style';

type SyncIndicatorStyle = 'dot' | 'status';

function formatRelativeSync(ts: number): string {
  if (ts === 0) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '<1m';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

function StatusChip({
  icon,
  label,
  title,
  tone = 'neutral',
  compact = false,
  onClick,
}: {
  icon: React.JSX.Element;
  label?: string;
  title: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
  compact?: boolean;
  onClick?: () => void;
}) {
  const palette = {
    neutral: {
      bg: 'color-mix(in srgb, var(--color-surface) 88%, transparent)',
      border: 'var(--color-border)',
      text: 'var(--color-text-secondary)',
    },
    success: {
      bg: 'var(--color-success-soft)',
      border: 'color-mix(in srgb, var(--color-success) 30%, var(--color-border))',
      text: 'var(--color-success)',
    },
    warning: {
      bg: 'var(--color-warning-soft)',
      border: 'color-mix(in srgb, var(--color-warning) 28%, var(--color-border))',
      text: 'var(--color-warning)',
    },
    danger: {
      bg: 'var(--color-danger-soft)',
      border: 'color-mix(in srgb, var(--color-danger) 28%, var(--color-border))',
      text: 'var(--color-danger)',
    },
    accent: {
      bg: 'var(--color-accent-soft)',
      border: 'color-mix(in srgb, var(--color-accent) 24%, var(--color-border))',
      text: 'var(--color-accent)',
    },
  } as const;

  const colors = palette[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-full border backdrop-blur-md transition-all hover:-translate-y-0.5 ${
        compact ? 'h-3.5 w-3.5 justify-center px-0 shadow-none' : 'min-h-9 px-3 py-2 shadow-lg'
      }`}
      style={{
        background: compact ? 'transparent' : colors.bg,
        borderColor: compact ? 'transparent' : colors.border,
        color: colors.text,
      }}
    >
      {icon}
      {label ? (
        <span className="max-w-[9rem] truncate text-[11px] font-medium">{label}</span>
      ) : null}
    </button>
  );
}

function useSyncIndicatorStyle() {
  const [style, setStyle] = useState<SyncIndicatorStyle>('dot');

  useEffect(() => {
    let cancelled = false;
    void getSetting(SYNC_INDICATOR_STYLE_KEY).then((value) => {
      if (cancelled) return;
      setStyle(value === 'status' ? 'status' : 'dot');
    });

    return subscribeSetting(SYNC_INDICATOR_STYLE_KEY, (value) => {
      setStyle(value === 'status' ? 'status' : 'dot');
    });
  }, []);

  return style;
}

function useSyncDockState(style: SyncIndicatorStyle) {
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
    const unsubscribe = engine.onStateChange(update);
    setHasTargets(engine.hasTargets());
    setStates(engine.getAllStates());
    return unsubscribe;
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

  if (!hasTargets) return null;

  if (!needsAttention) {
    const title =
      lastSync > 0
        ? `${t('Last synced')}: ${new Date(lastSync).toLocaleString()}`
        : t('Click to sync');
    if (style === 'dot') {
      return {
        tone: 'success' as const,
        label: undefined,
        compact: true,
        title,
        icon: <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--color-success)' }} />,
      };
    }
    return {
      tone: 'success' as const,
      label: healthyHidden ? undefined : formatRelativeSync(lastSync),
      compact: healthyHidden,
      title,
      icon: healthyHidden ? (
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--color-success)' }} />
      ) : (
        <Cloud size={14} />
      ),
    };
  }

  if (syncing) {
    if (style === 'dot') {
      return {
        tone: 'accent' as const,
        label: undefined,
        compact: true,
        title: t('Syncing...'),
        icon: <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--color-accent)' }} />,
      };
    }
    return {
      tone: 'accent' as const,
      label: t('Syncing...'),
      compact: false,
      title: t('Syncing...'),
      icon: <Loader2 size={14} className="animate-spin" />,
    };
  }

  if (hasConflict) {
    if (style === 'dot') {
      return {
        tone: 'warning' as const,
        label: undefined,
        compact: true,
        title: t('Conflict'),
        icon: <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--color-warning)' }} />,
      };
    }
    return {
      tone: 'warning' as const,
      label: t('Conflict'),
      compact: false,
      title: t('Conflict'),
      icon: <Cloud size={14} />,
    };
  }

  if (hasError) {
    if (style === 'dot') {
      return {
        tone: 'danger' as const,
        label: undefined,
        compact: true,
        title: errorState?.error ? `${t('Sync error')}: ${errorState.error}` : t('Sync error'),
        icon: <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--color-danger)' }} />,
      };
    }
    return {
      tone: 'danger' as const,
      label: t('Sync error'),
      compact: false,
      title: errorState?.error ? `${t('Sync error')}: ${errorState.error}` : t('Sync error'),
      icon: <CloudOff size={14} />,
    };
  }

  if (style === 'dot') {
    return {
      tone: 'warning' as const,
      label: undefined,
      compact: true,
      title: t('Offline'),
      icon: <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--color-warning)' }} />,
    };
  }

  return {
    tone: 'warning' as const,
    label: t('Offline'),
    compact: false,
    title: t('Offline'),
    icon: <CloudOff size={14} />,
  };
}

function useOfflineDockState(style: SyncIndicatorStyle) {
  const { t } = useTranslation('nav');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingOps, setPendingOps] = useState(0);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    void getQueueSize()
      .then(setPendingOps)
      .catch(() => {});
    const unsubscribe = onQueueChange(setPendingOps);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      unsubscribe();
    };
  }, []);

  if (style === 'dot') return null;
  if (!isOffline && pendingOps === 0) return null;

  return {
    tone: isOffline ? ('warning' as const) : ('accent' as const),
    label: isOffline ? t('Offline') : t('Syncing {{count}} changes...', { count: pendingOps }),
    compact: false,
    title: isOffline ? t('Offline') : t('Syncing {{count}} changes...', { count: pendingOps }),
    icon: isOffline ? <WifiOff size={14} /> : <RefreshCw size={14} />,
  };
}

export function StatusDock() {
  const syncIndicatorStyle = useSyncIndicatorStyle();
  const syncState = useSyncDockState(syncIndicatorStyle);
  const offlineState = useOfflineDockState(syncIndicatorStyle);

  const items = useMemo(
    () =>
      [offlineState, syncState].filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [offlineState, syncState],
  );

  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-3 z-[60] flex flex-col items-end gap-2"
      style={{
        bottom: 'calc(80px + var(--safe-area-bottom))',
        paddingRight: 'var(--safe-area-right)',
      }}
    >
      {items.map((item) => (
        <StatusChip
          key={`${item.title}-${item.label ?? 'dot'}`}
          icon={item.icon}
          label={item.label}
          title={item.title}
          tone={item.tone}
          compact={item.compact}
          onClick={item === syncState ? () => getSyncEngine().syncAll() : undefined}
        />
      ))}
    </div>
  );
}
