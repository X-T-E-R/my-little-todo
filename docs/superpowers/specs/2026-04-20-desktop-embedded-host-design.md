# Desktop Embedded Host Design

## 背景

当前仓库已经有两套明显会相遇但还没完全接上的能力：

- `crates/server` 已经提供了完整的 `/api/*`、`/api/mcp`、插件网关、认证和多用户存储骨架。
- Tauri 桌面端已经在 UI、文案和插件运行时里默认存在一个本地 `127.0.0.1:23981` 宿主，但 `src-tauri` 里实际上还没有真正把服务拉起来。

与此同时，桌面端运行时仍然是本地直连 SQLite，不依赖本地 API。这意味着“桌面主流程可离线且不依赖内嵌服务”这个产品特性是真实存在的，也应该被保留。

本设计要解决的不是“再加一个桌面 HTTP 服务”，而是把桌面宿主里的外部 API / MCP / 插件网关能力收敛成一项**可完全关闭**、可被宿主统一管理、尽量复用服务端代码的能力。

## 目标

1. 尽可能复用现有 `mlt-server`、`/api/mcp`、插件网关、认证和 provider 代码。
2. 桌面端的内嵌服务能力必须可以被**完全关闭**：
   - 不启动进程
   - 不监听端口
   - 不暴露 `/health`
   - 不暴露 `/api/*`
   - 不暴露 `/api/mcp`
   - 不接受第三方 server plugin runtime 注册
3. 桌面端核心业务数据默认切到多用户表结构，与服务端主模型对齐。
4. 保留桌面主流程的“本地直连数据库”能力，不让桌面主界面反过来依赖本地 API。
5. 把桌面内嵌服务建成宿主内置模块，而不是第三方 server plugin。

## 非目标

1. 不把桌面主界面全面改造成“必须通过本地 API 才能工作”。
2. 不把内嵌服务做成不可关闭的基础设施守护进程。
3. 不新增第二套 MCP 对外形态；继续复用 `/api/mcp`。
4. 不把第三方插件 server 代码直接放进 Tauri 主进程执行。
5. 不在这一轮把所有桌面专属表都迁移到服务端语义；只统一核心业务数据。

## 结论

采用下面这条方案：

- **核心域数据统一成多用户表**
- **桌面内嵌服务做成内置宿主模块 `embedded-host`**
- **Tauri 通过 sidecar 方式启动一个薄包装的 desktop host 二进制**
- **该二进制复用 `mlt-server` crate，只承载本地 API / MCP / 插件网关**
- **桌面主 UI 仍保留本地直连 SQLite，不依赖 sidecar**

这是三条候选路线里最平衡的一条：

- 比“保留现状再外挂 API”更能复用服务端代码
- 比“桌面主路径全面走本地 API”更符合“可以完全关闭”的产品要求
- 能把 API / MCP / 插件网关 / server plugin 生命周期都统一挂到宿主模块下面

## 方案对比

### 方案 A：继续保留桌面本地单用户表，额外挂一个桌面 API 服务

优点：

- 迁移成本最低
- `完全关闭` 最容易实现

缺点：

- 代码复用最差
- 桌面 UI 和 API 会长期维护两套数据约定
- 以后 MCP / 插件网关 / 导入导出会越来越多桌面特判

结论：不选。

### 方案 B：核心域数据统一成多用户表，桌面 UI 继续本地直连，内嵌服务做成可选 sidecar

优点：

- 复用服务端路由、provider、认证和网关代码
- 仍然满足“桌面服务可完全关闭”
- 桌面 UI 不依赖本地 API，离线与性能模型保持稳定
- sidecar 崩溃不会直接拖垮 Tauri 主进程

缺点：

- 需要做一次数据库结构迁移
- 本地直连 store 和服务端 provider 仍然会保留少量并行实现

结论：选这个。

### 方案 C：桌面主流程也全面改成走本地 API

优点：

- 代码复用最大
- API 成为唯一真相入口

缺点：

- 内嵌服务不再可选，违背“可以完全关闭”
- 桌面首启、异常恢复、进程编排复杂度更高

结论：不选。

## 总体架构

### 1. 三层职责

#### A. 核心数据层

- 共享核心表采用服务端主模型：
  - `tasks`
  - `stream_entries`
  - `settings`
  - `blobs`
  - 以及服务端用户/会话所需表
- 这些表默认都带 `user_id`
- 桌面本地默认用户固定为 `local-desktop-user`

#### B. 桌面宿主层

Tauri 宿主保留：

- 主窗口与辅助窗口
- tray / global shortcut / foreground bridge
- 本地直连 SQLite store
- sidecar 生命周期管理
- 内嵌服务运行态状态查询与控制命令

#### C. 可选内嵌服务层

