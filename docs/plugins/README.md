# 第三方插件（.mltp）

本目录说明如何为 **My Little Todo** 开发、构建与分发 `.mltp` 插件包。

## 概念

- **`.mltp`**：ZIP 压缩包，内含 `manifest.json`、UI 入口、可选 server 入口、可选样式与 `locales/`。
- **宿主**：桌面（Tauri）或浏览器中运行的 Web 应用；UI 插件代码通过宿主受控方式加载，在宿主注入的 `PluginContext` 下运行。
- **server 插件**：由共享 `plugin-runner` 执行，通过宿主统一网关暴露 MCP tools 与 plugin HTTP routes。
- **与内置「功能模块」**：内置模块仍为编译期注册；第三方插件安装后写入 `plugin:_system:installed_registry`，并与 `module:<id>:enabled` 开关共用同一套模块开关语义。

## 快速开始

1. 参考示例：[`examples/plugins/hello-world`](../../examples/plugins/hello-world)。
2. 安装依赖（在 monorepo 根目录）：`pnpm install`
3. 构建 SDK：`pnpm --filter @my-little-todo/plugin-sdk build`
4. 构建共享 runner 骨架：`pnpm --filter @my-little-todo/plugin-runner build`
5. 如需验证桌面端可执行 runner：`pnpm --filter @my-little-todo/plugin-runner build:binary -- --target <target-triple> --output <absolute-output-path>`
6. 构建示例插件：`pnpm --filter @example/mltp-hello-world build`
   产物：`examples/plugins/hello-world/dist/hello-world-0.1.0.mltp`
7. 在应用 **设置 → 插件 → 第三方插件** 中，使用「从文件安装」选择该 `.mltp`。

## 文档索引

- [manifest 规范](./manifest.md)
- [Plugin API 参考](./api.md)
- [Host / Plugin Platform 重构骨架](../architecture/03-host-plugin-platform.md)

## i18n 约定

- 第三方插件应把翻译随包放在 `locales/<locale>.json`，例如 `locales/en.json`、`locales/zh-CN.json`、`locales/ja.json`。
- 插件内可见文案应通过 `ctx.i18n.t(...)` 获取；不要直接复用宿主的 `settings` / `common` 等命名空间。
- 推荐在插件仓库本地测试中接入 `@my-little-todo/plugin-sdk/i18n-test` 校验工具。

## 插件市场 / 注册表

- 默认注册表 URL 见 `packages/web/src/plugins/types.ts` 中的 `DEFAULT_REGISTRY_URL`（可被用户自定义源覆盖，键名 `plugin:_registry:sources`）。
- 注册表 JSON 形状见 [manifest.md](./manifest.md) 中的「市场索引」一节。
- 自建市场：托管可访问的 `registry.json`，在设置中配置多个源 URL（文档与 UI 扩展可后续完善）。

## 开发模式

在 **设置 → 插件 → 第三方插件** 中开启「插件开发模式」后，可借助「刷新页面」在重新构建 `.mltp` 并覆盖安装后快速验证。

## 安全说明

UI 插件在宿主内与主应用共享 JS 环境，**非强沙箱**。请只安装可信来源的插件；`manifest.permissions` 用于宿主侧能力门控，不能替代操作系统级隔离。

server 插件的目标方向是：

- 继续使用 TypeScript 编写
- 通过共享 runner 执行
- 不依赖系统 Node
- 不直接接触宿主数据库连接或根路由

在桌面端，第三方 server 插件还有两个显式前提：

- `embedded-host` 模块必须已启用并处于运行中
- 打包好的 `mlt-plugin-runner` 必须随桌面应用一起存在

## 当前阶段说明

- 目前仓库已经有：
  - `defineServerPlugin()` SDK 入口
  - `plugin-runner` 共享骨架
  - 宿主侧 extension registry / `/api/mcp` / `/api/plugins/:pluginId/*` 网关骨架
  - Tauri 桌面端的 embedded host + bundled `mlt-plugin-runner` 生命周期接线
- 目前还没有：
  - 完整官方 MCP SDK 接线
  - 服务器宿主侧的统一 child-process runner manager
- 所以现在的 server 插件能力已经能在桌面宿主跑起来，但整体仍处于“桌面已接通、服务器端继续收敛”的阶段
