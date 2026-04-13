import { mltpPlugin } from '@my-little-todo/plugin-sdk/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), mltpPlugin()],
  build: {
    lib: {
      entry: 'src/index.tsx',
      name: 'HelloWorld',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
    emptyOutDir: true,
  },
});
