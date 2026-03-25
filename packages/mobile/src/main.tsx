import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@web/locales';
import '@web/styles/globals.css';
import { App } from '@web/App';
import { ErrorBoundary } from '@web/components/ErrorBoundary';
import { setDataStore } from '@web/storage/dataStore';
import { initPlatform } from '@web/utils/platform';

{
  const savedTheme = localStorage.getItem('mlt-theme');
  if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else if (savedTheme === 'light') document.documentElement.setAttribute('data-theme', 'light');
}

async function initStorage() {
  await initPlatform();

  const { createCapacitorSqliteDataStore } = await import('@web/storage/capacitorSqliteStore');
  const store = await createCapacitorSqliteDataStore();
  setDataStore(store);
}

async function main() {
  await initStorage();

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
