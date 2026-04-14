import { mltpPlugin } from '@my-little-todo/plugin-sdk/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), mltpPlugin()],
  build: {
    lib: {
      entry: {
        index: 'src/index.tsx',
        server: 'src/server.ts',
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
    emptyOutDir: true,
  },
});
