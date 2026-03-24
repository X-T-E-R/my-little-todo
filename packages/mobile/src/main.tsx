import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@web/styles/globals.css';
import { App } from '@web/App';
import { loadStorageConfig, setStorageAdapter } from '@web/storage/adapter';
import { createApiAdapter } from '@web/storage/apiClient';

export async function initStorage(overrideUrl?: string, overrideToken?: string) {
  const config = loadStorageConfig();
  const url = overrideUrl ?? config.apiUrl;
  const token = overrideToken ?? config.apiToken;
  setStorageAdapter(createApiAdapter(url, token || undefined), 'api');
}

async function main() {
  await initStorage();

  const root = document.getElementById('root');
  if (!root) throw new Error('Missing root element #root');

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

main();
