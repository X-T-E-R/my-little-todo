import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './locales';
import './styles/globals.css';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { createApiDataStore } from './storage/apiDataStore';
import { setDataStore } from './storage/dataStore';
import { createDirectExecutor, startAutoSync } from './storage/offlineQueue';
import { setSettingsApiBase } from './storage/settingsApi';
import { useAuthStore } from './stores/authStore';
import { getSyncEngine } from './sync';
import { getPlatform, initPlatform } from './utils/platform';
import { resolveRuntimeMode } from './utils/runtimeMode';
import { AnnotatorShell } from './widgets/AnnotatorShell';
import { ContextBarShell } from './widgets/ContextBarShell';
import { WidgetShell } from './widgets/WidgetShell';

// Apply saved theme immediately to prevent flash
{
  const savedTheme = localStorage.getItem('mlt-theme');
  if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else if (savedTheme === 'light') document.documentElement.setAttribute('data-theme', 'light');
}

let _apiBaseUrl = '';

async function initStorage() {
  await initPlatform();
  const platform = getPlatform();
  const cloudUrl = platform === 'web-standalone' ? localStorage.getItem('mlt-cloud-url') || '' : '';
  const runtime = resolveRuntimeMode(platform, cloudUrl);

  _apiBaseUrl = runtime.apiBase;
  useAuthStore.getState().setRuntime(runtime.authRuntime, runtime.apiBase);
  setSettingsApiBase(runtime.apiBase);

  if (runtime.storeKind === 'tauri-sqlite') {
    const { createTauriSqliteDataStore } = await import('./storage/tauriSqliteStore');
    const store = await createTauriSqliteDataStore();
    setDataStore(store);

    const { migrateLegacyData } = await import('./storage/migrateLegacy');
    await migrateLegacyData(store);
  } else if (runtime.storeKind === 'capacitor-sqlite') {
    const { createCapacitorSqliteDataStore } = await import(
      /* @vite-ignore */ './storage/capacitorSqliteStore'
    );
    setDataStore(await createCapacitorSqliteDataStore());
  } else {
    setDataStore(createApiDataStore(runtime.apiBase));
  }

  return runtime;
}

async function main() {
  const runtime = await initStorage();

  // Offline queue replay only applies to API-based stores
  if (runtime.storeKind === 'api' && _apiBaseUrl) {
    startAutoSync(createDirectExecutor(_apiBaseUrl));
  }

  if (runtime.storeKind !== 'api') {
    const { initSyncFromConfig } = await import('./sync/syncManager');
    await initSyncFromConfig().catch((err) => {
      console.warn('[SyncEngine] Failed to initialize from config:', err);
    });

    const flush = () => getSyncEngine().flushPendingLocalSync();
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
  }

  await useAuthStore.getState().checkAuthMode();
  await useAuthStore
    .getState()
    .completeAuthCallback()
    .catch((err) => {
      console.warn('[Auth] Failed to complete callback:', err);
    });

  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Missing root element #root');
  }

  const params = new URLSearchParams(window.location.search);
  const mlt = params.get('mlt');
  const Shell =
    mlt === 'widget'
      ? WidgetShell
      : mlt === 'context-bar'
        ? ContextBarShell
        : mlt === 'annotator'
          ? AnnotatorShell
          : App;

  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <Shell />
      </ErrorBoundary>
    </StrictMode>,
  );
}

main().catch((err) => {
  console.error('Fatal initialization error:', err);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;flex-direction:column;gap:12px;padding:24px;text-align:center">
      <h2 style="margin:0;color:#e11d48">Initialization Failed</h2>
      <pre style="margin:0;font-size:13px;color:#666;max-width:600px;overflow:auto;white-space:pre-wrap">${String(err)}</pre>
      <button onclick="location.reload()" style="padding:8px 20px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;font-size:13px">Reload</button>
    </div>`;
  }
});
