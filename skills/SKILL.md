# My Little Todo — MCP 技能

> 通过 MCP 操作用户的 todo / 流 / 角色时遵循本文；工具以服务端 `tools/list` 为准（用户可关插件或限权）。

## 连接

`POST /api/mcp`，`Authorization: Bearer <token>`。若用户关闭「MCP 集成」插件，端点不可用。

## 权限（用户侧）

- **等级**：Read / Create / Full — 低等级无法调用高等级工具。
- **角色 ACL**：可能限制 AI 只能看到部分角色的数据；缺省为全部可见。
- 具体可用工具以 `tools/list` 为准。

## 核心概念（5 行）

外部**执行系统**（非简单清单）；**先记流再整理**；**DDL**：`hard` / `commitment` / `soft`；**角色**分组；避免罗列全部任务制造焦虑。

## 工具速查（按典型等级）

| 工具 | 用途 | 关键参数 |
|------|------|----------|
| `get_overview` | **首选**，一次拿全貌 | 无 |
| `list_tasks` | 轻量列表（无 body） | `status?`, `role?`, `parent?`, `tags?`, `sort?`, `offset?`, `limit?` |
| `list_projects` | 项目容器（`task_type=project`）及子树进度 | `role?` |
| `get_project_progress` | 单项目子树完成度 | `id` |
| `get_task` | 全文 + 子任务/父摘要 | `id` |
| `get_roles` | 角色 + 统计 | 无 |
| `list_stream` | 流记录 | `days?`, `limit?`, `offset?`, `role?`, `type?` |
| `search` | 标题/正文/内容子串 | `query`, `scope?`, `limit?` |
| `create_task` | 新建 | `title`, `body?`, `ddl?`, `ddl_type?`, `planned_at?`, `role?`, `parent?`, `task_type?`（`task`/`project`） |
| `add_stream` | 记一条流 | `content`, `role?` |
| `update_task` | 改/完成/取消 | `id`, `status?`, `body?`, `planned_at?`, `note?`, `task_type?` … |
| `delete_task` | 删任务 | `id` |
| `update_stream_entry` | 改流 | `id`, `content?`, `role?`, `entry_type?` |
| `manage_role` | 增删改角色 | `action` create/update/delete |

## 决策流（简）

```
用户要现状/安排 → get_overview
要查某条 → search 或 list_tasks → get_task(id)
随口一句 → add_stream；确认是任务 → create_task
完成/改期 → update_task（含 note）
```

## get_overview 要点（无 `urgent` 字段）

含 `counts`、`today_tasks`、`active_tasks`、`overdue`、`upcoming_ddl`、`recent_completed`、`roles`、`schedule`、`stream_today`（含 `latest` 预览）、`focus_session`（若有）。

## 反模式

- 不要 `list_tasks` 拉全量施压；用 `get_overview` + 分页。
- 不要未确认就 `delete_task` / `manage_role` delete。
- 若结果异常少，考虑用户限制了角色 ACL。

## 备注

- 返回多为单行 JSON 字符串。
- 子任务：`create_task(parent=...)`；子任务列表在 `get_task` 的 `subtasks`。
