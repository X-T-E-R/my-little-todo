# Plugin API 参考

类型定义与插件入口来自 **`@my-little-todo/plugin-sdk`**。

## `definePlugin(definition)`

```ts
import { definePlugin } from '@my-little-todo/plugin-sdk';

export default definePlugin({
  async activate(ctx) {
    // 注册 UI、读写 KV 等
  },
  async deactivate() {
    // 可选：清理定时器等
  },
});
```

## `defineServerPlugin(definition)`

```ts
import { defineServerPlugin } from '@my-little-todo/plugin-sdk';

export default defineServerPlugin({
  async activate(ctx) {
    ctx.logger.info('server plugin ready');
  },
  tools: {
    async echo(args) {
      return { content: { ok: true, args } };
    },
  },
  routes: {
    'GET /healthz': async () => ({
      status: 200,
      json: { ok: true },
    }),
  },
});
```

> `defineServerPlugin()` 是新的 server 插件骨架入口。最终由共享 `plugin-runner` 执行，而不是直接运行在宿主进程里。

### 推荐目录结构

```text
src/
  index.tsx
  server.ts
manifest.json
vite.config.ts
```

### 推荐打包方式

```ts
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
  },
});
```

这个约定能让 `.mltp` 同时包含 UI 入口与 `server.entryPoint` 对应的 bundle。

## `PluginContext`

| 成员 | 说明 |
|------|------|
| `pluginId` | 插件 id（与 manifest.id 一致） |
| `data` | `get` / `set` / `delete`，需 `data:read` / `data:write` |
| `ui` | `registerSettingsPage` / `registerCommand` / `registerWidget`（后两者宿主侧多为占位） |
| `events` | 简单 pub/sub（预留） |
| `i18n` | `t(key)`、`getLanguage()`、`onLanguageChanged(handler)`，使用命名空间 `plugin:<pluginId>` |
| `logger` | 带前缀的 `debug` / `info` / `warn` / `error` |

## `PluginServerContext`

| 成员 | 说明 |
|------|------|
| `pluginId` | 插件 id |
| `logger` | runner 注入的 logger |
| `host` | 可选宿主 API；用于后续受控读写能力扩展 |

## server 插件约束

- server 插件主语言仍然是 `TypeScript`
- server 插件由共享 `plugin-runner` 进程加载
- server 插件不直接拿宿主数据库连接
- server 插件不直接改宿主根路由
- server 能力统一通过宿主网关暴露：
  - `/api/mcp`
  - `/api/plugins/:pluginId/*`
- 宿主最终对外暴露的 tool 名会带命名空间前缀：
  - `plugin.<pluginId>.<toolName>`

## 设置页组件

`ctx.ui.registerSettingsPage(Component)` 中的 **Component** 应为无 props 的 React 函数组件。若需使用 `ctx`，请在 `activate` 内通过闭包传入内部组件（参见 `examples/plugins/hello-world`）。

## 插件翻译

- 第三方插件的可见 UI 文案应来自插件包内 `locales/<locale>.json`，不要依赖宿主 `settings/common/...` 命名空间。
- 推荐始终提供 `locales/en.json` 作为 fallback bundle。
- 宿主会自动发现并加载所有合法的 `locales/*.json`，并合并到 `plugin:<pluginId>` 命名空间。
- React 插件若需要在宿主语言切换后重渲染，可订阅 `ctx.i18n.onLanguageChanged(handler)` 并在回调中刷新本地状态。

## 构建

在插件项目中使用 Vite + `mltpPlugin()`（见 `@my-little-todo/plugin-sdk/vite-plugin`），将 `react` / `react-dom` 设为 **external**，由宿主提供运行时。

## 与数据同步

插件 KV 使用设置键 `plugin:<pluginId>:<key>`；若当前存储后端将 `settings` 纳入同步，则这些键可随账户同步（具体以后端配置为准）。
