import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@web/locales';
import '@web/styles/globals.css';
import { App } from '@web/App';
import { ErrorBoundary } from '@web/components/ErrorBoundary';
import { setDataStore } from '@web/storage/dataStore';
import { getSyncEngine } from '@web/sync';
import { setSettingsApiBase } from '@web/storage/settingsApi';
import { useAuthStore } from '@web/stores/authStore';
import { getPlatform, initPlatform } from '@web/utils/platform';
import { resolveRuntimeMode } from '@web/utils/runtimeMode';

{
  const savedTheme = localStorage.getItem('mlt-theme');
  if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else if (savedTheme === 'light') document.documentElement.setAttribute('data-theme', 'light');
}

async function initStorage() {
  await initPlatform();
  const runtime = resolveRuntimeMode(getPlatform(), '');
  useAuthStore.getState().setRuntime(runtime.authRuntime, runtime.apiBase);
  setSettingsApiBase(runtime.apiBase);

  const { createCapacitorSqliteDataStore } = await import(
    /* @vite-ignore */ '@web/storage/capacitorSqliteStore'
  );
  setDataStore(await createCapacitorSqliteDataStore());

  const { initSyncFromConfig } = await import('@web/sync/syncManager');
  await initSyncFromConfig().catch((err) => {
    console.warn('[SyncEngine] Failed to initialize from config:', err);
  });

  const flush = () => getSyncEngine().flushPendingLocalSync();
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
}

async function main() {
  await initStorage();
  await useAuthStore.getState().checkAuthMode();
  await useAuthStore.getState().completeAuthCallback().catch((err) => {
    console.warn('[Auth] Failed to complete callback:', err);
  });

  const root = document.getElementById('root');
  if (!root) throw new Error('Missing root element #root');

  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

main();
