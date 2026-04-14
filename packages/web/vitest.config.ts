import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const workspaceAlias = {
  '@my-little-todo/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
  '@my-little-todo/plugin-sdk': fileURLToPath(new URL('../plugin-sdk/src/index.ts', import.meta.url)),
};

export default defineConfig({
  resolve: {
    alias: workspaceAlias,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
