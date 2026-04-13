# 核心模块：理一理 (Think Session)

> 对应内置模块 ID：`think-session`，在设置 → 插件 → 核心插件 中可开关。

## 定位

在 **流（Stream）** 与 **承诺板（Board）** 之间的中观层：会话式 Markdown 思考空间，帮助用户从混沌走向清晰决策。

在 Work Thread 2.0 中，`think-session` 模块承载两种工作区：

- `session`：轻量整理与自由书写
- `thread`：工作线程运行时（可恢复上下文环境）

其中工作线程的产品边界与调度语义，详见 [work-thread-runtime.md](./work-thread-runtime.md)。

与 **Brain Dump（`brain-dump`）** 并存：

| 模块 | 粒度 | 形态 |
|------|------|------|
| Brain Dump | 秒级随手记 | 浮层，逐行写入 Stream spark |
| 理一理 | 分钟级整理 | Stream Tab 内模式，SQLite 持久化会话 |
| 工作线程 | 持续推进 | Stream Tab 内线程运行时，SQLite/KV 持久化 |

## 原则

- 可关闭：关闭后隐藏 Stream 内切换、Now 入口、快捷键，主流程不崩溃。
- 不制造焦虑：Discovery 文案做降维，不堆砌未完成总数。
- 先写后整理：三种起步方式可选；用户可直接打字跳过引导。

## 数据

- 表 `think_sessions`：本地 SQLite（Tauri / Capacitor）；Web API 模式下使用设置 KV 备份 JSON。
- 表 `work_threads` / `work_thread_events`：本地 SQLite（Tauri / Capacitor）；Web API 模式下使用设置 KV 备份 JSON。
- 行为事件：`think_session_started` / `think_session_completed`（可选接入行为引擎）。

## AI

- 依赖用户配置的 OpenAI 兼容接口（`ai-api-key` / `ai-api-endpoint` / `ai-model`）。
- 未配置时：Arrange 仍可用（纯本地 Markdown）；Discovery / 行动提取提示在设置中配置 API。
