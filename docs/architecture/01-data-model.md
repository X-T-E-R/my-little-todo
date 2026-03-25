# 数据模型与存储格式

> 本文件定义：
> 1. **TypeScript 领域模型** — 前端类型定义
> 2. **数据分层架构** — L0 启动配置 / L1 用户设置 / L2 内容数据
> 3. **数据库 Schema** — SQLite 为默认，通过 DatabaseProvider trait 抽象
> 4. **API 接口** — REST API 端点定义

---

## 一、领域模型（TypeScript 类型）

这些类型定义在 `packages/core/src/models` 中。

### Role（角色）

```typescript
interface Role {
  id: string;                    // 如 "role-graduate", "role-life"
  name: string;                  // 显示名称
  color?: string;                // 色调，如 "#4A90D9"
  icon?: string;                 // 图标标识
  order: number;                 // 侧栏排列顺序
  createdAt: Date;
  lastActiveAt?: Date;
  lastActivitySummary?: string;  // 着陆卡片摘要
}
```

### StreamEntry（流条目）

```typescript
interface Attachment {
  type: 'image' | 'link' | 'file';
  url: string;
  title?: string;
}

type StreamEntryType = 'spark' | 'task' | 'note' | 'journal' | 'log';

interface StreamEntry {
  id: string;                    // 如 "se-20260320-153200"
  content: string;               // 原始文本 (Markdown)
  timestamp: Date;
  tags: string[];
  attachments: Attachment[];     // 图片/链接/文件附件
  extractedTaskId?: string;      // 如果被提取为任务，关联的任务 ID
  roleId?: string;               // 所属角色
  entryType: StreamEntryType;    // 条目类型
}
```

**entryType 说明**：

| 值 | 含义 | 用途 |
|---|---|---|
| `spark` | 灵感/随想（默认） | 快速记录，零摩擦输入 |
| `task` | 已提取为任务 | 系统设置，关联 extractedTaskId |
| `note` | 长笔记/参考 | 用户主动标记的结构化笔记 |
| `journal` | 日记/反思 | 日常总结、心情、复盘 |
| `log` | 进展记录 | 任务/项目的进度更新 |

### Task（任务）

```typescript
type TaskStatus = 'inbox' | 'active' | 'today' | 'completed' | 'archived';
type DdlType = 'hard' | 'commitment' | 'soft';

interface TaskResource {
  type: 'link' | 'file' | 'note';
  url?: string;
  title: string;
  addedAt: Date;
}

interface TaskReminder {
  id: string;
  time: Date;
  notified: boolean;
  label?: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;

  ddl?: Date;
  ddlType?: DdlType;
  plannedAt?: Date;               // 计划执行时间（实施意向）

  roleId?: string;
  tags: string[];
  priority?: number;              // AI 计算的内部优先级分

  body: string;                   // 自由正文 (Markdown)
  subtaskIds: string[];           // 子任务 ID 列表（引用其他 Task）
  parentId?: string;              // 父任务 ID
  sourceStreamId?: string;        // 来源流条目

  resources: TaskResource[];      // 关联资源（链接/文件/笔记）
  reminders: TaskReminder[];      // 提醒列表
  submissions: Submission[];
  postponements: Postponement[];
}
```

### 其他模型

- **ScheduleBlock** (`schedule.ts`) — 日程时段：名称、时间范围、重复规则、角色关联
- **BehaviorEvent** (`behavior.ts`) — 行为事件：推荐接受/拒绝、专注开始/完成/放弃、DDL 达标/错过等
- **AiOperation** (`ai-operation.ts`) — AI 操作记录：可审计、可撤销

---

## 二、数据分层架构

### L0 — 启动配置

存储位置：TOML 文件 (`config.toml`) + 环境变量 (env 覆盖 TOML)

```toml
port = 3001
host = "127.0.0.1"        # PC 默认 127.0.0.1, 服务器默认 0.0.0.0
auth_mode = "none"         # none | single | multi
db_type = "sqlite"         # sqlite | postgres | mysql
data_dir = "./data"
jwt_secret = "auto-generated"
```

L0 决定了服务器如何启动，运行后不可热更改（需重启）。

### L1 — 用户设置

存储位置：数据库 `settings` 表，通过 `/api/settings` CRUD

```
┌──────────────────────┬──────────────────────────────┐
│ key                  │ value (JSON string)          │
├──────────────────────┼──────────────────────────────┤
│ roles                │ [{"id":"r1","name":"工作"...}]│
│ shortcuts            │ [{"id":"s1","keys":"Ctrl+N"}] │
│ schedule-blocks      │ [{"name":"上午","start":"9"}] │
│ behavior-events      │ [{"type":"accepted",...}]     │
│ continuous-export    │ {"enabled":true,"path":"..."}│
│ onboarding-completed │ "true"                       │
│ onboarding-tip-*     │ "dismissed"                  │
└──────────────────────┴──────────────────────────────┘
```

