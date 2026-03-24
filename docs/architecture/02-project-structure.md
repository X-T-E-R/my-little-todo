# 项目结构

> 每个目录和文件的职责。如果你不知道一段代码应该放在哪里，先查这份文件。

---

## 顶层结构

```
my-little-todo/
│
├── crates/                          # Rust 后端代码
│   ├── server/                      #   共享后端库 (mlt-server)
│   └── server-bin/                  #   独立服务器入口 (mlt-server-bin)
│
├── packages/                        # 前端代码 (pnpm workspace)
│   ├── core/                        #   纯 TS 核心逻辑
│   ├── web/                         #   React 桌面/Web 应用
│   ├── admin/                       #   管理员面板 SPA
│   └── mobile/                      #   移动端 PWA (Capacitor)
│
├── docs/                            # 设计与技术文档
│   ├── design-philosophy/           #   设计宪法/画像/辩论/骨架
│   └── architecture/                #   技术栈/数据模型/项目结构(本文件)
│
├── Cargo.toml                       # Rust workspace 根配置
├── config.example.toml              # 服务器配置模板
├── pnpm-workspace.yaml              # pnpm monorepo 配置
├── turbo.json                       # Turborepo 构建编排
├── biome.json                       # Biome lint + format
├── package.json                     # 根 package (scripts)
└── README.md
```

---

## crates/server — Rust 统一后端

PC 桌面端和独立服务器共享这个 crate。所有 HTTP 路由、数据库操作、认证逻辑都在这里。

```
crates/server/
├── Cargo.toml
└── src/
    ├── lib.rs                       # App 组装 (create_app) + start() 函数
    ├── config.rs                    # ServerConfig (TOML + env 加载)
    ├── utils.rs                     # 路径校验、工具函数
    ├── export.rs                    # 持续导出 / 批量导出功能
    │
    ├── auth/                        # 认证模块
    │   ├── mod.rs
    │   ├── jwt.rs                   #   JWT 签发/验证
    │   └── middleware.rs            #   Axum 中间件 (提取 user_id)
    │
    ├── providers/                   # 数据库抽象层
    │   ├── mod.rs                   #   create_provider() 工厂
    │   ├── traits.rs                #   DatabaseProvider trait 定义
    │   ├── sqlite.rs                #   SQLite 实现
    │   ├── postgres.rs              #   PostgreSQL 实现
    │   └── mysql.rs                 #   MySQL 实现
    │
    └── routes/                      # API 路由
        ├── mod.rs
        ├── files.rs                 #   /api/files CRUD
        ├── auth.rs                  #   /api/auth (login, register, me)
        ├── admin.rs                 #   /api/admin (用户管理、统计、AI 共享配置)
        ├── data.rs                  #   /api/settings, /api/export, /api/import
        ├── blobs.rs                 #   /api/blobs (附件上传/下载)
        ├── backup.rs               #   /api/backup (云备份配置)
        └── mcp.rs                   #   /api/mcp (MCP 协议端点)
```

### 关键类型

| 类型 | 位置 | 说明 |
|------|------|------|
| `ServerConfig` | config.rs | 服务器配置 (port, host, auth_mode, db_type, ...) |
| `AppState` | lib.rs | 共享状态 (db: DatabaseProvider, config) |
| `DatabaseProvider` | providers/traits.rs | 数据库操作 trait |
| `SqliteProvider` | providers/sqlite.rs | SQLite 实现 |
| `PostgresProvider` | providers/postgres.rs | PostgreSQL 实现 |
| `MysqlProvider` | providers/mysql.rs | MySQL 实现 |
| `Claims` / `auth_middleware` | auth/ | JWT 认证 |

---

## crates/server-bin — 独立服务器

```
crates/server-bin/
├── Cargo.toml
└── src/
    └── main.rs                      # 入口：加载配置 → 调用 mlt_server::start()
```

用于纯服务器模式。编译为单一二进制，通过 `config.toml` 或环境变量配置。

---

## packages/core — 纯 TypeScript 核心

**原则：不依赖 React、不依赖浏览器 API。** 纯函数 + 类型定义。

```
packages/core/
├── src/
│   ├── models/                      # 领域类型定义
│   │   ├── stream.ts                #   StreamEntry, Attachment, StreamEntryType
│   │   ├── task.ts                  #   Task, TaskStatus, TaskResource, TaskReminder
│   │   ├── role.ts                  #   Role
│   │   ├── schedule.ts              #   ScheduleBlock, RecurrenceType
│   │   ├── behavior.ts              #   BehaviorEvent, UserProfile
│   │   ├── ai-operation.ts          #   AI 操作记录
│   │   └── index.ts                 #   统一导出
│   │
│   ├── markdown/                    # MD ↔ 领域对象 转换
│   │   ├── parser.ts                #   MD 文本 → 领域对象
│   │   ├── serializer.ts            #   领域对象 → MD 文本
│   │   └── index.ts
│   │
│   └── utils/                       # 工具函数
│       ├── id.ts                    #   ID 生成
│       ├── date.ts                  #   日期处理、格式化
│       └── index.ts
│
├── package.json
└── tsconfig.json
```

---

## packages/web — React 桌面/Web 应用

桌面端 (Tauri) 和网页端共用同一套代码。区别仅在入口 (`main.tsx` 中检测 Tauri 环境)。

