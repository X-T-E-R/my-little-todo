# Server Auth + Native Sync 迁移说明

当前主线已经收口为：

- Auth：`embedded | zitadel`
  - 默认 `embedded`
  - 必须开箱即用
  - `embedded` 保留多用户与管理员面板
- Hosted Web：`hosted`
  - 只部署主项目即可用
  - Web / PWA 直接把主项目服务端当运行时后端
- Native Sync：
  - 桌面 / Android 运行时仍是本地 SQLite
  - 云同步是可选 provider，不属于 native runtime 本体
  - 当前 provider 包括 `api-server` 与 `webdav`

## 这次升级会发生什么

- 旧 `/api/auth/*` 不再属于运行时主链路
- 服务端与 hosted web 客户端统一通过 `/api/session/*` 完成认证与会话恢复
- 默认部署只需要主项目服务端，SQLite 就能直接跑起来
- 如果需要外部 OIDC，改为显式配置 `auth_provider = "zitadel"`
- 原生端恢复为本地优先，不再把 server URL / auth 作为 app 启动前提

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
4. Web / PWA 客户端直接连接这台服务端使用同一份后端数据
5. 原生客户端如需跨设备同步，再在设置页里单独配置云同步 provider

## 如果要启用 Zitadel

只有在你明确需要外部 OIDC/OAuth 时，才需要额外配置：

- `auth_provider = "zitadel"`
- `zitadel_issuer`
- `zitadel_client_id`
- 可选的 `zitadel_audience`
- 可选的 `zitadel_admin_role`

未配置这些字段时，不会再回退到旧本地 JWT 模式。

## Hosted Web 与 Native Sync 的区别

当前的 “hosted” 指：

- Web / PWA 直接请求同一个 My Little Todo 服务端
- 服务端数据库是 hosted web 的真相源

当前的 native sync 指：

- 桌面 / Android 保持本地 SQLite 运行时
- 可选配置云同步 provider，把本地变更同步到远端
- `api-server` provider 指向 My Little Todo 服务端
- `webdav` provider 指向第三方 WebDAV 存储

## 升级提示

- hosted web 客户端会读取 `/api/session/bootstrap`，并按 `embedded` 或 `zitadel` 分支处理登录
- native 客户端不再把 auth / cloud URL 当成运行时前提
- native sync provider 配置与 hosted runtime 配置明确分离
