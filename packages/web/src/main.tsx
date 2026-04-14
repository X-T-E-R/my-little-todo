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
import { getPlatform, initPlatform } from './utils/platform';
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
  const url = platform === 'web-hosted' ? '' : localStorage.getItem('mlt-cloud-url') || '';
  _apiBaseUrl = url;
  useAuthStore.getState().setApiBase(url);
  setSettingsApiBase(url);
  setDataStore(createApiDataStore(url));
}

async function main() {
  await initStorage();
  const platform = getPlatform();

  // Offline queue replay only applies to API-based stores
  if (_apiBaseUrl && (platform === 'web-hosted' || platform === 'web-standalone')) {
    startAutoSync(createDirectExecutor(_apiBaseUrl));
  }

  await useAuthStore.getState().checkAuthMode();
  await useAuthStore.getState().completeAuthCallback().catch((err) => {
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