```
packages/web/
├── src/
│   ├── views/                       # 页面级视图
│   │   ├── NowView.tsx              #   "此刻" — 推荐一件事
│   │   ├── StreamView.tsx           #   "流" — 随手记录
│   │   ├── BoardView.tsx            #   "任务" — 任务管理
│   │   ├── SettingsView.tsx         #   "设置" — 分页设置
│   │   ├── LoginView.tsx            #   登录页
│   │   └── OnboardingView.tsx       #   启动引导
│   │
│   ├── components/                  # 通用 UI 组件
│   │   ├── RoleSidebar.tsx          #   角色侧栏
│   │   ├── RoleLandingCard.tsx      #   角色着陆卡片
│   │   ├── CreateTaskDialog.tsx     #   新建任务弹窗
│   │   ├── TaskDetailPanel.tsx      #   任务详情面板
│   │   ├── ContextMenu.tsx          #   右键菜单
│   │   ├── MarkdownToolbar.tsx      #   Markdown 编辑工具栏
│   │   ├── ScheduleEditor.tsx       #   时间表编辑器
│   │   ├── OnboardingTip.tsx        #   上下文引导提示
│   │   └── ...
│   │
│   ├── stores/                      # Zustand 状态管理
│   │   ├── taskStore.ts             #   任务
│   │   ├── streamStore.ts           #   流条目
│   │   ├── roleStore.ts             #   角色
│   │   ├── scheduleStore.ts         #   时间表
│   │   ├── behaviorStore.ts         #   行为数据
│   │   └── ...
│   │
│   ├── storage/                     # 存储适配层
│   │   ├── adapter.ts               #   StorageAdapter 接口 + API 实现
│   │   ├── apiClient.ts             #   HTTP API 客户端
│   │   ├── settingsApi.ts           #   设置 API 封装
│   │   ├── roleRepo.ts              #   角色仓库
│   │   ├── shortcutRepo.ts          #   快捷键仓库
│   │   └── index.ts
│   │
│   ├── utils/                       # 工具函数
│   ├── styles/globals.css           #   全局样式 + CSS 变量主题
│   ├── locales/                     #   i18n 翻译文件 (en / zh-CN)
│   ├── App.tsx                      #   根组件
│   └── main.tsx                     #   入口
│
├── src-tauri/                       # Tauri Rust 端
│   ├── src/lib.rs                   #   start_embedded_server + get_server_config
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── public/
├── index.html
├── vite.config.ts
└── package.json
```

---

## packages/admin — 管理员面板

轻量 React SPA，用于服务器管理。

```
packages/admin/
├── src/
│   ├── AdminApp.tsx                 #   登录 + 管理面板
│   └── main.tsx
├── index.html
├── vite.config.ts
└── package.json
```

---

## 模块关系图

```
┌─────────────────────────────────────────────────────┐
│                     views/                          │
│  NowView  StreamView  BoardView  Settings  Login    │
│  Onboarding                                         │
└──────────────────────┬──────────────────────────────┘
                       │ 使用
          ┌────────────┼────────────┐
          │            │            │
   ┌──────▼──────┐ ┌──▼──────┐ ┌──▼──────────┐
   │ components/ │ │ utils/  │ │ stores/     │
   │ (UI 组件)   │ │ (Hooks) │ │ (Zustand)   │
   └─────────────┘ └─────────┘ └──────┬──────┘
                                      │ 调用
                               ┌──────▼──────┐
                               │ storage/    │
                               │ adapter +   │
                               │ apiClient   │
                               └──────┬──────┘
                                      │ HTTP
                               ┌──────▼──────┐
                               │ Rust 后端   │
                               │ /api/*      │
                               └──────┬──────┘
                                      │ 操作
                               ┌──────▼──────┐
                               │  数据库     │
                               │ (SQLite等)  │
                               └─────────────┘
```

---

## 关键约定

### 命名

| 对象 | 命名规范 | 示例 |
|------|----------|------|
| 组件文件 | PascalCase | `NowView.tsx`, `OnboardingTip.tsx` |
| store 文件 | camelCase + Store 后缀 | `taskStore.ts` |
| repo 文件 | camelCase + Repo 后缀 | `roleRepo.ts` |
| Rust 模块 | snake_case | `sqlite.rs`, `auth.rs` |

### 导入规则

- `core` 不依赖 `web` / `admin` / `mobile`
- `web` 可以导入 `core`
- `stores/` 调用 `storage/`，`views/` 使用 `stores/` + `components/`
- Rust: `crates/server-bin` 依赖 `crates/server`
- Tauri `src-tauri` 依赖 `crates/server`
- **禁止循环依赖**

### 状态管理分层

```
视图层 (views/)
  │ 读取
  ▼
Zustand Store (stores/)
  │ HTTP 调用
  ▼
Storage Adapter (storage/)
  │
  ▼
REST API (/api/*)
  │
  ▼
Rust 后端 (crates/server)
  │
  ▼
数据库
```

---

## 开发命令

```bash
# 前端
pnpm install              # 安装依赖
pnpm dev                  # 启动所有开发服务
pnpm lint                 # Lint 检查
pnpm format               # 格式化
pnpm typecheck            # TypeScript 类型检查

# Rust 后端
cargo build               # 编译全部
cargo run -p mlt-server-bin  # 启动独立服务器
cargo test                # 运行测试

# Tauri 桌面端
pnpm --filter @my-little-todo/web dev  # 启动 Tauri 开发模式
```
