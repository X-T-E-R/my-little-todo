import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const gitHash = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
})();

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'My Little Todo',
        short_name: 'MLT',
        description: '你的外部执行系统',
        theme_color: '#6b8cce',
        background_color: '#fdfbf7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/api\/tasks/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-tasks',
              expiration: { maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /\/api\/stream/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-stream',
              expiration: { maxEntries: 200, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /\/api\/settings/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-settings',
              expiration: { maxEntries: 20, maxAgeSeconds: 24 * 60 * 60 },
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: /\/api\/blobs\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'api-blobs',
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-other',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
    }),
  ],
  define: {
    'import.meta.env.VITE_STORAGE': JSON.stringify('api'),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_HASH__: JSON.stringify(gitHash),
  },
  build: {
    outDir: 'dist-pwa',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
  },
});
