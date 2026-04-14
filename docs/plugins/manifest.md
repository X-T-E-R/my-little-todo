# manifest.json 规范

## 包内布局（.mltp）

| 文件 | 必填 | 说明 |
|------|------|------|
| `manifest.json` | 是 | 元数据、权限、UI/server 能力声明 |
| `index.js`（或 `entryPoint` 指定名） | 是 | UI 入口，需 `export default definePlugin(...)` |
| `server.js`（或 `server.entryPoint` 指定名） | 否 | server 入口，需 `export default defineServerPlugin(...)` |
| `styles.css` 等 | 否 | 若声明 `styleSheet`，宿主会注入为带 `data-plugin-id` 的 `<style>` |
| `locales/<locale>.json` | 否 | 会合并进 i18n 命名空间 `plugin:<id>`；`<locale>` 需为合法 BCP47 tag，如 `en`、`zh-CN`、`ja` |
| `README.md` / `icon.png` | 否 | 构建时可一并打入包内 |

## 当前插件模型

- 一个插件包始终有一个 UI 入口。
- 一个插件包可以额外声明一个 `server` 段，用于 MCP tools 与 plugin HTTP routes。
- UI 插件继续以 `TS + React` 为主体验。
- server 插件继续以 `TypeScript` 为主体验，由共享 `plugin-runner` 执行。

## manifest 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 小写 kebab-case，唯一 |
| `name` | string | 显示名称 |
| `version` | string | SemVer 字符串 |
| `minAppVersion` | string | 最低宿主应用版本 |
| `stability` | `'stable' \| 'beta' \| 'experimental'` | 插件稳定性标签 |
| `author` | object? | `name`，可选 `url` |
| `description` | string? | 简短描述 |
| `homepage` | string? | 主页 |
| `license` | string? | 许可证 |
| `permissions` | string[] | 见下表 |
| `entryPoint` | string | UI 入口，默认 `index.js` |
| `styleSheet` | string? | 相对路径 CSS |
| `server` | object? | server 插件声明，见下表 |

### `server` 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `entryPoint` | string | server bundle 入口，例如 `server.js` |
| `capabilities` | `('mcp' \| 'http')[]` | 该 server 插件暴露的能力类型 |
| `mcpTools` | object[]? | MCP tool 元数据，用于宿主 registry / 风险展示 |
| `httpRoutes` | object[]? | HTTP route 元数据，用于宿主网关注册 |

`mcpTools` 单项：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | tool 名。宿主最终会暴露为 `plugin.<pluginId>.<toolName>` |
| `description` | string | tool 描述 |
| `permission` | `'read' \| 'create' \| 'full'` | 宿主 ACL 等级 |

`httpRoutes` 单项：

| 字段 | 类型 | 说明 |
|------|------|------|
| `path` | string | 路由路径，必须以 `/` 开头 |
| `method` | `'GET' \| 'POST' \| 'PUT' \| 'DELETE'` | HTTP 方法 |

### 权限

| 值 | 含义 |
|----|------|
| `data:read` | 读取 `plugin:<id>:*` KV |
| `data:write` | 写入/删除 KV |
| `tasks:read` | 预留（宿主后续可开放） |
| `stream:read` | 预留 |
| `server:run` | 允许宿主启动该插件的 server 能力 |
| `mcp:expose` | 允许宿主暴露该插件声明的 MCP tools |
| `http:expose` | 允许宿主暴露该插件声明的 HTTP routes |
| `ui:settings` | 注册设置页组件 |
| `ui:command` | 预留 |
| `ui:widget` | 预留 |
| `ui:panel` | 预留 |

### 校验规则

- 声明 `server` 时必须同时声明 `server:run`
- 声明 `server.capabilities` 包含 `mcp` 时，必须声明 `mcp:expose` 且至少给出一个 `mcpTools`
- 声明 `server.capabilities` 包含 `http` 时，必须声明 `http:expose` 且至少给出一个 `httpRoutes`

校验实现：`packages/web/src/plugins/pluginManifest.ts`（Zod）。

## 打包约定

- `mltpPlugin()` 会把 `manifest.entryPoint` 和可选 `manifest.server.entryPoint` 对应的 bundle 一并打进 `.mltp`
- 建议把 UI 和 server 都作为独立 ESM entry 输出，文件名直接对齐 manifest，例如：
  - `index.js`
  - `server.js`
- server bundle 应尽量自包含，不要依赖系统 Node 的全局安装

## 市场索引（registry.json）

用于远程浏览与安装，由 `mergeAllRegistryPlugins` 拉取并合并多源：

```json
{
  "schemaVersion": 1,
  "plugins": [
    {
      "id": "hello-world",
      "name": "Hello World",
      "author": "Example",
      "description": "Demo",
      "version": "0.1.0",
      "minAppVersion": "0.5.0",
      "downloadUrl": "https://example.com/hello-world-0.1.0.mltp",
      "homepage": "https://example.com",
      "tags": ["demo"],
      "updatedAt": "2026-04-10T00:00:00Z"
    }
  ]
}
```

`downloadUrl` 必须指向可直接 `GET` 的 `.mltp` 文件（建议 HTTPS）。
