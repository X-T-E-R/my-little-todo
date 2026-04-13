# 第三方插件（.mltp）

本目录说明如何为 **My Little Todo** 开发、构建与分发 `.mltp` 插件包。

## 概念

- **`.mltp`**：ZIP 压缩包，内含 `manifest.json`、入口 `index.js`（ESM）、可选样式与 `locales/`。
- **宿主**：桌面（Tauri）或浏览器中运行的 Web 应用；插件代码通过 **Blob URL + `import()`** 加载，在宿主注入的 `PluginContext` 下运行（混合模式：UI 注入 React 树，数据走受控 KV）。
- **与内置「功能模块」**：内置模块仍为编译期注册；第三方插件安装后写入 `plugin:_system:installed_registry`，并与 `module:<id>:enabled` 开关共用同一套模块开关语义。

## 快速开始

1. 参考示例：[`examples/plugins/hello-world`](../../examples/plugins/hello-world)。
2. 安装依赖（在 monorepo 根目录）：`pnpm install`
3. 构建 SDK：`pnpm --filter @my-little-todo/plugin-sdk build`
4. 构建示例插件：`pnpm --filter @example/mltp-hello-world build`  
   产物：`examples/plugins/hello-world/dist/hello-world-0.1.0.mltp`
5. 在应用 **设置 → 插件 → 第三方插件** 中，使用「从文件安装」选择该 `.mltp`。

## 文档索引

- [manifest 规范](./manifest.md)
- [Plugin API 参考](./api.md)

## 插件市场 / 注册表

- 默认注册表 URL 见 `packages/web/src/plugins/types.ts` 中的 `DEFAULT_REGISTRY_URL`（可被用户自定义源覆盖，键名 `plugin:_registry:sources`）。
- 注册表 JSON 形状见 [manifest.md](./manifest.md) 中的「市场索引」一节。
- 自建市场：托管可访问的 `registry.json`，在设置中配置多个源 URL（文档与 UI 扩展可后续完善）。

## 开发模式

在 **设置 → 插件 → 第三方插件** 中开启「插件开发模式」后，可借助「刷新页面」在重新构建 `.mltp` 并覆盖安装后快速验证。

## 安全说明

插件在宿主内与主应用共享 JS 环境，**非强沙箱**。请只安装可信来源的插件；`manifest.permissions` 用于宿主侧能力门控，不能替代操作系统级隔离。
