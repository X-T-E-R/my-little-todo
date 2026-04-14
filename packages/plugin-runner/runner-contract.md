# Runner Contract

本文件定义共享 server plugin runner 与宿主之间的最小协议。

## 输入

宿主启动 runner 时至少传入：

- `pluginId`
- `pluginRoot`
- `entryPoint`
- `port`
- `token`

## 进程职责

runner 启动后：

1. 加载插件 `server.entryPoint`
2. 解析 `defineServerPlugin()` 导出的定义
3. 起本地 loopback HTTP 服务
4. 暴露以下端点：
   - `GET /health`
   - `POST /mcp/tools/list`
   - `POST /mcp/tools/call`
   - 插件声明过的 HTTP routes

## 宿主职责

- 桌面宿主或服务器宿主负责：
  - spawn / stop
  - 健康检查
  - crash handling
  - extension registry 同步
- 宿主统一对外暴露：
  - `/api/mcp`
  - `/api/plugins/:pluginId/*`

## 安全边界

- runner 仅监听 `127.0.0.1`
- 所有请求都必须带宿主下发 token
  - 首选请求头：`x-mlt-plugin-token`
  - 兼容：`Authorization: Bearer <token>`
- runner 不直接改宿主根路由
- runner 不直接访问宿主数据库连接
