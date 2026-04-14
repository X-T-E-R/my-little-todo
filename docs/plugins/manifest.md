# manifest.json 规范

## 包内布局（.mltp）

| 文件 | 必填 | 说明 |
|------|------|------|
| `manifest.json` | 是 | 元数据与权限 |
| `index.js`（或 `entryPoint` 指定名） | 是 | ESM 入口，需 `export default definePlugin(...)` |
| `styles.css` 等 | 否 | 若声明 `styleSheet`，宿主会注入为带 `data-plugin-id` 的 `<style>` |
| `locales/<locale>.json` | 否 | 会合并进 i18n 命名空间 `plugin:<id>`；`<locale>` 需为合法 BCP47 tag，如 `en`、`zh-CN`、`ja` |
| `README.md` / `icon.png` | 否 | 构建时可一并打入包内 |

## manifest 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 小写 kebab-case，唯一 |
| `name` | string | 显示名称 |
| `version` | string | SemVer 字符串 |
| `minAppVersion` | string | 最低宿主应用版本 |
| `author` | object? | `name`，可选 `url` |
| `description` | string? | 简短描述 |
| `homepage` | string? | 主页 |
| `license` | string? | 许可证 |
| `permissions` | string[] | 见下表 |
| `entryPoint` | string | 默认 `index.js` |
| `styleSheet` | string? | 相对路径 CSS |

### 权限

| 值 | 含义 |
|----|------|
| `data:read` | 读取 `plugin:<id>:*` KV |
| `data:write` | 写入/删除 KV |
| `tasks:read` | 预留（宿主后续可开放） |
| `stream:read` | 预留 |
| `ui:settings` | 注册设置页组件 |
| `ui:command` | 预留 |
| `ui:widget` | 预留 |
| `ui:panel` | 预留 |

校验实现：`packages/web/src/plugins/pluginManifest.ts`（Zod）。

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
