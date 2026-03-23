import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@web': resolve(__dirname, '../web/src'),
    },
  },
  define: {
    'import.meta.env.VITE_STORAGE': JSON.stringify('api'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