新增内置模块 `embedded-host`，职责只有：

- 启停本地 sidecar
- 通过 sidecar 暴露：
  - `/health`
  - `/api/*`
  - `/api/mcp`
  - `/api/plugins/:pluginId/*`
- 为第三方 server plugin 提供宿主网关

### 2. 为什么 `embedded-host` 是内置模块，不是第三方插件

虽然它在产品层表现成“可开关模块”，但实现层必须是宿主服务，而不是第三方 server plugin。原因：

- 它要管理端口和绑定地址
- 它要决定认证模式
- 它要持有数据库路径
- 它要负责崩溃恢复、状态查询和关闭语义
- 它本身就是第三方插件网关的宿主

因此正确结构是：

- 配置层：像内置插件/模块一样可开关
- 实现层：宿主 sidecar 服务

## 模块模型

### 新模块

新增内置模块：

- `embedded-host`

模块语义：

- `module:embedded-host:enabled = false` 时：
  - 不启动 sidecar
  - 不保留运行态注册
  - 不对外提供 API / MCP / 插件网关
- `module:embedded-host:enabled = true` 时：
  - 允许 sidecar 按配置启动

### 依赖关系

桌面端下这些能力都要显式依赖 `embedded-host`：

- `mcp-integration`
- server plugin runtime / extension registry 注册
- 未来桌面 file-host 的对外 API 暴露

依赖规则：

- `mcp-integration` 仍然负责工具权限、ACL 和 UI 展示，但不再默认假定 `127.0.0.1:23981` 永远存在
- `embedded-host` 负责“有没有端口、服务是否真的活着”

## “完全关闭”的精确定义

`embedded-host` 关闭时，系统必须满足以下条件：

1. 没有 sidecar 进程
2. 没有 TCP 监听
3. `http://127.0.0.1:<port>/health` 不可达
4. `http://127.0.0.1:<port>/api/*` 不可达
5. `http://127.0.0.1:<port>/api/mcp` 不可达
6. 桌面前端不再展示伪可用的本地 MCP / API 地址
7. 第三方 server plugin 运行时不能注册 extension，也不能维持 “running” 假象

这条定义优先于“UI 上显示关了”。

## 进程形态

### 选择：sidecar

桌面内嵌服务采用 sidecar，而不是直接在 Tauri 主进程里 `tokio::spawn(axum)`。

理由：

1. 更符合“完全关闭”的边界
2. 崩溃隔离更清晰
3. 更符合仓库现有的“宿主管 lifecycle，执行体独立”的方向
4. 后续更容易和 server host 的 runner manager 对齐

### Sidecar 设计

新增一个薄包装二进制，例如：

- `mlt-desktop-host`

职责：

- 读取桌面宿主下发的配置
- 拼装 `ServerConfig`
- 调用 `mlt_server::start(...)`

它不承载新的业务逻辑，尽量只是把桌面配置转译到现有 `mlt-server`。

## 数据库设计

### 1. 统一数据库文件

桌面端核心数据库统一到一个文件，例如：

- `my-little-todo.db`

不再让桌面 UI 默认用 `data.db`、sidecar 默认用 `my-little-todo.db` 两套路径。

### 2. 核心表统一成多用户结构

共享核心表采用带 `user_id` 的结构，和服务端主模型一致。

桌面默认用户：

- `id = local-desktop-user`
- `username = local`
- `is_admin = true`

桌面本地直连 store 读写这些表时，都固定带这个用户上下文。

### 3. 保留本地专属表

以下能力先继续保持桌面本地化，不强行并入服务端主模型：

- `window_contexts`
- 本地快捷键 / widget 展示态
- 其他只对桌面宿主有意义、且不要求对外 API 暴露的表

对 `think_sessions`、`work_threads`、`work_thread_events` 的处理：

- 这一轮不把它们作为内嵌服务改造的前置条件
- 维持现有桌面本地实现
- 后续若需要被内嵌 API 统一暴露，再单独做数据模型收敛

这样可以避免把“开启桌面 API 服务”扩大成“重写所有桌面数据层”。

### 4. 迁移策略

首选迁移方向：

- 从旧的桌面本地核心表结构迁移到统一后的多用户核心表
- 若发现旧 `data.db`，则迁移到 `my-little-todo.db`
- 迁移后保留备份或改名备份，避免不可逆覆盖

迁移完成后：

- Tauri 本地 store 指向统一数据库
- sidecar 也指向同一数据库

## 认证与网络访问

### 1. 桌面本机模式

默认模式：

- host: `127.0.0.1`
- 仅本机访问
- 可允许 `auth_provider = none`

这对应“给同机软件提供 API/MCP”。

### 2. 局域网模式

显式开启后才允许：

- `0.0.0.0`
- 指定网卡 IP

