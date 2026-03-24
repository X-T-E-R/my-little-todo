import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './locales';
import './styles/globals.css';
import { App } from './App';
import { setStorageAdapter } from './storage/adapter';
import { setSettingsApiBase } from './storage/settingsApi';
import { useAuthStore } from './stores/authStore';
import { createApiAdapter } from './storage/apiClient';
import { initPlatform } from './utils/platform';

// Apply saved theme immediately to prevent flash
{
  const savedTheme = localStorage.getItem('mlt-theme');
  if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else if (savedTheme === 'light') document.documentElement.setAttribute('data-theme', 'light');
}

async function getApiBase(): Promise<string> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const useMode = localStorage.getItem('mlt-use-mode');
    const cloudUrl = localStorage.getItem('mlt-cloud-url');

    if (useMode === 'cloud' && cloudUrl) {
      return cloudUrl;
    }

    const { invoke } = await import('@tauri-apps/api/core');
    try {
      const host = localStorage.getItem('mlt-lan-access') === 'true' ? '0.0.0.0' : '127.0.0.1';
      const url = await invoke<string>('start_embedded_server', { host });
      return url;
    } catch {
      return 'http://127.0.0.1:3001';
    }
  }
  // Browser mode: use relative paths (works with Vite proxy in dev and same-origin Rust serve in production)
  return '';
}

async function initStorage() {
  await initPlatform();
  const url = await getApiBase();
  useAuthStore.getState().setApiBase(url);
  setSettingsApiBase(url);
  setStorageAdapter(createApiAdapter(url));
}

async function main() {
  await initStorage();

  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Missing root element #root');
  }
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

main();
