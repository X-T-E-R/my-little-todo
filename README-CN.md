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
- **本地优先** — 桌面端和移动端数据存储在本地 SQLite 中，可选通过 API 服务器、WebDAV 或 S3 同步
- **多平台** — Tauri 桌面端（Windows/macOS/Linux）、Android 应用、Web PWA，共享同一套 UI
- **原生 AI 支持** — 内置 AI 魔法按钮，原生支持 MCP、方便 Agent 调用和编辑

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
   - **S3** — 同步到 S3 兼容对象存储（AWS/MinIO/R2）

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