### L2 — 内容数据

存储位置：数据库 `files` 表，通过 `/api/files` CRUD

文件以虚拟路径为 key，内容为 Markdown 字符串：

```
┌──────────────────────────┬─────────────────────────┐
│ path                     │ content                 │
├──────────────────────────┼─────────────────────────┤
│ stream/2026-03-20.md     │ ---\ndate: ...\n---\n.. │
│ tasks/t-20260320-001.md  │ ---\ntitle: ...\n---\n..│
│ archive/2026-03/t-01.md  │ ...                     │
└──────────────────────────┴─────────────────────────┘
```

---

## 三、数据库 Schema

### SQLite 实现 (默认)

服务器端 Schema：

```sql
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
    user_id TEXT NOT NULL,
    path TEXT NOT NULL,
    content TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    PRIMARY KEY (user_id, path)
);

CREATE TABLE IF NOT EXISTS settings (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS blobs (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    size INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    deleted_at TEXT
);
```

原生客户端本地 Schema（`TauriSqliteDataStore` / `CapacitorSqliteDataStore`）：

```sql
CREATE TABLE IF NOT EXISTS files (
    path TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS blobs (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    size INTEGER NOT NULL DEFAULT 0,
    data BLOB,
    created_at TEXT NOT NULL,
    deleted_at TEXT
);
```

> 原生客户端的本地表不含 `user_id` 列——单用户场景，无需区分。

### DatabaseProvider trait

```rust
#[async_trait]
pub trait DatabaseProvider: Send + Sync {
    // 文件操作 (L2)
    async fn get_file(&self, path: &str) -> Result<Option<String>>;
    async fn put_file(&self, path: &str, content: &str) -> Result<()>;
    async fn delete_file(&self, path: &str) -> Result<()>;
    async fn list_files(&self, dir: &str) -> Result<Vec<String>>;
    async fn list_all_files(&self, prefix: &str) -> Result<Vec<String>>;

    // 用户管理
    async fn get_user_by_username(&self, username: &str) -> Result<Option<User>>;
    async fn get_user_by_id(&self, id: &str) -> Result<Option<User>>;
    async fn create_user(&self, user: &NewUser) -> Result<User>;
    async fn update_user_password(&self, id: &str, hash: &str) -> Result<()>;
    async fn delete_user(&self, id: &str) -> Result<()>;
    async fn list_users(&self) -> Result<Vec<User>>;
    async fn count_users(&self) -> Result<i64>;

    // 设置管理 (L1)
    async fn get_setting(&self, user_id: &str, key: &str) -> Result<Option<String>>;
    async fn put_setting(&self, user_id: &str, key: &str, value: &str) -> Result<()>;
    async fn delete_setting(&self, user_id: &str, key: &str) -> Result<()>;
    async fn list_settings(&self, user_id: &str) -> Result<Vec<(String, String)>>;

    // Blob 元数据
    async fn put_blob_meta(&self, id: &str, owner: &str, filename: &str, mime: &str, size: i64) -> Result<()>;
    async fn get_blob_meta(&self, id: &str) -> Result<Option<BlobMeta>>;
    async fn delete_blob_meta(&self, id: &str) -> Result<()>;
    async fn list_blob_metas(&self, owner: &str) -> Result<Vec<BlobMeta>>;

    // 生命周期
    async fn close(&self) -> Result<()>;
}
```

---

## 四、API 接口

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/auth/mode` | 获取认证模式 + needs_setup |
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录，返回 JWT（7 天有效） |
| GET | `/api/auth/me` | 获取当前用户 |
| POST | `/api/auth/change-password` | 修改密码 |
| POST | `/api/auth/api-token` | 生成长期 API Token（需已认证） |

**API Token 生成**：`POST /api/auth/api-token`，请求体：

```json
{ "duration": 31536000 }
```

`duration` 为有效期秒数，0 表示永不过期。返回：

```json
{ "token": "eyJ...", "expires_at": 1742913600 }
```

### 文件 (L2)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/files?path=xxx` | 读取文件内容 |
| PUT | `/api/files` | 写入/更新文件 |
| DELETE | `/api/files?path=xxx` | 删除文件 |
| GET | `/api/files/list` | 列出文件（按目录） |

### 设置 (L1)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings?key=xxx` | 读取设置 |
| GET | `/api/settings` | 列出所有设置 |
| PUT | `/api/settings` | 写入设置 |
| DELETE | `/api/settings?key=xxx` | 删除设置 |

