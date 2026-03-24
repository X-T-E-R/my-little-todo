/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __GIT_HASH__: string;

interface ImportMetaEnv {
  readonly VITE_STORAGE?: 'api' | 'local';
  readonly VITE_API_URL?: string;
  readonly VITE_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
