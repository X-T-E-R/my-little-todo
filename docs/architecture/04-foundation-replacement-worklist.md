# 基础设施替换与减负执行清单

> 给并行 AI agent 的执行文档。目标不是继续堆平台能力，而是把当前未发布产品收敛成“产品领域 + 双宿主 + 共享 runner + 可替换基础设施”。

---

## 总目标

- 保留：
  - 产品领域模块
  - `TS + React` UI 插件模型
  - `TS` server 插件模型
  - 宿主统一网关：`/api/mcp`、`/api/plugins/:pluginId/*`
- 停止继续自研：
  - 嵌入式 JS runtime
  - 手写 MCP 协议栈扩张
  - 平台级 auth 产品化
  - 平台级 sync 产品化
- 重构结果：
  - 宿主只做 lifecycle / gateway / ACL / registry
  - runner 只做插件 server 执行
  - auth / sync / MCP 都有明确“冻结边界”和未来替换口

---

## 硬约束

- 插件主开发体验不能离开 `TS + React`
- 不采用 Extism 作为主插件体系
- 不引入 `deno_core` / QuickJS / 自写 loader / 自写 ABI
- `/api/mcp` 继续存在，但只做宿主网关
- `/api/plugins/:pluginId/*` 继续存在，但只做宿主网关

---

## Workstream A：Runner 正式化

### 背景

当前仓库已经有：

- `packages/plugin-runner`
- `defineServerPlugin()`
- loopback HTTP 骨架

但还没有：

- 官方 MCP TypeScript SDK 接线
- `deno compile` 打包产物
- 桌面与服务器的正式宿主启动器

### 目标

把 `plugin-runner` 从“骨架”推进到“可被双宿主复用的正式执行器”。

### 交付范围

- 在 `packages/plugin-runner` 接入官方 MCP TypeScript SDK
- 保持 HTTP 端点：
  - `GET /health`
  - `POST /mcp/tools/list`
  - `POST /mcp/tools/call`
- 增加 `deno compile` 构建链路
- 约定统一 token header：`x-mlt-plugin-token`

### 不做

- 不做自定义 MCP 协议实现
- 不做自定义 JS sandbox
- 不做插件数据库直连

### 建议落点

- `packages/plugin-runner/src/*`
- `packages/plugin-runner/package.json`
- `packages/plugin-runner/README.md`
- `packages/plugin-runner/runner-contract.md`

### 验收

- runner 可被独立启动
- 能加载一个 `defineServerPlugin()` 插件
- tool list / tool call / route proxy 可用
- `deno compile` 能产出单文件可执行物

---

## Workstream B：服务器宿主 Runner Manager

### 背景

`crates/server` 已经有：

- extension registry
- `/api/mcp` 插件代理
- `/api/plugins/:pluginId/*` 插件代理

还缺：

- 真正的 child-process runner manager
- 端口分配、健康检查、崩溃摘除

### 目标

让 `mlt-server` 自己能管理第三方 server 插件进程，而不是只等前端注册。

### 交付范围

- 在 Rust 端新增 runner manager
- 根据插件安装记录与 enable 状态：
  - spawn runner
  - 分配 loopback 端口
  - 下发 token
  - 做健康检查
  - 崩溃后摘除 extension registry
- 让 registry 成为运行态真相源，不依赖静态 UI 状态

### 不做

- 不把第三方 JS 放进 Rust 进程执行
- 不在 `mcp.rs` 里继续塞业务逻辑

### 建议落点

- `crates/server/src/lib.rs`
- `crates/server/src/extension_registry.rs`
- 新增 `crates/server/src/plugin_runner_manager.rs`
- `crates/server/src/routes/mcp.rs`
- `crates/server/src/routes/plugins.rs`

### 验收

- 服务端部署模式下可自动拉起 runner
- runner 崩溃不会拖垮宿主
- provider unavailable 会同步反映到 `/api/mcp` 与 `/api/plugins/*`

---

## Workstream C：桌面宿主 Runner Launcher

### 背景

当前 web 侧只有 runtime manager 骨架，真实进程生命周期不在 `src-tauri`。

### 目标

把“真实启动 runner”的职责下沉到桌面宿主，前端只做编排和状态展示。

### 交付范围

- 在 `packages/web/src-tauri` 增加 sidecar / child-process 启动能力
- 前端只保留：
  - enable / disable 时触发
  - 状态流展示
  - register / unregister 协调
- 宿主负责：
  - 插件根目录解析
  - 端口分配
  - token 生成
  - 退出事件上报

### 不做

- 不把启动逻辑继续放在浏览器态 TS 里
- 不要求系统 Node

### 建议落点

- `packages/web/src-tauri/src/*`
- `packages/web/src/plugins/pluginServerRuntime.ts`
- `packages/web/src/plugins/pluginStore.ts`

### 验收

