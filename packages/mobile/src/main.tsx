import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@web/locales';
import '@web/styles/globals.css';
import { App } from '@web/App';
import { ErrorBoundary } from '@web/components/ErrorBoundary';
import { createApiDataStore } from '@web/storage/apiDataStore';
import { setDataStore } from '@web/storage/dataStore';
import { setSettingsApiBase } from '@web/storage/settingsApi';
import { useAuthStore } from '@web/stores/authStore';
import { initPlatform } from '@web/utils/platform';

{
  const savedTheme = localStorage.getItem('mlt-theme');
  if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else if (savedTheme === 'light') document.documentElement.setAttribute('data-theme', 'light');
}

async function initStorage() {
  await initPlatform();
  const url = localStorage.getItem('mlt-cloud-url') || '';
  useAuthStore.getState().setApiBase(url);
  setSettingsApiBase(url);
  setDataStore(createApiDataStore(url));
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
