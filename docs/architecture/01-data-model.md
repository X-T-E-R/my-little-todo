# 数据模型

本文档描述当前已经落地的运行时数据模型，口径以最终方案为准：

- Auth：`embedded | zitadel`
- Sync：`hosted`

---

## 一、数据分层

### L0 — 启动配置

存储位置：

- `config.toml`
- 环境变量（覆盖 TOML）

当前核心字段：

```toml
port = 3001
host = "0.0.0.0"
auth_provider = "embedded"
embedded_signup_policy = "invite_only"
sync_mode = "hosted"
db_type = "sqlite"
data_dir = "./data"
```

可选 Zitadel 字段：

```toml
auth_provider = "zitadel"
zitadel_issuer = "https://zitadel.example.com"
zitadel_client_id = "web"
zitadel_audience = "api://mlt"
zitadel_admin_role = "mlt-admin"
```

### L1 — 用户设置

存储位置：数据库 `settings` 表，通过 `/api/settings` CRUD。

典型键：

- `roles`
- `shortcuts`
- `schedule-blocks`
- `behavior-events`
- `continuous-export`
- `onboarding-completed`

### L2 — 领域内容数据

当前中心存储域：

- `tasks`
- `stream_entries`
- `settings`
- `blobs`

这些数据通过主项目服务端统一读写，多个客户端直接共享同一份后端数据。

---

## 二、数据库 Schema

### 用户

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TEXT NOT NULL
);
```

说明：

- `embedded` 模式使用 `password_hash`
- `zitadel` 模式下，本地用户作为 app user 映射，`password_hash` 可为空字符串
- `is_enabled` 用于禁用用户并使本地 session 失效

### Session

```sql
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT
);
```

说明：

- 仅 `embedded` 模式使用
- Web / Admin / Desktop / Mobile 共用 bearer session token

### Invite

```sql
CREATE TABLE invites (
  code TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  consumed_at TEXT,
  consumed_by TEXT
);
```

说明：

- 默认 `embedded_signup_policy = "invite_only"`
- 管理员可创建邀请码
- 用户消费邀请码后完成注册

### Tasks

任务表是当前 hosted 共享模式的核心领域表之一。保留：

- `id`
- `title`
- `description`
- `status`
- `body`
- `created_at`
- `updated_at`
- `completed_at`
- `priority`
- `phase`
- `kanban_column`
- `task_type`
- `tags`
- `subtask_ids`
- `resources`
- `reminders`
- `submissions`
- `postponements`
- `status_history`
- `progress_logs`
- `version`
- `deleted_at`

### Stream Entries

随记流表保留：

- `id`
- `content`
- `entry_type`
- `timestamp`
- `date_key`
- `role_id`
- `extracted_task_id`
- `tags`
- `attachments`
- `updated_at`
- `version`
- `deleted_at`

### Settings

```sql
CREATE TABLE settings (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  PRIMARY KEY (user_id, key)
);
```

### Blobs

```sql
CREATE TABLE blobs (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT
);
```

---

## 三、DatabaseProvider 抽象

当前 `DatabaseProvider` 统一抽象这些能力：

- 用户管理
- session 管理
- invite 管理
- tasks / stream / settings / blobs

这保证了 `sqlite` 与 `postgres` 在最终运行时契约上保持一致。

---

## 四、API 契约

### Session

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/session/bootstrap` | 返回 `auth_provider`、`needs_setup`、`signup_policy`、`sync_mode` |
| POST | `/api/session/setup` | 创建第一个 owner/admin |
| POST | `/api/session/register` | embedded 自助注册（受 policy 控制） |
| POST | `/api/session/login` | embedded 登录 |
| POST | `/api/session/logout` | embedded 登出 |
| GET | `/api/session/me` | 返回当前 app user |

### Admin

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/users` | 用户列表 |
| POST | `/api/admin/users` | 创建用户 |
| DELETE | `/api/admin/users/:id` | 删除用户 |
| POST | `/api/admin/users/:id/password` | 重置密码 |
| PATCH | `/api/admin/users/:id/status` | 启用 / 禁用用户 |
| GET | `/api/admin/invites` | 邀请码列表 |
| POST | `/api/admin/invites` | 创建邀请码 |

### Hosted 数据接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/PUT/DELETE | `/api/tasks*` | 任务 CRUD |
| GET/PUT/DELETE | `/api/stream*` | 随记流 CRUD |
| GET/PUT/DELETE | `/api/settings*` | 设置 CRUD |
| GET/POST | `/api/export/*` / `/api/import/*` | 导出导入 |

旧 `/api/auth/*` 与 `/api/sync/*` 已退出运行时主路径。

---

## 五、运行时数据流

### Embedded 模式

```
首次启动
  ↓
/api/session/bootstrap → needs_setup = true
  ↓
/api/session/setup
  ↓
服务端创建首个 owner + session
  ↓
后续通过 /api/session/login / logout / me
```

### Invite Only 模式

```
管理员 /admin 创建 invite
  ↓
用户 /api/session/register + invite_code
  ↓
创建普通用户 + 消费 invite + 建立 session
```

### Hosted 模式

```
客户端
  ↓
ApiDataStore
  ↓
REST API
  ↓
主项目服务端
  ↓
SQLite / Postgres
```

这里的 shared 能力来自中心后端数据库，而不是客户端同步协议。

---

## 六、当前明确不再讨论的方向

- `auth_mode`
- 本地 JWT fallback
- `/api/auth/*`
- `/api/sync/*`
- Electric 运行时主线
- WebDAV / API-server sync provider 矩阵
