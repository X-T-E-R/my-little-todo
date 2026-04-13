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
- **稳定的本地优先核心** — 桌面端和 Android 使用本地 SQLite；正式稳定同步目标为 API 服务器和 WebDAV
- **多平台** — Tauri 桌面端（Windows/macOS/Linux）、Android 应用和 Web 部署共享同一套核心 Todo 模型
- **Beta 扩展能力** — AI、S3、服务端备份恢复、窗口上下文、桌面小组件、think/work thread、插件生态暂不纳入稳定 SLA

## 发布边界

当前 Stable 能力：

- 任务 CRUD
- 流记录 CRUD 与搜索
- 认证与多用户隔离
- 基础附件
- JSON 导入导出
- 本地 SQLite
- API 同步
- WebDAV 同步
- 升级迁移
- 基础设置

当前 Beta / 受限能力：

- AI 助手与 Agent 流程
- S3 同步
- 服务端备份恢复
- 窗口上下文与桌面小组件
- Think Session / Work Thread
- 第三方插件

发布或升级前，请先阅读[发布检查清单](docs/release/release-checklist.zh-CN.md)。

<!-- TODO: 添加截图 -->

## 快速开始

### PC 桌面端（Tauri）— 最简单

本地优先的开箱即用应用，无需服务器。

