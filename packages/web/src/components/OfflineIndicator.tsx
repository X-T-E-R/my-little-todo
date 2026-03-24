import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getQueueSize, onQueueChange } from '../storage/offlineQueue';

export function OfflineIndicator() {
  const { t } = useTranslation('nav');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingOps, setPendingOps] = useState(0);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    getQueueSize().then(setPendingOps).catch(() => {});

    const unsubscribe = onQueueChange(setPendingOps);

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      unsubscribe();
    };
  }, []);

  if (!isOffline && pendingOps === 0) return null;

  return (
    <div
      className="fixed top-2 right-2 z-50 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur-md"
      style={{
        background: isOffline ? 'var(--color-warning)' : 'var(--color-accent)',
        color: 'white',
      }}
    >
      {isOffline && <WifiOff size={12} />}
      {isOffline
        ? t('Offline')
        : t('Syncing {{count}} changes...', { count: pendingOps })}
    </div>
  );
}
