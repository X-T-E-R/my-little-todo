# 插件与功能模块 — 设计原则索引

> 本目录存放**各内置插件 / 功能模块**的设计原则与约束。全局产品信条仍以 [设计宪法](../00-design-constitution.md) 为准；若模块文档与宪法冲突，应**先改实现或改文档**，不允许默默违背。

---

## 文档一览

| 文档 | 说明 |
|------|------|
| [通用约定](./README.md#通用约定)（本节） | 所有模块共享的开关、设置键、侧栏约定 |
| [MCP 集成](./mcp-integration.md) | 对外 API、权限、端点与用户控制 |
| [核心功能模块](./core-feature-modules.md) | Kanban、时间胶囊、AI Coach、能量指示、Brain dump、高级筛选 |
| [窗口上下文](./window-context.md) | 前台窗口匹配与角色联动（桌面） |
| [桌面小部件](./desktop-widget-design.md) | 小部件交互、视觉与性能铁律 |

模块清单以代码为准：`packages/web/src/modules/registry.ts` 中的 `BUILT_IN_MODULES`。

---

## 通用约定

### 1. 模块是什么

内置「插件」在实现上是 **可开关的功能模块**：同一套数据与导航骨架下，按用户选择启用或隐藏整块能力（例如看板 Tab、MCP 端点、前台桥接）。

### 2. 开关与持久化

- 每个模块对应设置键：`module:<id>:enabled`（布尔，存 `'true'` / `'false'`）。
- 默认值由 `AppModule.defaultEnabled` 定义；用户覆盖后长期生效。
- 前端状态：`useModuleStore`（`hydrate` 后使用 `isEnabled(id)`）。

### 3. 独立设置页（可选）

- `AppModule.hasSettingsPage === true` 时：模块启用后，在**设置 → 侧栏 About 下方**出现对应入口（`plugin:<id>`）。
- 无独立页的模块只在「插件」列表中用开关 + 必要时的简短内联说明（如 Kanban 提示）。

### 4. 与设计宪法的关系

- **不制造焦虑**：模块不得默认用红色角标、未完成总数轰炸、惩罚式文案（参见宪法第二条）。
- **认知成本**：新能力应能关掉；默认开启的模块应是「多数用户愿意保留」的低打扰能力。
- **AI 相关**：提议与决定分离（宪法第四条）；MCP / Coach 等不得替用户做不可逆操作而不留痕迹。

### 5. 平台差异

- 部分能力仅 **Tauri 桌面**可用（如前台监听、嵌入式本地服务）；文档与 UI 应标明环境，避免在 Web/Capacitor 上假装存在。

---

## 按模块 ID 快速跳转

| ID | 文档 |
|----|------|
| `mcp-integration` | [mcp-integration.md](./mcp-integration.md) |
| `kanban` / `time-capsule` / `ai-coach` / `energy-indicator` / `brain-dump` / `advanced-filter` | [core-feature-modules.md](./core-feature-modules.md) |
| `desktop-widget` | [desktop-widget-design.md](./desktop-widget-design.md) |
| `window-context` | [window-context.md](./window-context.md) |

---

## 维护说明

- 新增 `BUILT_IN_MODULES` 条目时：在本目录**新增或更新**对应小节，并在上表中加入一行。
- 行为变更（默认开关、服务端门闩、新设置键）时：同步更新相关文档与 `skills/SKILL.md`（若涉及 MCP）。
