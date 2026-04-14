# Host / Plugin Platform 重构骨架

> 未发布阶段的骨架级重构说明。目标不是补功能，而是停止继续长成自研平台集合。

---

## 目标边界

- 产品仍同时支持：
  - 桌面宿主（Tauri）
  - 服务器宿主（`mlt-server`）
- 插件主语言继续是：
  - UI 插件：`TS + React`
  - Server 插件：`TS`
- 插件服务端能力通过共享 runner 执行，不直接运行在宿主进程内。

---

## 四层结构

### 1. 产品领域层

负责：

- `tasks`
- `stream`
- `roles`
- `work-thread`
- `think-session`
- `file-host`

这些模块只负责：

- 数据模型
- 规则
- 状态机
- 持久化接口

不负责：

- MCP 协议实现
- 进程管理
- 插件执行 runtime

### 2. 宿主平台层

两个宿主共享相同的能力模型：

- module enable / disable
- extension registry
- runner lifecycle
- MCP / API gateway

差异只保留在：

- 谁来启动 runner
- 插件根目录位置
- 哪些原生能力可用

### 3. 插件执行层

- `plugin-sdk`：UI + server plugin 定义
- `plugin-runner`：共享 server plugin 执行器

约束：

- 不做嵌入式 JS runtime
- 不使用 Extism 作为主插件模型
- 不把插件 server 代码直接塞进宿主进程

### 4. 可替换基础设施层

- auth：当前冻结范围，未来可替换为 `Ory` / `ZITADEL`
- sync：当前冻结范围，未来可替换为 `Electric`
- MCP SDK：runner 侧一律使用官方 SDK

---

## 明确不继续扩张的部分

### MCP

- 现有 Rust `/api/mcp` 保留为宿主网关
- 不再作为未来 MCP 协议细节的主实现中心
- 新 runner 一律优先使用官方 MCP TypeScript SDK

### Auth

- 当前只保留：
  - 本地用户
  - 基本 token
  - 轻量自托管
- 不继续做：
  - MFA
  - SSO
  - 组织
  - 租户
  - 企业级身份能力

### Sync

- 当前只保留：
  - 本地存储
  - API 同步
  - Markdown sync
- 不继续做：
  - 平台级实时协作
  - 复杂冲突求解
  - CRDT 平台
  - 多主复制

---

## runner 方向

共享 runner 的目标：

- 代码语言：TypeScript
- MCP 层：官方 MCP TypeScript SDK
- 打包方式：`deno compile`
- 运行方式：
  - 桌面端 sidecar / child process
  - 服务器端 child process

runner 只负责：

- 加载 `server.entryPoint`
- 提供本地 loopback HTTP
- 暴露 `/health`、`/mcp/tools/*`、插件 HTTP routes

宿主负责：

- 生命周期
- 健康检查
- registry 同步
- 对外网关

---

## 为什么不采用 Extism 作为主体系

- Extism 主模型是 Wasm plugin，不适合保持 `TS + React` 为主插件体验
- 即使使用 JS PDK，也更适合纯逻辑执行，不适合作为 React 插件宿主
- 因此 Extism 最多只保留为未来“纯逻辑副体系”的研究选项

---

## 当前迁移策略

### 先落地

- 新的 `defineServerPlugin()` SDK 入口
- 共享 `plugin-runner` 目录与协议骨架
- 项目级规则与文档边界

### 后续继续

- runner 真正实现
- 桌面宿主 `src-tauri` 生命周期管理
- 服务器宿主 runner manager
- `/api/mcp` 和 `/api/plugins/*` 彻底收敛成网关层
