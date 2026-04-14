> 每一个技术选择都附带理由。如果理由不成立了，技术就应该换。

---

## 顶层架构决策

### 产品形态：本地优先原生端 + Hosted Web

```
┌─────────────────────────────────────────────────────┐
│                   My Little Todo                    │
│                                                     │
│  Web / PWA 客户端                                   │
│  └── 直接连接主项目服务端                            │
│                                                     │
│  Desktop / Android 原生客户端                        │
│  └── 本地 SQLite + 可选 sync provider                │
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
- Hosted Web：`hosted`
  - 只部署主项目即可用
  - Web / PWA 直接读写主项目服务端
- Native Sync：
  - 原生端运行时仍为本地 SQLite
  - 只在用户显式配置时才启用 sync provider
  - provider 可选 `api-server`、`webdav`

### 为什么继续使用 Rust 后端

- `Axum + sqlx` 已经覆盖本项目当前 hosted 共享模式所需的所有主路径
- 服务端现在承担统一认证、中心数据存储、导入导出、管理面板能力
- Rust 的类型系统让配置、路由、权限边界更稳定

### 为什么不把 native runtime 继续做成 server-first

- 桌面与移动端的核心体验仍然是本地优先、离线可用
- 把 native app 启动依赖到 cloud URL / auth / hosted backend，会破坏原始产品边界
- 原生端更适合把服务端或第三方存储作为“可选同步目标”，而不是运行时前提

### 为什么不再把 Hosted Web 主线做成 Electric / 自研协议

- Hosted web 的真实需求是“一个服务端 + 多个浏览器客户端”共享同一份数据
- 为这个场景额外引入 Electric 会增加部署与维护面
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

前端当前关键边界是：

- hosted web 根据 `auth_provider` 分支处理 embedded / zitadel 登录流
- hosted web 直接读写主项目服务端
- native 客户端继续使用本地 SQLite，并通过可选 sync provider 同步

---

## 数据层

### Hosted Web 模式

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
- hosted web 客户端：服务端数据的直接使用者

### Native Sync 模式

当前原生端的数据流：

```
用户操作
  ↓
Zustand Store
  ↓
Tauri / Capacitor SQLite
  ↓
SyncEngine（可选）
  ↓
API Server 或 WebDAV
```

核心定义：

- 本地 SQLite 是 native runtime 的真相源
- `api-server` 与 `webdav` 是可选同步 provider
- auth 只属于服务端宿主；native 本体不要求登录

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