1. 从 [Releases](https://github.com/X-T-E-R/my-little-todo/releases) 下载对应平台的安装包（Windows .msi/.exe、macOS .dmg、Linux .AppImage）
2. 安装并启动，首次打开会进入引导设置
3. 数据存储在本地 SQLite 数据库中，无需账户或服务器
4. 可在设置 → 云同步中配置同步方式实现多端同步：
   - **API 服务器** — 与 My Little Todo 服务器同步（支持用户名密码或 API Token 认证）
   - **WebDAV** — 通过任意 WebDAV 兼容服务器同步
   - **S3（Beta）** — 仅保留为受限路径，不属于当前稳定 SLA

升级桌面端前，请先在 `设置 -> 数据` 中做一次完整 JSON 导出。

### Docker 部署 — 适合服务器

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

**首次使用**：访问 `http://localhost:3001/admin` 创建第一个管理员账户。管理员创建完成后，用户即可通过 `http://localhost:3001` 访问 Web 端登录使用。管理功能（用户管理、统计）在 `/admin` 页面管理。

数据存储在主机的 `./data/` 目录中，方便备份和查看。

关于发布恢复预期、备份建议和 Stable/Beta 边界，请查看 [docs/release/release-checklist.zh-CN.md](docs/release/release-checklist.zh-CN.md)。

#### 更新到最新版本

```bash
docker compose pull && docker compose up -d
```

<details>
<summary>Docker 环境变量（仅服务器模式）</summary>

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3001` | 服务器端口 |
| `HOST` | `0.0.0.0` | 绑定地址 |
| `AUTH_MODE` | `multi` | `none` / `single` / `multi` |
| `DB_TYPE` | `sqlite` | `sqlite` / `postgres` / `mysql`（详见 [docker-compose.yml](docker-compose.yml)） |
| `DATABASE_URL` | — | 数据库连接字符串（PG/MySQL 必须设置） |
| `JWT_SECRET` | 随机 | JWT 密钥（**生产环境请务必设置！**） |
| `DEFAULT_ADMIN_PASSWORD` | — | 初始管理员密码 |
| `DATA_DIR` | `/app/data` | 数据存储目录 |
| `STATIC_DIR` | `/app/static` | 前端静态文件目录 |

</details>

<details>
<summary>同步 API 与认证</summary>

桌面端和移动端可通过 `/api/sync/*` 端点与服务器同步。认证方式：

- **用户名和密码** — 客户端自动通过 `POST /api/auth/login` 登录并缓存 JWT
- **API Token** — 通过 `POST /api/auth/api-token` 生成长期 Token（需已有 JWT）。可选有效期：30 天、90 天、1 年、永不过期

也可以在 Web 管理界面生成 API Token：设置 → 账户 → API Token。

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/sync/changes?since={version}` | GET | 拉取指定版本后的变更 |
| `/api/sync/status` | GET | 获取当前同步版本号 |
| `/api/sync/push` | POST | 推送本地变更到服务器 |
| `/api/auth/api-token` | POST | 生成长期 API Token |

所有同步端点需要 `Authorization: Bearer <token>` 请求头。

</details>

如需配置反向代理（Nginx / Caddy），将域名指向 `localhost:3001` 即可，无需额外的 location 规则。

不使用 Docker 的纯二进制部署请参考 [docs/deployment/binary.md](docs/deployment/binary.md)。

### Android 应用

1. 从 [Releases](https://github.com/X-T-E-R/my-little-todo/releases) 下载 APK 安装包
2. 安装并启动，数据存储在本地 SQLite 中
3. 应用启动时会自动检查更新

### PWA 网页应用 — 适合手机

1. 在手机或平板浏览器中访问已部署的服务器地址（如 `https://your-domain.com`）
2. 登录或注册账号
3. 使用浏览器的「添加到主屏幕」功能将应用安装到桌面
4. PWA 支持离线缓存，即使断网也能查看已加载的数据

## 首次使用

1. **桌面端 / Android 用户**：启动应用后，引导向导会带你设置角色和偏好。所有数据存储在本地。
2. **服务器（网页）用户**：访问 `http://your-host:3001/admin` 创建管理员账户，然后打开 `http://your-host:3001` 开始使用。
3. 打开**流**视图，随手输入你脑中的想法，系统会帮你整理成任务
4. 升级、迁移或切换同步目标前，请先从 `设置 -> 数据` 导出 JSON 备份。

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
| `get_overview` | 全局概览：任务计数、紧急 DDL、角色列表、日程时段、今日流记录数 |
| `list_tasks` | 列出标准化 task 视图，可按状态、`primary_role`、`role_ids` 过滤；列表结果不含 `body` |
| `get_task` | 获取单个标准化 task 视图，包含 canonical `body` 以及父任务/子任务摘要 |
| `create_task` | 创建 canonical task：先建 stream 主记录，再建同 ID 的 task facet |
| `update_task` | 更新任务字段；`body` 会回写到底层 `stream_entries.content`，`role_ids` 是唯一权威角色输入 |
| `delete_task` | 删除 canonical task，同时删除底层 stream entry |
| `add_stream` | 创建 stream 主记录，使用 `role_id` 作为流条目的主角色 |
| `list_stream` | 列出标准化 stream 视图；若条目同时是 task，会返回 `task_id` |
| `search` | 全文搜索任务和流记录（可限定搜索范围） |

### Task / Stream 新语义

- `stream_entries` 是唯一主记录，保存内容、时间、附件、标签、条目类型和主角色。
- `tasks` 只是任务扩展 facet，不再持久化正文副本。
- `Task.id === StreamEntry.id`。
- `task.body` 永远来自 `stream_entries.content`。
- `tasks.role_ids` 是任务角色集合的唯一权威字段。
- `primary_role` 是计算字段，规则为 `role_ids[0] ?? stream_entries.role_id ?? null`。
- 删除 task 会删除底层 stream entry。

### 对外 Schema

Task 在 REST / MCP 中暴露的字段：

```json
{
  "id": "se-...",
  "title": "string",
  "title_customized": 0,
  "description": null,
  "status": "inbox",
  "body": "string",
  "created_at": 1776000000000,
  "updated_at": 1776000001000,
  "completed_at": null,
  "ddl": null,
  "ddl_type": null,
  "planned_at": null,
  "role_ids": ["role-a", "role-b"],
  "primary_role": "role-a",
  "tags": ["mlt"],
  "parent_id": null,
  "subtask_ids": [],
  "task_type": "task"
}
```

Stream 在 REST / MCP 中暴露的字段：

```json
{
  "id": "se-...",
  "content": "string",
  "entry_type": "spark",
  "timestamp": 1776000000000,
  "date_key": "2026-04-13",
  "role_id": "role-a",
  "tags": ["mlt"],
  "attachments": [],
  "task_id": "se-..."
}
```

已移除的公开字段：

- task: `role`, `role_id`, `source_stream_id`
- stream: `extracted_task_id`

### REST 说明

- `GET /api/tasks` 与 `GET /api/tasks/:id` 现在返回标准化 task 对象，而不是 provider 原始行。
- `PUT /api/tasks/:id` 必须使用新 task schema；旧字段会被拒绝。
- `GET /api/stream*` 返回标准化 stream 主记录视图。
- `PUT /api/stream/:id` 使用 `role_id` 作为 stream 主角色字段，且不再暴露 `extracted_task_id`。

## 赞助

如果 My Little Todo 对你有帮助，欢迎请作者喝杯奶茶！

[![请我喝奶茶](https://img.shields.io/badge/%E8%AF%B7%E6%88%91%E5%96%9D%E5%A5%B6%E8%8C%B6-afdian-946ce6)](https://afdian.com/a/xter123)

## 开发与贡献

欢迎 PR 和 Issue！

开发环境搭建、构建指南和贡献规范请参考：

- [开发入门](docs/development/getting-started.md) — 环境搭建、开发命令、项目结构概览
- [构建指南](docs/development/building.md) — 桌面端、PWA、移动端、服务器构建

提交 PR 前请确保：

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
- [x] v0.8 — 本地优先架构 + 原生 SQLite + 同步引擎 + Android 应用
- [ ] v0.9 — AI 集成：流文本自动提取任务、智能推荐
- [ ] v1.0 — 完整桌面版 + 学习引擎：行为追踪、模式识别
- [ ] v2.0 — iOS 原生应用

## 设计哲学

这个项目建立在一套精心设计的产品原则之上。详见 [`docs/design-philosophy/`](docs/design-philosophy/)：

- **设计宪法** — 指导所有决策的 10 条不可打破的原则
- **用户画像** — 我们为谁构建，以及为什么传统 todo 工具会失败
- **核心辩论** — 每一个有争议的设计决策、双方论据、最终决定
- **产品骨架** — 三个核心界面（流 / 此刻 / 任务板）如何协同工作

技术架构文档在 [`docs/architecture/`](docs/architecture/)。

## License

MIT
