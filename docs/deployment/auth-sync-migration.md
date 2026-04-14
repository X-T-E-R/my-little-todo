# Embedded Auth + Hosted Sync 迁移说明

当前主线已经收口为：

- Auth：`embedded | zitadel`
  - 默认 `embedded`
  - 必须开箱即用
  - `embedded` 保留多用户与管理员面板
- Sync：`hosted`
  - 只部署主项目即可用
  - 多客户端直接共享同一个服务端后端数据
  - 不再使用 `/api/sync/*` 协议或 Electric 运行时链路

## 这次升级会发生什么

- 旧 `/api/auth/*`、`/api/sync/*` 不再属于运行时主链路
- 新客户端统一通过 `/api/session/*` 完成认证与会话恢复
- 默认部署只需要主项目服务端，SQLite 就能直接跑起来
- 如果需要外部 OIDC，改为显式配置 `auth_provider = "zitadel"`

## 默认部署路径

推荐从 [config.example.toml](/C:/Users/xxoy1/.codex/worktrees/8021/my-little-todo/config.example.toml) 复制一份 `config.toml`，保持默认值即可：

- `auth_provider = "embedded"`
- `embedded_signup_policy = "invite_only"`
- `sync_mode = "hosted"`
- `db_type = "sqlite"`

首次启动后：

1. 打开服务端地址
2. 创建第一个 owner/admin 账户
3. 进入 `/admin` 创建用户或生成邀请码
4. 其他客户端直接连接这台服务端使用同一份后端数据

## 如果要启用 Zitadel

只有在你明确需要外部 OIDC/OAuth 时，才需要额外配置：

- `auth_provider = "zitadel"`
- `zitadel_issuer`
- `zitadel_client_id`
- 可选的 `zitadel_audience`
- 可选的 `zitadel_admin_role`

未配置这些字段时，不会再回退到旧本地 JWT 模式。

## Hosted Sync 的含义

当前的 “hosted” 指：

- Web / 桌面 / 移动端都直接请求同一个 My Little Todo 服务端
- 共享能力来自中心后端数据库
- 不再维护客户端 push/pull/version 协议
- 不再恢复 WebDAV / API-server provider 矩阵

## 升级提示

- 老客户端如果还尝试走旧 API sync，会收到明确失败，而不是静默坏掉
- 新客户端会读取 `/api/session/bootstrap`，并按 `embedded` 或 `zitadel` 分支处理登录
- 旧 token、旧 sync 配置不再被当作运行时主链路继续兼容
