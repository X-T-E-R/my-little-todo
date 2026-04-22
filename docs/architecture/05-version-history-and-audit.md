# 版本历史与审计日志

本文档描述 **产品数据层** 的版本历史能力，不是 Git 提交历史，也不是发布版本号管理。

- 发布版本号管理见：[docs/development/versioning.md](../development/versioning.md)
- 本文档关注的是任务、流记录、设置等运行时数据在产品内部如何保留历史、如何追溯是谁改的

---

## 一、目标

这套设计要解决两类问题：

1. 某个对象以前长什么样
2. 这次修改是通过什么链路发生的

当前实现采用的是：

- **单表 revision log**
- **单表 audit event log**
- **snapshot-first**
- **on-demand diff**

也就是说：

- 最新状态仍然保存在原表里
- 历史不会替代主表
- 不做完整 event sourcing
- 不把 patch/diff 当主存储格式

---

## 二、当前表结构

### `entity_revisions`

用途：保存“某个实体在某次变更后的完整快照”。

关键字段：

- `id`
- `event_id`
- `group_id`
- `user_id`
- `entity_type`
- `entity_id`
- `entity_version`
- `global_version`
- `op`
- `changed_at`
- `snapshot_json`

说明：

- `snapshot_json` 存的是变更后的完整快照
- `op` 当前主要是 `upsert` / `delete`
- `group_id` 用来把“一次高层动作产生的多条底层变更”串起来

### `audit_events`

用途：保存“这次改动是怎么发生的”。

关键字段：

- `id`
- `group_id`
- `user_id`
- `entity_type`
- `entity_id`
- `entity_version`
- `global_version`
- `action`
- `source_kind`
- `actor_type`
- `actor_id`
- `occurred_at`
- `summary_json`

说明：

- `entity_revisions` 偏对象历史
- `audit_events` 偏操作上下文

---

## 三、当前覆盖范围

已经接入历史记录的实体：

- `tasks`
- `stream_entries`
- `settings`
- `blobs`
- `work_threads`（本地 SQLite 路径）

已经接入的运行时：

- Tauri SQLite
- Capacitor SQLite
- Server SQLite provider
- Server Postgres provider

当前对外读取能力：

- `GET /api/history/revisions?entityType=...&entityId=...&limit=...`
- `GET /api/history/events?limit=...&entityType=...&entityId=...`

前端 `DataStore` 也已经暴露：

- `listEntityRevisions(entityType, entityId, limit?)`
- `listAuditEvents(limit?, filters?)`

---

## 四、为什么不是“很多张 revision 表”

这个项目当前选择的是：

- 保留主表为“最新状态”
- 额外只加两张通用历史表

没有采用：

- `task_revisions / stream_revisions / setting_revisions / ...` 这种多表方案
- 完整 event sourcing
- 持久化 diff/patch 作为主格式

这样做的原因：

- 桌面端和服务端要共用一套语义
- schema、provider、store、测试都不想成倍膨胀
- 第一目标是“可读、可追溯、可恢复基础信息”，不是做成审计平台

---

## 五、关键设计点

### 1. snapshot-first

每次写入时：

- 先更新主表
- 同事务追加 revision
- 同事务追加 audit event

revision 第一版存 **完整快照**，不存 patch。

好处：

- 恢复和排查简单
- schema 演进时更稳
- 桌面 SQLite 和服务器 provider 更容易统一

### 2. `group_id`

一次用户动作可能会改多个实体。

最典型的是 task：

- 改 task，本质上会动 `tasks`
- 同时也可能动 `stream_entries`

如果没有 `group_id`，历史里会看到两条彼此无关的记录。  
现在同一次高层动作会共享一个 `group_id`，便于 UI 聚合和排查。

### 3. task history 是 hydrated 的

当前产品语义里：

- `task.body` 的真实来源是 `stream_entries.content`

所以 `tasks` 表本身的原始快照并不总是用户看到的完整任务。  
当前读取 task history 时，会结合对应的 stream revision 做 hydration，得到用户态任务快照。

### 4. settings history 会脱敏

`settings` 里可能混有：

- token
- password
- secret
- api key
- cookie

这类 key 在历史里不会存明文值，只保留：

- `key`
- `value_redacted`
- `value_length`
- 时间和版本信息

当前敏感 key 判断主要基于 key 名包含这些片段：

- `token`
- `password`
- `secret`
- `api-key`
- `api_key`
- `apikey`
- `credential`
- `cookie`

这是保守的一版，不是绝对完备的敏感信息识别。

---

## 六、当前 UI

当前已经落地的 UI 是：

- `TaskDetailPanel` 内的 **Version history**

它会展示：

- 版本时间线
- 操作类型
- 变更时间
- `source / actor / group_id`
- 变更字段摘要
- 可展开的 before / after 对比
- 对应 task 的 audit trail

当前还没有落地的 UI：

- 全局 history browser
- settings / blobs / work-thread 的统一历史面板
- restore / revert 操作界面

---

## 七、当前不做什么

这套能力当前明确 **不等于**：

- Git 风格版本控制
- CRDT 协作版本树
- 完整 event sourcing
- diff 持久化仓库
- 企业级审计平台

它更接近：

- 面向产品对象的版本历史
- 轻量可追溯审计

---

## 八、当前限制

### 1. `source_kind / actor` 还不够细

现在很多记录仍然只会显示成：

- `desktop-ui`
- `server-api`

后续还可以继续细分到：

- `mcp`
- `plugin-runner`
- `sync`
- `import`
- `restore`
- `migration`

### 2. 敏感设置识别仍然是 key-name 规则

如果某个敏感值没有体现在 key 名上，当前版本未必能自动识别。

### 3. 还没有 retention / compaction

历史表会持续增长。  
桌面 SQLite 和服务器数据库后续都需要考虑清理或归档策略。

### 4. 还没有 UI 级恢复

现在能看历史，但还没有在产品里直接“恢复到这一版”的交互。

---

## 九、推荐阅读顺序

如果你想继续改这套能力，建议按这个顺序看：

1. [docs/architecture/01-data-model.md](./01-data-model.md)
2. 本文档
3. [docs/superpowers/plans/2026-04-20-version-history-audit.md](../superpowers/plans/2026-04-20-version-history-audit.md)

如果你想看具体代码入口：

- 服务端 history 逻辑：
  - [crates/server/src/history_audit.rs](/C:/Programs/my-little-todo/crates/server/src/history_audit.rs)
  - [crates/server/src/routes/history.rs](/C:/Programs/my-little-todo/crates/server/src/routes/history.rs)
  - [crates/server/src/providers/sqlite.rs](/C:/Programs/my-little-todo/crates/server/src/providers/sqlite.rs)
  - [crates/server/src/providers/postgres.rs](/C:/Programs/my-little-todo/crates/server/src/providers/postgres.rs)
- 前端和本地存储：
  - [packages/web/src/storage/dataStore.ts](/C:/Programs/my-little-todo/packages/web/src/storage/dataStore.ts)
  - [packages/web/src/storage/historyAudit.ts](/C:/Programs/my-little-todo/packages/web/src/storage/historyAudit.ts)
  - [packages/web/src/components/TaskVersionHistorySection.tsx](/C:/Programs/my-little-todo/packages/web/src/components/TaskVersionHistorySection.tsx)
