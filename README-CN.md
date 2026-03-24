# My Little Todo

> 这不是任务管理器，这是你的外部执行系统。

传统 todo 工具的隐喻是"账本"——忠实记录你的债务。My Little Todo 的隐喻是"教练"——推你一把，然后在旁边看着你跑。

[English](README.md)

## 特性

- **流式输入** — 像聊天一样随手记录，系统帮你整理
- **角色驱动** — 生活就是一场巨大的角色扮演，快快进入你的状态
- **DDL 驱动** — 截止日期分三级硬度（硬性/承诺/弹性），延期需要写理由
- **专注此刻** — 打开应用只看到一件事 + 两个按钮（"开始做" / "不想做"）
- **学习而非惩罚** — 你的每一次拒绝、拖延、不按计划执行都是训练数据，不是错误
- **多端同步** — PC 桌面端、网页端、手机端，数据通过统一 API 同步
- **原生 AI 支持** — 内置 AI 魔法按钮，原生支持 MCP、方便 Agent 调用和编辑

## 架构总览

```
┌───────────────────────────────────────────────────────┐
│                 Rust 统一后端                           │
│              crates/server (mlt-server)                │
│  ┌─────────┐  ┌──────────┐  ┌───────────────┐        │
│  │ Axum    │  │ SQLite/  │  │ JWT Auth +    │        │
│  │ HTTP    │  │ PG/MySQL │  │ Multi-user    │        │
│  │ Server  │  │ /MongoDB │  │ Support       │        │
│  └─────────┘  └──────────┘  └───────────────┘        │
└───────────────────┬───────────────────────────────────┘
                    │ REST API (/api/*)
       ┌────────────┼────────────┬──────────────┐
       │            │            │              │
  ┌────▼────┐  ┌───▼────┐  ┌───▼────┐  ┌──────▼──────┐
  │ PC 桌面 │  │ 网页端 │  │ 手机端 │  │ Admin 面板  │
  │ Tauri 2 │  │ React  │  │  PWA   │  │ React SPA   │
  │(内嵌后端)│  │  SPA   │  │        │  │             │
  └─────────┘  └────────┘  └────────┘  └─────────────┘
```

## 技术栈

