# `@my-little-todo/plugin-runner`

共享 server plugin runner 骨架。

## 目标

- 使用 **TypeScript** 编写
- 使用 **官方 MCP TypeScript SDK**
- 最终通过 `deno compile` 打包为单文件可执行程序
- 由桌面宿主和服务器宿主共用

## 当前状态

当前目录已落地：

- runner 进程启动骨架
- `defineServerPlugin()` 动态加载
- 基础 tool 枚举与调用
- 本地 loopback HTTP 端点：
  - `GET /health`
  - `POST /mcp/tools/list`
  - `POST /mcp/tools/call`
  - 插件声明的 HTTP routes
- `x-mlt-plugin-token` / `Authorization: Bearer <token>` 校验

当前目录仍未落地：

- 官方 MCP TypeScript SDK 接线
- `deno compile` 打包链路
- 桌面 sidecar / 服务器 child-process 的正式宿主接线

后续 runner 正式实现应满足：

- 加载插件 `server.entryPoint`
- 仅监听 `127.0.0.1`
- 暴露：
  - `GET /health`
  - `POST /mcp/tools/list`
  - `POST /mcp/tools/call`
  - manifest 声明过的 HTTP routes
- 接收宿主下发的一次性 token
- 通过宿主 extension registry 接入 `/api/mcp` 与 `/api/plugins/:pluginId/*`

## 非目标

- 不实现嵌入式 JS runtime
- 不依赖系统 Node
- 不承担宿主路由控制权
- 不让插件直接接触数据库或宿主内部对象
