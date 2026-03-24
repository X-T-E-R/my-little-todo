# 技术栈选型与架构

> 每一个技术选择都附带理由。如果理由不成立了，技术就应该换。

---

## 顶层架构决策

### 产品形态：Rust 统一后端 + 多前端

```
                    ┌──────────────────────┐
                    │   crates/server      │  ← Rust 共享后端库
                    │   (mlt-server)       │     Axum + sqlx + JWT
                    └──────────┬───────────┘
                               │ REST API
          ┌────────────────────┼─────────────────────┐
          │                    │                     │
   ┌──────▼─────────┐  ┌─────▼──────────┐  ┌──────▼──────────┐
   │  PC 桌面端      │  │  纯服务器模式  │  │  管理员面板      │
   │  Tauri 2        │  │  server-bin    │  │  React SPA       │
   │  (内嵌后端)      │  │  (独立二进制)  │  │  /admin          │
   └────────┬────────┘  └───────────────┘  └─────────────────┘
            │
   ┌────────▼────────┐
   │  packages/web    │  ← React 前端 (共享)
   │  共用于桌面/网页  │     同一套代码，不同入口
   └─────────────────┘
```

**前端客户端一览**：
- **PC 桌面端** (Tauri 2)：内嵌 Rust 后端，默认 SQLite，单用户无密码
- **网页端**：访问独立服务器或 PC 服务器，JWT 认证
- **手机端** (PWA/Capacitor)：通过浏览器或原生壳访问 API
- **管理员面板**：独立 SPA，用于用户管理和系统监控

### 为什么 Rust 统一后端？

- **代码复用最大化**：PC 内嵌和独立服务器共享 100% 后端代码（`crates/server` 库）
- **性能卓越**：Rust 的内存安全和零成本抽象，Axum 异步 HTTP 性能极高
- **跨平台一致**：Tauri 2 本身就是 Rust，后端 crate 自然集成无 FFI 开销
- **数据库灵活性**：通过 `DatabaseProvider` trait 抽象，支持 SQLite/PostgreSQL/MySQL
- **安全性**：类型系统在编译期捕获错误，JWT + Argon2 认证

### 为什么不用 Node.js 后端？

早期曾考虑 Node.js (Express/Hono) 后端，但存在以下问题：
- Tauri 内嵌 Node.js 需要 sidecar，增加 ~60MB 体积和启动延迟
- Rust ↔ Node.js 两套代码无法复用
- 多数据库支持在 Node.js 中需要多个 ORM (Drizzle/Prisma/Mongoose)，维护成本高
- Rust 原生性能和安全性优势显著

---

## 后端技术栈

### Axum (HTTP 框架)

Tokio 团队出品的异步 Web 框架。类型安全的路由提取器、Tower 中间件生态、编译期路由检查。

### sqlx (数据库)

编译期检查 SQL 的异步 Rust 数据库库。虽然不是传统 ORM，但提供了：
- 编译期 SQL 验证 (可选)
- 异步连接池
- 多数据库支持 (SQLite/PostgreSQL/MySQL)
- 自动迁移

### DatabaseProvider trait

```rust
#[async_trait]
pub trait DatabaseProvider: Send + Sync {
    async fn get_file(&self, path: &str) -> Result<Option<String>>;
    async fn put_file(&self, path: &str, content: &str) -> Result<()>;
    async fn delete_file(&self, path: &str) -> Result<()>;
    async fn list_files(&self, dir: &str) -> Result<Vec<String>>;
    // + 用户管理、设置 CRUD、Blob 元数据
}
```

统一抽象所有存储操作，SQLite/PostgreSQL/MySQL 各自实现。业务路由只依赖 trait，不关心底层数据库。

### JWT + Argon2 认证

- 无状态 JWT token，支持多端同时登录
- Argon2 密码哈希（抗 GPU 暴力破解）
- 三种认证模式：`none` (无密码) / `single` (单用户) / `multi` (多用户)
- PC 模式默认 `none`，服务器模式默认 `multi`

### 服务器配置

支持 TOML 配置文件 + 环境变量（env 覆盖 TOML）：

```toml
port = 3001
host = "0.0.0.0"
auth_mode = "multi"
db_type = "sqlite"
data_dir = "./data"
jwt_secret = "your-secret"
```

---

## 前端技术栈

### React 19 + TypeScript 5

生态最成熟，组件库/动画库选择最多。

### Vite 8

