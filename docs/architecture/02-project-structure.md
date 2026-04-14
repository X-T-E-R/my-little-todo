# 项目结构

本文档只描述当前有效的项目结构与职责边界，按最终运行时方案更新：

- Auth：`embedded | zitadel`
- Sync：`hosted`

---

## 一、服务端

### `crates/server`

```
crates/server/
├── src/
│   ├── auth/
│   │   ├── mod.rs              # 密码哈希、认证工具
│   │   ├── middleware.rs       # Bearer session / OIDC token 验证
│   │   ├── external.rs         # Zitadel / OIDC 校验
│   │   └── jwt.rs              # 仅保留历史测试辅助，不再作为运行时主链路
│   │
│   ├── config.rs               # ServerConfig: embedded|zitadel + hosted
│   ├── lib.rs                  # create_app / start / 路由装配
│   │
│   ├── providers/
│   │   ├── traits.rs           # DatabaseProvider 抽象
│   │   ├── sqlite.rs           # SQLite 实现
│   │   ├── postgres.rs         # PostgreSQL 实现
│   │   └── mod.rs
│   │
│   └── routes/
│       ├── session.rs          # /api/session/*
│       ├── admin.rs            # /api/admin/*
│       ├── tasks.rs            # /api/tasks
│       ├── stream.rs           # /api/stream
│       ├── data.rs             # /api/settings / export / import
│       ├── blobs.rs            # /api/blobs / file-host
│       ├── backup.rs           # /api/backup
│       ├── mcp.rs              # /api/mcp
│       ├── plugins.rs
│       └── mod.rs
```

### 当前关键类型

| 类型 | 位置 | 说明 |
|------|------|------|
| `ServerConfig` | [config.rs](/C:/Users/xxoy1/.codex/worktrees/8021/my-little-todo/crates/server/src/config.rs) | `auth_provider` / `embedded_signup_policy` / `sync_mode` |
| `DatabaseProvider` | [traits.rs](/C:/Users/xxoy1/.codex/worktrees/8021/my-little-todo/crates/server/src/providers/traits.rs) | 用户、session、invite、领域数据统一抽象 |
| `auth_middleware` | [middleware.rs](/C:/Users/xxoy1/.codex/worktrees/8021/my-little-todo/crates/server/src/auth/middleware.rs) | embedded session 或 zitadel bearer token 验证 |
| `session routes` | [session.rs](/C:/Users/xxoy1/.codex/worktrees/8021/my-little-todo/crates/server/src/routes/session.rs) | setup / register / login / logout / me |
| `admin routes` | [admin.rs](/C:/Users/xxoy1/.codex/worktrees/8021/my-little-todo/crates/server/src/routes/admin.rs) | 用户管理、邀请码、统计 |

### 当前明确删除的旧路径

以下已经不是运行时主线：

- `routes/auth.rs`
- `routes/sync.rs`
- `auth_mode`
- legacy JWT fallback

---

## 二、Web / Desktop / Mobile 共享前端

### `packages/web`

```
packages/web/
├── src/
│   ├── views/
│   │   ├── LoginView.tsx       # embedded / zitadel 登录分支
│   │   ├── SettingsView.tsx
│   │   ├── StreamView.tsx
│   │   ├── BoardView.tsx
│   │   ├── NowView.tsx
│   │   └── OnboardingView.tsx
│   │
│   ├── stores/
│   │   ├── authStore.ts        # /api/session/* 客户端
│   │   ├── taskStore.ts
│   │   ├── streamStore.ts
│   │   └── ...
│   │
│   ├── storage/
│   │   ├── apiDataStore.ts     # 当前 hosted 主线
│   │   ├── dataStore.ts
│   │   └── ...
│   │
│   ├── sync/
│   │   ├── serverProbe.ts      # 只做兼容性探测与旧 sync 退役提示
│   │   ├── apiSyncTarget.ts    # 保留 legacy compatibility 错误提示
│   │   └── ...
│   │
│   ├── fileHost/
│   ├── features/
│   ├── components/
│   ├── locales/
│   ├── App.tsx
│   └── main.tsx
```

### 当前前端主线

- 数据主链路：`ApiDataStore`
- 登录主链路：`authStore -> /api/session/*`
- `LoginView` 按 `auth_provider` 分支
- 设置页文案明确展示 hosted 共享模式

### Hosted 的含义

这里的 hosted 不是旧 sync provider，而是：

- 所有客户端请求同一主项目服务端
- 共享同一后端数据库
- 不再维护单独 sync 协议

---

## 三、管理员面板

### `packages/admin`

```
packages/admin/
├── src/
│   ├── AdminApp.tsx            # 仪表盘、用户管理、邀请码
│   ├── api.ts                  # /api/admin/* 调用
│   └── main.tsx
```

当前职责：

- `embedded` 模式：
  - 创建用户
  - 删除用户
  - 启用 / 禁用用户
  - 重置密码
  - 创建邀请码
- `zitadel` 模式：
  - 保留 app 内 admin 能力
  - 不直接管理外部身份本身

---

## 四、模块关系

```
视图层
  ↓
Zustand stores
  ↓
ApiDataStore / session client
  ↓
REST API
  ↓
Rust 服务端
  ↓
SQLite / Postgres
```

这就是当前真正的共享路径。

---

## 五、当前不再作为主线维护的结构

以下内容如果还在仓库中，定位是兼容提示、测试夹具或历史过渡，不是当前产品主线：

- `sync/` 里的 legacy API-server / WebDAV 退役提示
- 历史 `/api/auth/*`、`/api/sync/*` 文档或测试引用
- 面向 Electric / PGlite 主线的旧设计草稿