### 导出/导入

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/export/json` | 导出 JSON |
| GET | `/api/export/markdown` | 导出 Markdown |
| POST | `/api/export/disk` | 导出到磁盘目录 |
| POST | `/api/import/json` | 从 JSON 导入 |

### 管理员

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/users` | 用户列表 |
| DELETE | `/api/admin/users/:id` | 删除用户 |
| POST | `/api/admin/users/:id/password` | 重置用户密码 |
| GET | `/api/admin/stats` | 系统统计 |
| GET | `/api/admin/storage` | 存储信息 |
| POST | `/api/admin/migrate` | 数据迁移 |

> 管理员功能通过独立的 `/admin` 页面管理，仅用于服务器模式。

### Blob / 附件

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/blobs/upload` | 上传附件 |
| GET | `/api/blobs/list` | 列出当前用户附件 |
| GET | `/api/blobs/:id` | 获取附件内容 |
| DELETE | `/api/blobs/:id` | 删除附件 |
| GET | `/api/blobs/config` | 获取附件配置（大小限制等） |

### 云备份

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/backup/config` | 获取备份配置 |
| PUT | `/api/backup/config` | 更新备份配置 |
| POST | `/api/backup/run` | 执行备份 |
| GET | `/api/backup/list` | 列出备份记录 |
| POST | `/api/backup/restore` | 从备份恢复 |

### AI

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/ai/shared-config` | 获取管理员共享的 AI 配置（endpoint/model） |

### MCP

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/mcp` | MCP (Model Context Protocol) 端点 |

### 同步

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/sync/push` | 客户端推送变更到服务器 |
| GET | `/api/sync/changes?since={version}` | 客户端拉取服务器变更（自指定版本号） |
| GET | `/api/sync/status` | 获取当前同步版本号 |

所有同步端点需要 `Authorization: Bearer <token>` 请求头。客户端支持两种认证方式：

- **Token 模式**：直接填入长期 API Token 或 JWT
- **账号密码模式**：客户端自动调用 `/api/auth/login` 获取 JWT，缓存并在过期 / 401 时自动重新登录

### 健康检查

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 服务状态、版本、DB 类型、认证模式 |

---

## 五、数据流全景

### Web 客户端（服务器模式）

```
用户操作 (UI)
   │
   ▼
Zustand Store (前端状态)
   │
   ▼
ApiDataStore → REST API 调用 (fetch + JWT)
   │
   ▼
Axum 路由 (Rust 后端)
   │
   ├──→ auth 中间件 (JWT 验证 + user_id 提取)
   │
   ▼
DatabaseProvider (trait)
   │
   ├──→ SQLite (默认)
   ├──→ PostgreSQL
   └──→ MySQL
```

### 原生客户端（本地优先）

```
用户操作 (UI)
   │
   ▼
Zustand Store (前端状态)
   │
   ▼
TauriSqliteDataStore / CapacitorSqliteDataStore
   │
   ▼
本地 SQLite 数据库
   │
   ├──→ SyncEngine (可选，后台同步)
   │      │
   │      ├──→ ApiServerSyncTarget → 服务器 /api/sync/* (Token 或 账号密码认证)
   │      ├──→ WebDavSyncTarget → WebDAV 服务器
   │      └──→ S3SyncTarget → S3 兼容存储
```

### 前端存储层

```
视图层 (views/)
  │ 读取
  ▼
Zustand Store (stores/)
  │ 调用
  ▼
DataStore 接口 (storage/dataStore.ts)
  │
  ├── ApiDataStore ──→ REST API ──→ Rust 后端 (Web)
  ├── TauriSqliteDataStore ──→ 本地 SQLite (Tauri)
  └── CapacitorSqliteDataStore ──→ 本地 SQLite (Android)
```

### 启动流程

```
App 启动
  │
  ├── 原生客户端？
  │     │
  │     ├── 是 → authChecked=true，跳过认证
  │     │        初始化本地 DataStore (SQLite)
  │     │
  │     └── 否 → 检查 authMode (/api/auth/mode)
  │           │
  │           ├── "none" → 跳过认证，直接进入
  │           │
  │           └── "single"/"multi" → 检查 token
  │                 │
  │                 ├── 有 token → 验证 → 进入 or 登录页
  │                 └── 无 token → 显示登录页
  │
  ├── 检查 onboarding-completed
  │     │
  │     ├── 未完成 → 显示引导流程
  │     └── 已完成 → 进入主界面
  │
  └── 加载数据 (stream, tasks, roles, shortcuts, schedules)
```
