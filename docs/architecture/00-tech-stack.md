> 每一个技术选择都附带理由。如果理由不成立了，技术就应该换。

---

## 顶层架构决策

### 产品形态：开箱即用 + Hosted 共享

```
┌─────────────────────────────────────────────────────┐
│                   My Little Todo                    │
│                                                     │
│  Web / Desktop / Mobile 客户端                      │
│  └── 统一连接同一个主项目服务端                      │
│                                                     │
│  /api/session/*   认证与会话                         │
│  /api/tasks       任务 CRUD                          │
│  /api/stream      随记流 CRUD                        │
│  /api/settings    设置存储                           │
│  /api/admin/*     管理员面板                         │
│                                                     │
│                 Axum + sqlx                         │
│              SQLite / Postgres                      │
└─────────────────────────────────────────────────────┘
```

当前默认主线：

- Auth：`embedded | zitadel`
  - 默认 `embedded`
  - 必须开箱即用
  - `embedded` 保留多用户与管理员面板
- Sync：`hosted`
  - 只部署主项目即可用
  - 所有客户端共享同一个中心后端
  - 不再维护 `/api/sync/*` 自研协议

### 为什么继续使用 Rust 后端

- `Axum + sqlx` 已经覆盖本项目当前 hosted 共享模式所需的所有主路径
- 服务端现在承担统一认证、中心数据存储、导入导出、管理面板能力
- Rust 的类型系统让配置、路由、权限边界更稳定

### 为什么不再把 Sync 主线做成 Electric / 自研协议

- 当前真实需求是“一个服务端 + 多个客户端”共享同一份数据
- 为这个场景额外引入 Electric 或重新扩展旧 sync provider，只会增加部署与维护面
- 直接复用现有服务端 CRUD 路径更短、更稳，也更符合“开箱即用优先”

---

## 后端技术栈

### Axum

统一承载：

- `/api/session/*`
- `/api/tasks`
- `/api/stream`
- `/api/settings`
- `/api/admin/*`
- `/api/blobs`
- `/api/backup`
- `/api/mcp`

### sqlx

数据库层继续使用 `sqlx`，运行时支持：

- `sqlite`
- `postgres`

默认推荐：

- 本地 / 小规模共享：`sqlite`
- 明确需要外部数据库时：`postgres`

### DatabaseProvider

统一抽象：

- 用户
- 会话
- 邀请码
- tasks / stream / settings / blobs

业务路由只依赖 trait，不关心底层是 SQLite 还是 Postgres。

### 认证

当前运行时认证只有两条路径：

- `embedded`
  - 服务端本地持久化 session
  - Bearer session token
  - 用户名 / 密码
  - 多用户
  - 管理员创建用户、禁用用户、重置密码、生成邀请码
- `zitadel`
  - OIDC Authorization Code + PKCE
  - 服务端只做 bearer token 校验与 app user 映射

旧 `auth_mode`、本地 JWT fallback、`/api/auth/*` 已退出运行时主路径。

### 服务器配置

```toml
port = 3001
host = "0.0.0.0"
auth_provider = "embedded"
embedded_signup_policy = "invite_only"
sync_mode = "hosted"
db_type = "sqlite"
data_dir = "./data"
```

仅在需要外部 OIDC 时再补：

```toml
auth_provider = "zitadel"
zitadel_issuer = "https://zitadel.example.com"
zitadel_client_id = "web"
zitadel_audience = "api://mlt"
zitadel_admin_role = "mlt-admin"
```

---

## 前端技术栈

- React 19 + TypeScript 5
- Vite 8
- TailwindCSS v4
- Zustand
- Framer Motion

前端当前关键点不是离线优先同步，而是：

- 统一调用主项目服务端
- 根据 `auth_provider` 分支处理 embedded / zitadel 登录流
- 在 hosted 模式下读写中心后端数据

---

## 数据层

### Hosted 共享模式

当前主线的数据流：

```
用户操作
  ↓
Zustand Store
  ↓
ApiDataStore
  ↓
REST API
  ↓
Rust 服务端
  ↓
SQLite / Postgres
```

核心定义：

- 远端真相源：主项目服务端数据库
- 客户端：服务端数据的使用者，不再维护独立同步协议
- WebDAV / API-server sync：不再属于产品同步能力

### 导出 / 导入

继续保留：

- JSON 导出
- Markdown 导出
- JSON 导入
- 管理员导出到磁盘

这些能力服务于备份、迁移、文件导出，不再承担运行时同步角色。

---

## 当前收口结论

- 默认部署不需要 ZITADEL、Electric、Postgres
- 默认服务端只靠主项目 + SQLite 即可开箱即用
- 认证主线已经收口为 `embedded | zitadel`
- 同步主线已经收口为 `hosted`
