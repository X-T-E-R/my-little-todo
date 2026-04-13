# Plugin API 参考

类型定义与 `definePlugin` 来自 **`@my-little-todo/plugin-sdk`**。

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

## `PluginContext`

| 成员 | 说明 |
|------|------|
| `pluginId` | 插件 id（与 manifest.id 一致） |
| `data` | `get` / `set` / `delete`，需 `data:read` / `data:write` |
| `ui` | `registerSettingsPage` / `registerCommand` / `registerWidget`（后两者宿主侧多为占位） |
| `events` | 简单 pub/sub（预留） |
| `i18n` | `t(key)`，使用命名空间 `plugin:<pluginId>` |
| `logger` | 带前缀的 `debug` / `info` / `warn` / `error` |

## 设置页组件

`ctx.ui.registerSettingsPage(Component)` 中的 **Component** 应为无 props 的 React 函数组件。若需使用 `ctx`，请在 `activate` 内通过闭包传入内部组件（参见 `examples/plugins/hello-world`）。

## 构建

在插件项目中使用 Vite + `mltpPlugin()`（见 `@my-little-todo/plugin-sdk/vite-plugin`），将 `react` / `react-dom` 设为 **external**，由宿主提供运行时。

## 与数据同步

插件 KV 使用设置键 `plugin:<pluginId>:<key>`；若当前存储后端将 `settings` 纳入同步，则这些键可随账户同步（具体以后端配置为准）。
