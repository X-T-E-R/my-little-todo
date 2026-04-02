# 版本管理

## 策略

My Little Todo 采用 **统一版本号**（unified versioning）：所有包（前端、后端、桌面端）共享同一个语义化版本号。

这是因为它是一个"单产品多模块"的 monorepo，不是一组独立发布的 npm 库。用户看到的是一个产品版本，不存在 "server v0.5 + web v0.3" 的场景。

## 版本号分布

版本号需要同步更新的文件（共 8 个）：

| 文件 | 格式 |
|------|------|
| `packages/admin/package.json` | `"version": "x.y.z"` |
| `packages/core/package.json` | `"version": "x.y.z"` |
| `packages/mobile/package.json` | `"version": "x.y.z"` |
| `packages/web/package.json` | `"version": "x.y.z"` |
| `crates/server/Cargo.toml` | `version = "x.y.z"` |
| `crates/server-bin/Cargo.toml` | `version = "x.y.z"` |
| `packages/web/src-tauri/Cargo.toml` | `version = "x.y.z"` |
| `packages/web/src-tauri/tauri.conf.json` | `"version": "x.y.z"` |

> 锁文件（`Cargo.lock`）由 `cargo` 自动更新，不需要手动编辑。

## 如何升级版本

使用 `scripts/bump-version.mjs`：

```bash
# 查看当前版本
pnpm bump

# 语义化升级
pnpm bump patch          # 0.3.0 → 0.3.1
pnpm bump minor          # 0.3.0 → 0.4.0
pnpm bump major          # 0.3.0 → 1.0.0

# 指定版本
pnpm bump 1.0.0-beta.1

# 升级 + 自动提交/打 tag/推送（一条龙）
pnpm bump minor --tag
pnpm bump patch --tag

```

`--tag` 会自动执行：`git add -A → commit → tag → push`，推送 tag 后会触发 GitHub Actions 的 Tauri 桌面端构建和 Docker 镜像发布。

## 什么时候该升版本

| 变更类型 | 升级 | 示例 |
|---------|------|------|
| Bug 修复、小调整 | `patch` | 修复删除确认弹窗 |
| 新功能、功能增强 | `minor` | 添加附件支持、离线缓存 |
| 破坏性变更、数据库迁移 | `major` | 数据模型重构 |

## 添加新包时

如果新增了一个带 `version` 字段的包，在 `scripts/bump-version.mjs` 的 `VERSION_FILES` 数组中添加一行即可。

## CI/CD 与版本的关系

| 触发条件 | Workflow | 说明 |
|---------|----------|------|
| push 到 `main` | CI (lint + test) | 每次提交都跑 |
| push 到 `main` | Docker Build | 构建 `latest` 镜像 |
| push `v*` tag | Tauri Release | 构建 macOS/Linux/Windows 桌面安装包 |

所以日常开发只需 push 到 main；当要发布桌面版时才需要打 tag（`pnpm bump minor --tag`）。