这时不允许继续使用 `auth_provider = none`。最少要求：

- `embedded` auth
- token / session 校验

### 3. 桌面端认证边界

桌面 sidecar 不支持 `zitadel` 作为本轮必做项。优先只支持：

- `none`
- `embedded`

原因：

- 本轮目标是本地/局域网宿主能力，不是把桌面端扩成完整身份宿主
- `zitadel` 会把实现扩张到浏览器回调、外部登录流程和桌面部署形态，不适合这轮并入

## 配置模型

### 持久配置

新增持久配置键，建议至少包括：

- `module:embedded-host:enabled`
- `embedded-host:host`
- `embedded-host:port`
- `embedded-host:auth-provider`
- `embedded-host:embedded-signup-policy`

### 运行态状态

运行态不应只靠持久设置推断，需要宿主实际查询：

- `inactive`
- `starting`
- `running`
- `stopping`
- `failed`

并提供：

- 实际 base URL
- 最后错误
- 当前 pid（若可用）

## 与 MCP / 插件网关的关系

### MCP

桌面端下：

- `mcp-integration` 继续负责权限等级、角色 ACL、单工具开关
- `embedded-host` 负责端点是否存在

因此桌面 MCP 配置展示逻辑改为：

- host 关闭：显示“未启用本地宿主服务”，不生成可复制地址
- host 运行：展示 `http://<host>:<port>/api/mcp`

### 第三方 server plugin

server plugin 运行态要显式依赖宿主服务：

- host 关闭：server plugin 只能是 `inactive`
- host 启动后：才允许 register/unregister extension

这样第三方 server plugin 的宿主关系会变清晰：

- `plugin-runner` 是插件执行体
- `embedded-host` 是桌面宿主网关
- Tauri 主进程是 sidecar / runner 的总调度者

## 错误处理

必须显式处理的错误：

1. 端口被占用
2. sidecar 启动失败
3. sidecar 启动后健康检查失败
4. 数据库升级失败
5. 数据库被旧版本占用或锁冲突
6. host 关闭后，MCP UI / plugin runtime 仍保留旧状态

错误策略：

- 宿主状态以真实运行态为准，不以“用户点了开关”作为成功标志
- sidecar 起不来时，不阻塞桌面主 UI 启动
- 关闭时以“停止 sidecar + 清空运行态”优先，不能只把 UI 开关设为 false

## 测试策略

### 单元 / 组件

- 模块启停与依赖判断
- MCP 配置展示逻辑
- plugin runtime 在 host 关闭时的状态机
- host 配置解析与约束（如 LAN 模式不能 `auth_provider=none`）

### 集成

- 桌面宿主启动 sidecar
- `/health`、`/api/session/bootstrap`、`/api/mcp` 可达性
- sidecar 关闭后端口确实释放
- 旧数据库迁移到多用户核心表

### 回归

- `embedded-host` 关闭时，桌面原有本地直连功能仍然可用
- widget / window-context / tray / local export 不应被 sidecar 改造带崩

## 实施顺序

### Phase 1：模块与运行态边界

- 新增 `embedded-host` 模块
- 把桌面 MCP / plugin runtime 从“默认有 23981”改成“依赖 host 运行态”

### Phase 2：sidecar 壳子

- 新增 `mlt-desktop-host`
- Tauri 增加 start / stop / status 命令

### Phase 3：数据库统一

- 统一数据库文件路径
- 核心表迁移到多用户结构
- 桌面 store 切换到新核心表

### Phase 4：联通网关

- sidecar 真正承接 `/api/*`、`/api/mcp`、插件注册
- 完成桌面端 host 关闭/启动与网关状态联动

## 风险与取舍

### 风险 1：桌面本地 store 与服务端 provider 仍会保留双实现

这是接受的取舍。因为“服务可完全关闭”意味着桌面主流程不能依赖 HTTP 层。要保留这条产品能力，就必须允许桌面本地 store 存在。

### 风险 2：SQLite 并发访问

sidecar 与桌面主 UI 会同时访问同一数据库文件。这要求：

- 统一数据库路径
- 统一 SQLite 打开模式与 WAL 策略
- 明确 migration ownership

这会作为实现中的重点验证项。

### 风险 3：模块边界被写回“UI 上关了，后台还活着”

这类问题必须用宿主运行态测试兜住。`embedded-host` 的关闭语义不能只停留在设置键。

## 最终产物

完成后系统会变成：

- 桌面主 UI 仍然本地优先、服务可关
- `embedded-host` 打开时，桌面端能像轻量本地服务器一样给其他软件提供 API / MCP
- 关闭时，所有对外服务能力彻底消失
- 共享核心数据模型默认与服务端一致，后续桌面/API/插件网关不再长期维护两套主数据语义