- Tauri 下 enable server plugin 时可真实拉起 runner
- disable / uninstall 时能正确停止
- UI 正确显示 `inactive -> starting -> running -> unavailable`

---

## Workstream D：MCP 网关降级为“网关层”

### 背景

当前 Rust MCP 已经兼顾了太多实现细节，虽然第一阶段已经加入 registry，但还没有真正完成“网关化”。

### 目标

把 MCP 明确降级成：

- transport adapter
- tool registry aggregation
- ACL / permission gate
- provider dispatch

### 交付范围

- 继续拆分 `mcp.rs`
- 内置 provider 与第三方 provider 使用统一 dispatch 思路
- 新 MCP 能力默认优先进 runner / 官方 MCP SDK，而不是继续写 Rust 协议细节

### 不做

- 不删除 `/api/mcp`
- 不引入第二套 MCP 服务器对外形态

### 建议落点

- `crates/server/src/routes/mcp.rs`
- 新增：
  - `crates/server/src/mcp_transport.rs`
  - `crates/server/src/mcp_builtin_tools.rs`
  - `crates/server/src/mcp_plugin_proxy.rs`

### 验收

- `mcp.rs` 不再承载大部分业务实现
- 第三方工具调用完全走 provider proxy
- 内置 `work_thread.*` 和未来 plugin tools 的生命周期语义一致

---

## Workstream E：Auth Provider Seams

### 背景

当前 auth 已经能工作，但产品未发布，不应该继续长成身份平台。

### 目标

冻结当前 auth 范围，并抽成可替换 provider seam，为未来接 `Ory` 或 `ZITADEL` 留出口。

### 交付范围

- 审计当前 auth 功能边界
- 明确以下为冻结范围：
  - 本地用户
  - JWT / basic token
  - 轻量自托管
- 抽象 provider seam：
  - login
  - register
  - me/session lookup
  - api token issue / revoke
- 在文档和代码里明确：
  - 不做 MFA
  - 不做 SSO
  - 不做组织/租户

### 不做

- 不立即接入 Ory / ZITADEL
- 不做数据迁移项目

### 建议落点

- `crates/server/src/auth/*`
- `crates/server/src/config.rs`
- 新增 `docs/architecture/auth-boundary.md`

### 验收

- auth 入口被 provider seam 包裹
- 新需求不会再直接往当前 auth 里堆企业特性
- 文档明确未来替换方向与当前非目标

---

## Workstream F：Sync Provider Seams

### 背景

当前 sync 已覆盖本地、API、WebDAV、部分 Markdown 路径，但不该继续长成实时协作平台。

### 目标

冻结 sync 范围，并为未来 serious server-centric sync / realtime 路线预留 `Electric` 替换口。

### 交付范围

- 审计现有 sync target
- 抽象 sync provider seam：
  - push
  - pull
  - status/version
  - conflict policy hook
- 在文档和代码里明确以下非目标：
  - CRDT
  - 实时协作
  - 多主复制
  - 复杂冲突求解平台

### 不做

- 不立即集成 Electric
- 不把现有本地优先模型推翻重来

### 建议落点

- `packages/web/src/sync/*`
- `crates/server/src/routes/sync.rs`
- 新增 `docs/architecture/sync-boundary.md`

### 验收

- sync 行为入口有清晰 provider seam
- “现有 sync 能继续工作”和“未来可替换”两件事都能同时成立

---

## Workstream G：自研 runtime 彻底收口

### 背景

这条线不是“实现任务”，而是“确保不会死灰复燃”的收口任务。

### 目标

把以下方向明确标记为停止：

- `deno_core`
- QuickJS
- 自写 module loader
- 自写 host ABI
- 自写 JS sandbox runtime

### 交付范围

- 搜索仓库内残留设计稿 / TODO / 注释
- 删除或改写误导性描述
- 所有插件 runtime 相关文档统一口径为：
  - shared runner
  - TypeScript
  - official MCP SDK
  - `deno compile`

### 验收

- 仓库中不再出现“未来想自己做 JS runtime”的主线表述
- 项目规则与文档一致

---

## 推荐并行顺序

### Wave 1

- A：Runner 正式化
- E：Auth Provider Seams
- F：Sync Provider Seams

### Wave 2

- B：服务器宿主 Runner Manager
- C：桌面宿主 Runner Launcher

### Wave 3

- D：MCP 网关降级
- G：自研 runtime 收口

---

## 交付格式要求

每个 agent 的提交至少包含：

- 修改摘要
- 改动文件列表
- 边界说明：做了什么 / 没做什么
- 验证命令与结果
- 对后续 wave 的影响

---

## 总验收口径

最终我们要得到的是：

- 插件继续是 `TS + React` 主体验
- server 插件继续是 `TS`
- 桌面与服务器都启动同一 runner 产物
- `/api/mcp` 与 `/api/plugins/:pluginId/*` 是稳定宿主网关
- MCP / auth / sync 不再继续长成自研平台