纯客户端 SPA，不需要 SSR/SSG。Vite 更轻、更快、配置更简单。

### TailwindCSS v4

原子化 CSS，CSS 变量主题系统，v4 性能更好。

### Zustand

API 极简、TypeScript 类型推断好、bundle 极小。项目的状态主要是几个大的 domain slice（任务池、流、UI 状态），Zustand 的 slice 模式很适合。

### Framer Motion

声明式动画库，支持布局动画、手势、退出动画。产品设计强调"即时完成感"，动效是核心体验。

---

## 数据层

### 统一数据库存储

所有数据（内容、设置、用户信息）统一存储在数据库中。

**数据分层**：

| 层级 | 内容 | 存储位置 | 说明 |
|------|------|----------|------|
| L0 | 启动配置 | TOML + 环境变量 | 端口、数据库类型、认证模式等 |
| L1 | 用户设置 | 数据库 settings 表 | 角色、快捷键、时间表、UI 偏好 |
| L2 | 内容数据 | 数据库 files 表 | 流记录、任务、归档 |

**数据流向**：
```
用户操作 → Zustand Store → REST API → Rust 后端 → 数据库
                                                    ↓ (可选)
                                              持续导出到磁盘
```

### 导出/导入

- **JSON 导出**：完整数据快照（文件 + 设置）
- **Markdown 导出**：人类可读的 Markdown 文件
- **磁盘导出**：镜像到本地目录结构
- **JSON 导入**：从备份恢复
- **持续导出**：开启后每次数据变更自动镜像到指定目录

---

## AI 集成

> 核心原则：**无 AI 时产品完整可用，有 AI 时体验显著提升。所有 AI 操作可审计、可撤销。**

### 架构：客户端直连 LLM API

用户提供 API Key，前端直接调用 LLM API。不经过后端代理，API Key 不离开客户端。

### AI 功能分层

| 层级 | 功能 | 实现方式 | 需要 LLM |
|------|------|---------|---------|
| L0 | 此刻推荐排序 | 纯规则：DDL 紧迫度 × 任务年龄 × 时段匹配 | ❌ |
| L0 | DDL 提醒 | 纯规则 | ❌ |
| L1 | 任务提取 | 用户触发 → LLM → 确认 | ✅ |
| L1 | 任务拆分 | 用户触发 → LLM → 确认 | ✅ |
| L2 | 后台任务提取 | 批量处理 → 草稿态待确认 | ✅ |

---

## 构建与工程化

### pnpm + pnpm workspaces + Turborepo

Monorepo 管理：`core` 先构建，`web` 后构建。增量缓存。

### Cargo workspace

Rust 后端使用 Cargo workspace 管理：
- `crates/server`：共享后端库
- `crates/server-bin`：独立服务器二进制
- `packages/web/src-tauri`：Tauri 桌面端

### Biome

Rust 编写的 lint + format 工具，速度极快。

---

## 部署

### PC 桌面端 (Tauri)

- `tauri build` 生成安装包 (MSI/EXE/DMG/AppImage)
- 内嵌 Rust 后端，零外部依赖
- 默认监听 `127.0.0.1:3001`，可选开放局域网

### 纯服务器

- 编译 `mlt-server-bin` 得到单一二进制
- 通过 `config.toml` + 环境变量配置
- 可对接 Docker / systemd / 云服务器

### 网页端

- Vite 构建的 SPA 静态文件
- 由 Rust 服务器提供服务，或部署到 CDN

---

## 技术选型总表

| 类别 | 选择 | 替代方案（为什么没选） |
|------|------|----------------------|
| 后端语言 | Rust | Node.js (体积大，无法与 Tauri 复用) |
| HTTP 框架 | Axum | Actix-web (API 更复杂) |
| 数据库 | sqlx (SQLite/PG/MySQL) | Diesel (编译慢), SeaORM (生态较新) |
| 桌面端 | Tauri 2 | Electron (体积 10x+) |
| 前端框架 | React 19 | — |
| 构建工具 | Vite 8 | Next.js (不需要 SSR) |
| 样式 | TailwindCSS v4 | CSS Modules (不够灵活) |
| 状态管理 | Zustand | Redux (过重) |
| 动画 | Framer Motion | CSS transitions (能力不足) |
| 认证 | JWT + Argon2 | Session (不适合多端) |
| lint/format | Biome | ESLint+Prettier (太慢) |
| monorepo | pnpm + Turborepo | Nx (过重) |
