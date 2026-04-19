import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;
const apiProxyTarget = process.env.MLT_API_PROXY_TARGET || 'http://127.0.0.1:3001';

const gitHash = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
})();

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

const workspaceAlias = {
  '@my-little-todo/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
  '@my-little-todo/plugin-sdk': fileURLToPath(new URL('../plugin-sdk/src/index.ts', import.meta.url)),
};

type VendorChunkRule = {
  matchers: string[];
  chunk: string;
};

function getScopedPackageChunk(
  normalizedId: string,
  scopePrefix: string,
  chunkPrefix: string,
): string | null {
  const marker = `/node_modules/${scopePrefix}/`;
  const start = normalizedId.indexOf(marker);
  if (start < 0) return null;
  const rest = normalizedId.slice(start + marker.length);
  const name = rest.split('/')[0];
  return `${chunkPrefix}-${name}`;
}

function resolveScopedVendorChunk(normalizedId: string): string | undefined {
  const codemirrorChunk = getScopedPackageChunk(normalizedId, '@codemirror', 'codemirror');
  if (codemirrorChunk) return codemirrorChunk;

  const milkdownChunk = getScopedPackageChunk(normalizedId, '@milkdown', 'milkdown');
  if (milkdownChunk) return milkdownChunk;
}

const VENDOR_CHUNK_RULES: VendorChunkRule[] = [
  { matchers: ['/prosemirror-'], chunk: 'prosemirror-vendor' },
  { matchers: ['/@lezer/'], chunk: 'lezer-vendor' },
  { matchers: ['/katex/'], chunk: 'katex-vendor' },
  { matchers: ['/react-dom/', '/react/'], chunk: 'react-vendor' },
  { matchers: ['/framer-motion/', '/lucide-react/'], chunk: 'ui-vendor' },
  { matchers: ['/i18next/', '/react-i18next/'], chunk: 'i18n-vendor' },
  { matchers: ['/jszip/', '/diff/', '/markdown-it/'], chunk: 'data-vendor' },
  {
    matchers: ['/@tauri-apps/', '/@capacitor-community/', '/@tauri-apps/plugin-sql/'],
    chunk: 'native-vendor',
  },
];

function resolveRuleChunk(normalizedId: string, rules: VendorChunkRule[]): string | undefined {
  for (const rule of rules) {
    if (rule.matchers.some((matcher) => normalizedId.includes(matcher))) {
      return rule.chunk;
    }
  }
}

function resolveVendorChunk(normalizedId: string): string | undefined {
  if (!normalizedId.includes('/node_modules/')) return undefined;

  const scopedChunk = resolveScopedVendorChunk(normalizedId);
  if (scopedChunk) return scopedChunk;

  const ruleChunk = resolveRuleChunk(normalizedId, VENDOR_CHUNK_RULES);
  if (ruleChunk) return ruleChunk;

  return 'vendor';
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: workspaceAlias,
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_HASH__: JSON.stringify(gitHash),
  },
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          return resolveVendorChunk(id.replace(/\\/g, '/'));
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 5174 } : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/health': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