| 层       | 技术                                              |
|----------|--------------------------------------------------|
| 后端框架 | Rust + Axum (HTTP)                               |
| 数据库   | SQLite (默认) / PostgreSQL / MySQL / MongoDB     |
| ORM      | sqlx (SQL 数据库)                                 |
| 认证     | JWT + Argon2 密码哈希                              |
| 桌面端   | [Tauri 2](https://v2.tauri.app/) (内嵌 Rust 后端) |
| 前端     | React 19 + TypeScript 5                           |
| 构建     | Vite 8                                            |
| 样式     | TailwindCSS v4                                    |
| 动画     | Framer Motion                                     |
| 状态     | Zustand                                           |
| 代码质量 | Biome (lint + format)                             |
| 国际化   | i18next + react-i18next                           |
| Monorepo | pnpm workspaces + Turborepo                       |

## 快速开始

### Docker 部署（推荐）

无需克隆仓库，直接在服务器上创建 `docker-compose.yml`：

```yaml
services:
  mlt:
    image: ghcr.io/x-t-e-r/my-little-todo:latest
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/data
    environment:
      - AUTH_MODE=multi
      - JWT_SECRET=change-me-to-a-random-string
    restart: unless-stopped
```

然后执行：

```bash
# 生成安全的 JWT 密钥
echo "JWT_SECRET=$(openssl rand -base64 32)" > .env

# 启动
docker compose up -d
```

**首次使用**：访问 `http://localhost:3001/admin` 创建第一个管理员账户。管理员创建完成后，用户即可通过 `http://localhost:3001` 访问 Web 端登录使用。

数据存储在主机的 `./data/` 目录中，方便备份和查看。

#### 更新到最新版本

```bash
docker compose pull && docker compose up -d
```

#### Docker 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3001` | 服务器端口 |
| `HOST` | `0.0.0.0` | 绑定地址 |
| `AUTH_MODE` | `multi` | `none` / `single` / `multi` |
| `DB_TYPE` | `sqlite` | `sqlite` / `postgres` / `mysql` |
| `DATABASE_URL` | — | 数据库连接字符串 (PG/MySQL) |
| `JWT_SECRET` | 随机 | JWT 密钥（**生产环境请务必设置！**） |
| `DEFAULT_ADMIN_PASSWORD` | — | 初始管理员密码 |
| `DATA_DIR` | `/app/data` | 数据存储目录 |
| `STATIC_DIR` | `/app/static` | 前端静态文件目录 |

### 从源码构建

```bash
git clone https://github.com/X-T-E-R/my-little-todo.git
cd my-little-todo
```

#### 环境准备

1. **Node.js** >= 20
2. **pnpm** >= 10
   ```bash
   corepack enable
   corepack prepare pnpm@latest --activate
   ```
3. **Rust 工具链**
   ```bash
   # Windows
   winget install Rustlang.Rustup
   # macOS/Linux
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
4. **系统依赖**
   - **Windows**: Visual Studio Build Tools 2022 (含 C++ 工作负载)
   - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
   - **Linux**: 参考 [Tauri 官方文档](https://v2.tauri.app/start/prerequisites/#linux)

#### 安装与开发

```bash
pnpm install

# 启动前端 + Rust 后端 (浏览器预览)
pnpm dev:web

# 启动 Tauri 桌面开发模式
pnpm --filter @my-little-todo/web dev

# 启动独立 Rust 服务器 (纯服务器模式)
cargo run -p mlt-server-bin

# 启动管理员面板开发
pnpm dev:admin
```

> 首次运行会编译 Rust crate，大约需要 2-5 分钟。后续增量编译很快。

#### 构建

```bash
# 构建桌面安装包 (MSI/EXE/DMG/AppImage)
pnpm --filter @my-little-todo/web build

# 构建独立服务器
cargo build --release -p mlt-server-bin

# 构建管理员面板
pnpm build:admin

# 构建 PWA
pnpm build:pwa
```

## 使用指南

### Docker 服务器部署

最推荐的服务器部署方式。参考上方「快速开始」创建 `docker-compose.yml` 并启动。

1. 启动容器后，访问 `http://your-host:3001/admin` 进入管理面板
2. 首次访问时系统会引导你创建第一个管理员账户
3. 管理员创建完成后，访问 `http://your-host:3001` 即可使用 Web 端
4. 如需多用户，其他用户可通过 Web 端注册（管理员可在管理面板中管理用户）

如需配置反向代理（Nginx / Caddy），将域名指向 `localhost:3001` 即可，无需额外的 location 规则。

### 纯服务器部署（二进制）

适合不使用 Docker 的场景。

1. 从源码编译服务器和前端：
   ```bash
   git clone https://github.com/X-T-E-R/my-little-todo.git
   cd my-little-todo
   pnpm install

   # 编译服务器
   cargo build --release -p mlt-server-bin

   # 构建前端
   pnpm --filter @my-little-todo/core build
   pnpm --filter @my-little-todo/web build:vite
   pnpm build:admin
   ```
2. 准备静态文件目录：
   ```bash
   mkdir -p static/admin
   cp -r packages/web/dist/* static/
   cp -r packages/admin/dist/* static/admin/
   ```
3. 启动服务器：
   ```bash
   export STATIC_DIR=./static
   export AUTH_MODE=multi
   export JWT_SECRET=$(openssl rand -base64 32)
   ./target/release/mlt-server
   ```
   也可创建 `config.toml` 配置文件（参考 `config.example.toml`）。
4. 首次使用：访问 `http://localhost:3001/admin` 创建管理员，然后通过 `http://localhost:3001` 使用

### PC 桌面端（Tauri）

开箱即用的本地应用，无需服务器。

1. 从 [Releases](https://github.com/X-T-E-R/my-little-todo/releases) 下载对应平台的安装包（Windows .msi/.exe、macOS .dmg、Linux .AppImage）
2. 安装并启动，首次打开会进入引导设置
3. 默认单用户模式，无需密码，数据存储在本地
4. 在设置中可开启「局域网访问」，让手机等设备通过浏览器连接到你的桌面端
5. 也支持连接远程云端服务器，实现多端同步

从源码构建桌面端：
```bash
pnpm --filter @my-little-todo/web build
```

### PWA 网页应用

适合移动设备上的轻量使用。

1. 在手机或平板浏览器中访问已部署的服务器地址（如 `https://your-domain.com`）
2. 登录或注册账号
3. 使用浏览器的「添加到主屏幕」功能将应用安装到桌面
4. PWA 支持离线缓存，即使断网也能查看已加载的数据

从源码构建 PWA 版本：
```bash
pnpm build:pwa
```

### 移动端（Capacitor）

原生移动端应用（开发中）。

1. 从源码构建：
   ```bash
   pnpm build:mobile
   pnpm cap:sync
   pnpm cap:open:android  # 或 cap:open:ios
   ```
2. 在 Android Studio 或 Xcode 中编译并安装到设备
3. 应用需要连接到已部署的服务器（在设置中配置服务器地址）

## MCP 集成

My Little Todo 内置原生 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) 服务器，让 AI Agent（Cursor、Claude Desktop 等）直接与你的任务系统交互。

详细的 AI 调用指南见 [`skills/`](skills/) 目录。

### 配置方式

在你的 MCP 客户端中添加：

```json
{
  "mcpServers": {
    "my-little-todo": {
      "url": "http://localhost:3001/api/mcp",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}
```

### 可用工具

| 工具 | 说明 |
|------|------|
| `get_overview` | 全局概览：任务计数、紧急DDL、角色列表、日程时段、今日流记录数 |
| `list_tasks` | 列出任务（可按状态/角色筛选，内联角色名，不含正文） |
| `get_task` | 获取单个任务完整详情（含正文、提交/延期记录） |
| `create_task` | 创建任务（标题 + 可选 DDL/角色/标签/父任务） |
| `update_task` | 更新任务属性或状态（含完成/取消/延期，可附备注） |
| `delete_task` | 删除任务 |
| `add_stream` | 添加一条流记录（想法/笔记/进展） |
| `list_stream` | 列出最近的流记录 |
| `search` | 全文搜索任务和流记录（可限定搜索范围） |

## 项目结构

```
my-little-todo/
├── crates/
│   ├── server/            # Rust 统一后端库 (mlt-server)
│   │   └── src/
│   │       ├── providers/     # 数据库抽象 (SQLite/PG/MySQL/Mongo)
│   │       ├── routes/        # API 路由 (files, auth, admin, data, backup, mcp)
│   │       ├── auth/          # JWT + 中间件
│   │       ├── export.rs      # 持续导出 / 批量导出
│   │       ├── config.rs      # 服务器配置 (TOML + env)
│   │       └── lib.rs         # Axum app 组装 + start()
│   └── server-bin/        # 独立服务器二进制 (纯服务器模式)
│
├── packages/
│   ├── core/              # 纯 TS 核心逻辑 (数据模型、MD 解析)
│   ├── web/               # React + Tauri 桌面应用
│   │   ├── src/
│   │   │   ├── views/         # 视图: NowView / StreamView / BoardView / SettingsView / OnboardingView
│   │   │   ├── stores/        # Zustand 状态管理
│   │   │   ├── storage/       # API 客户端 + Settings API
│   │   │   ├── components/    # 通用组件
│   │   │   └── locales/       # i18n 翻译文件 (en / zh-CN)
│   │   └── src-tauri/         # Tauri Rust 端 (内嵌后端启动)
│   ├── admin/             # 管理员面板 SPA
│   └── mobile/            # 移动端 PWA (Capacitor)
│
├── Dockerfile             # Docker 多阶段构建
├── docker-compose.yml     # Docker Compose 配置
├── config.example.toml    # 服务器配置模板
├── mcp-config.example.json # MCP 客户端配置示例
└── docs/
    ├── design-philosophy/  # 设计宪法、用户画像、设计辩论、产品骨架
    └── architecture/       # 技术栈选型、数据模型、目录结构
```

## API 端点

| 路径 | 说明 |
|------|------|
| `GET/PUT/DELETE /api/files` | 文件 CRUD |
| `POST /api/auth/login` | 用户登录 |
| `POST /api/auth/register` | 用户注册 |
| `GET /api/auth/me` | 当前用户信息 |
| `GET/PUT/DELETE /api/settings` | 用户设置 CRUD |
| `GET /api/admin/*` | 管理员操作 |
| `GET /api/export/json` | 导出 JSON |
| `GET /api/export/markdown` | 导出 Markdown |
| `POST /api/import/json` | 导入 JSON |
| `POST /api/mcp` | MCP 协议端点 |

## 数据存储

所有数据存储在数据库中 (默认 SQLite)。

- **PC 模式**: 数据库文件位于 `%APPDATA%/com.mylittletodo.app/` (Windows)
- **服务器模式**: 数据库路径通过 `config.toml` 的 `data_dir` 配置

### 数据分层

| 层级 | 内容 | 存储位置 |
|------|------|----------|
| L0 | 启动配置 (端口、数据库类型、认证模式) | TOML 文件 + 环境变量 |
| L1 | 用户设置 (角色、快捷键、时间表、偏好) | 数据库 settings 表 |
| L2 | 内容数据 (流记录、任务、归档) | 数据库 files 表 |

### 导出/导入

- 支持导出为 JSON / Markdown (ZIP) / 磁盘目录
- 导出文件自动包含版本信息 (`_meta.json`)
- PC 端可选 JSON 或 ZIP 格式；网页端 Markdown 导出强制 ZIP
- 支持从 JSON 文件或 Markdown ZIP 包导入恢复
- 可开启"持续导出"，实时镜像数据到本地目录
- 支持 S3 兼容对象存储 / WebDAV 云备份（建设中）

## 代码质量

```bash
pnpm lint        # Lint 检查
pnpm format      # 格式化
pnpm typecheck   # 类型检查
pnpm test        # 运行测试
```

## 贡献

欢迎 PR 和 Issue！提交前请：

```bash
pnpm lint        # 确保通过 lint 检查
pnpm typecheck   # 确保类型正确
```

提交信息格式：`feat: 简要描述` / `fix: 简要描述` / `refactor: 简要描述`

## 路线图

- [x] v0.1 — 核心骨架：此刻/流/任务板三视图
- [x] v0.2 — 角色系统 + 流式编辑器增强
- [x] v0.3 — Rust 统一后端 + 多端支持 + 用户认证
- [x] v0.4 — 统一存储架构 + 数据导入导出 + 持续导出
- [x] v0.5 — 启动引导 + 上下文提示
- [x] v0.6 — 云备份 UI + ZIP 导出导入 + PC 云端模式
- [x] v0.7 — Docker 部署 + MCP 支持 + 国际化
- [ ] v0.8 — AI 集成：流文本自动提取任务、智能推荐
- [ ] v0.9 — 学习引擎：行为追踪、模式识别
- [ ] v1.0 — 完整桌面版：系统托盘、全局快捷键、云备份完善
- [ ] v2.0 — 移动端原生应用

## 设计哲学

这个项目建立在一套精心设计的产品原则之上。详见 [`docs/design-philosophy/`](docs/design-philosophy/)：

- **设计宪法** — 指导所有决策的 10 条不可打破的原则
- **用户画像** — 我们为谁构建，以及为什么传统 todo 工具会失败
- **核心辩论** — 每一个有争议的设计决策、双方论据、最终决定
- **产品骨架** — 三个核心界面（流 / 此刻 / 任务板）如何协同工作

技术架构文档在 [`docs/architecture/`](docs/architecture/)。

## License

MIT
