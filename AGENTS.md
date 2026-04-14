# 项目级 Agent 规则

本文件记录未发布阶段的骨架重构边界，用来避免继续把本项目做成“自研平台集合”。

## 当前架构方向

- 产品同时支持桌面宿主与服务器宿主。
- 插件主语言必须继续保持为 `TS + React`。
- 插件服务端能力通过共享 runner 执行，不直接塞进宿主进程。

## 明确不要继续自研扩张的部分

- 不做嵌入式 JS runtime：
  - 不引入 `deno_core`
  - 不引入 QuickJS
  - 不自己实现 JS module loader / host ABI / sandbox runtime
- 不继续把手写 Rust MCP 协议层当成未来主承载：
  - 现有 `/api/mcp` 保留为宿主网关
  - 新 runner 一律优先使用官方 MCP SDK
- 不把 auth 扩张成身份平台：
  - 不新增 MFA / SSO / 组织 / 租户 / 企业级 RBAC
- 不把 sync 扩张成协作平台：
  - 不新增 CRDT、实时协作、多主复制、复杂冲突求解

## 允许继续演进的部分

- `work-thread`、`tasks`、`stream`、`roles`、`think-session` 等产品领域模型
- 插件 manifest / 权限 / 风险提示 / 宿主启停门闩
- 桌面宿主能力：窗口、托盘、原生 bridge、sidecar 生命周期
- 统一宿主网关：
  - `/api/mcp`
  - `/api/plugins/:pluginId/*`
  - extension registry

## runner 方向

- 共享 runner 使用 TypeScript 实现
- 目标产物是单独可执行程序 `mlt-plugin-runner`
- 目标打包方式是 `deno compile`
- 桌面与服务器只负责生命周期管理，不各自维护不同 runtime 内核

## 插件系统边界

- UI 插件：继续 `TS + React`
- Server 插件：继续 `TS`
- 不迁移到 Extism 作为主插件体系
- 如未来引入 Extism，只能作为“纯逻辑副体系”，不能替代 TS + React 主模型
