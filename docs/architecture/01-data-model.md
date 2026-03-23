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
interface StreamEntry {
  id: string;                    // 如 "se-20260320-153200-abc"
  content: string;               // 原始文本 (Markdown)
  timestamp: Date;
  tags: string[];
  type?: StreamEntryType;        // 'note' | 'task' | 'idea' | 'log'
  roleId?: string;               // 所属角色
  subtasks?: SubTask[];          // 子任务列表
  ddl?: Date;                    // 截止日期
  parentId?: string;             // 父条目 ID
}
```

### Task（任务）

```typescript
interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;

  ddl?: Date;
  ddlType?: 'hard' | 'commitment' | 'soft';

  roleId?: string;
  tags: string[];
  priority?: number;             // 内部优先级分

  body: string;                  // 自由正文 (Markdown)
  subtasks?: SubTask[];          // 子任务
  parentId?: string;             // 父任务 ID
  sourceStreamId?: string;       // 来源流条目

  submissions: Submission[];
  postponements: Postponement[];
}

type TaskStatus = 'inbox' | 'active' | 'today' | 'completed' | 'archived';
```

---

## 二、数据分层架构

### L0 — 启动配置

存储位置：TOML 文件 (`config.toml`) + 环境变量 (env 覆盖 TOML)

```toml
port = 23019
host = "127.0.0.1"        # PC 默认 127.0.0.1, 服务器默认 0.0.0.0
auth_mode = "none"         # none | single | multi
db_type = "sqlite"         # sqlite | postgres | mysql | mongodb
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
    PRIMARY KEY (user_id, path)
);

CREATE TABLE IF NOT EXISTS settings (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
);
```

### DatabaseProvider trait

```rust
#[async_trait]
pub trait DatabaseProvider: Send + Sync {
    // 文件操作
    async fn list_files(&self, user_id: &str, prefix: &str) -> Result<Vec<String>>;
    async fn get_file(&self, user_id: &str, path: &str) -> Result<Option<String>>;
    async fn put_file(&self, user_id: &str, path: &str, content: &str) -> Result<()>;
    async fn delete_file(&self, user_id: &str, path: &str) -> Result<()>;
    async fn list_all_files(&self, user_id: &str) -> Result<Vec<String>>;

    // 用户管理
    async fn create_user(&self, id: &str, username: &str, hash: &str, admin: bool) -> Result<()>;
    async fn get_user_by_username(&self, username: &str) -> Result<Option<UserRecord>>;
    async fn list_users(&self) -> Result<Vec<UserRecord>>;
    async fn delete_user(&self, id: &str) -> Result<()>;
    async fn update_password(&self, id: &str, new_hash: &str) -> Result<()>;
    async fn count_users(&self) -> Result<i64>;

    // 设置管理
    async fn get_setting(&self, user_id: &str, key: &str) -> Result<Option<String>>;
    async fn put_setting(&self, user_id: &str, key: &str, value: &str) -> Result<()>;
    async fn delete_setting(&self, user_id: &str, key: &str) -> Result<()>;
    async fn list_settings(&self, user_id: &str) -> Result<Vec<(String, String)>>;
}
```

---

## 四、API 接口

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录，返回 JWT |
| POST | `/api/auth/register` | 注册 |
| GET | `/api/auth/me` | 获取当前用户 |
| POST | `/api/auth/change-password` | 修改密码 |
| GET | `/api/auth/mode` | 获取认证模式 |

### 文件 (L2)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/files?path=xxx` | 读取文件内容 |
| GET | `/api/files?prefix=xxx` | 列出文件 |
| PUT | `/api/files` | 写入/更新文件 |
| DELETE | `/api/files?path=xxx` | 删除文件 |

### 设置 (L1)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings?key=xxx` | 读取设置 |
| GET | `/api/settings` | 列出所有设置 |
| PUT | `/api/settings` | 写入设置 |
| DELETE | `/api/settings?key=xxx` | 删除设置 |

### 管理员

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/users` | 用户列表 |
| DELETE | `/api/admin/users/:id` | 删除用户 |
| POST | `/api/admin/reset-password` | 重置密码 |
| GET | `/api/admin/stats` | 系统统计 |
| GET | `/api/admin/storage-info` | 存储信息 |
| POST | `/api/admin/migrate` | 数据迁移 |

### 导出/导入

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/export/json` | 导出 JSON |
| GET | `/api/export/markdown` | 导出 Markdown |
| POST | `/api/export/disk` | 导出到磁盘目录 |
| POST | `/api/import/json` | 从 JSON 导入 |

---

## 五、数据流全景

```
用户操作 (UI)
   │
   ▼
Zustand Store (前端状态)
   │
   ▼
REST API 调用 (fetch + JWT)
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
   ├──→ MySQL
   └──→ MongoDB
           │
           ▼
      数据持久化
           │
           ├──→ 持续导出 (可选，镜像到磁盘)
           └──→ 云备份 (可选，S3/WebDAV)
```

### 前端存储层

```
视图层 (views/)
  │ 读取
  ▼
Zustand Store (stores/)
  │ 调用
  ▼
StorageAdapter (storage/adapter.ts)
  │ HTTP 请求
  ▼
apiClient.ts ──→ REST API ──→ Rust 后端
settingsApi.ts ──→ /api/settings ──→ Rust 后端
```

### 认证流程

```
App 启动
  │
  ├── 检查 authMode (/api/auth/mode)
  │     │
  │     ├── "none" → 跳过认证，直接进入
  │     │
  │     └── "single"/"multi" → 检查 localStorage 中的 token
  │           │
  │           ├── 有 token → 验证 (/api/auth/me) → 进入 or 登录页
  │           │
  │           └── 无 token → 显示登录页
  │
  ├── 检查 onboarding-completed 设置
  │     │
  │     ├── 未完成 → 显示引导流程
  │     │
  │     └── 已完成 → 进入主界面
  │
  └── 加载数据 (stream, tasks, roles, shortcuts, schedules)
```
