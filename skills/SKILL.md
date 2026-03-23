# My Little Todo — MCP 使用技能

> 当用户要求你操作他的 todo / 任务 / 流记录 / 执行系统时，使用此技能通过 MCP 工具与 My Little Todo 交互。

## 连接信息

- **MCP 服务器名**: `my-little-todo`
- **协议**: MCP over Streamable HTTP (JSON-RPC 2.0)
- **端点**: `POST /api/mcp`
- **认证**: HTTP Header `Authorization: Bearer <jwt-token>`

## 核心概念

这不是传统待办清单，而是**外部执行系统**。核心理念：

- **先记录再整理**: 用户随手说的话先用 `add_stream` 记下来，有需要再转成任务
- **DDL 三级硬度**: `hard`(外部硬截止，不可改) / `commitment`(自我承诺，改需理由) / `soft`(建议性，可随意改)
- **角色驱动**: 用户有多个身份角色（如"研究生""工作""生活"），任务按角色分组
- **不制造焦虑**: 不要列出"所有未完成任务"来施压，聚焦"此刻能做的"

## 工具速查

### 读操作

| 工具 | 用途 | 关键参数 |
|------|------|----------|
| `get_overview` | 了解用户当前全貌（首选） | 无参数 |
| `list_tasks` | 浏览/筛选任务列表 | `status?`, `role?` |
| `get_task` | 查看单个任务完整信息 | `id` |
| `list_stream` | 查看最近流记录 | `days?` (默认7) |
| `search` | 全文搜索 | `query`, `scope?` (all/tasks/stream) |

### 写操作

| 工具 | 用途 | 关键参数 |
|------|------|----------|
| `create_task` | 创建新任务 | `title`, `ddl?`, `ddl_type?`, `role?`, `tags?`, `parent?` |
| `update_task` | 更新/完成/取消任务 | `id`, 其他字段可选, `note?` |
| `delete_task` | 删除任务 | `id` |
| `add_stream` | 添加流记录 | `content`, `role?` |

## 典型工作流

### "我现在该做什么？"

```
1. get_overview → 拿到紧急任务、角色统计
2. 基于 urgent 列表和角色上下文给出建议
```

### 用户随口说了一件事

```
1. add_stream(content="用户说的原文") → 先记录
2. 如果明确是个任务 → create_task(title=..., ddl=..., role=...)
```

### "帮我把XX标记完成"

```
1. 如果不知道任务ID → search(query="XX", scope="tasks") 或 list_tasks()
2. update_task(id="...", status="completed", note="完成说明")
```

### "帮我看看最近在忙什么"

```
1. get_overview → 今日流记录数 + 任务统计
2. list_stream(days=7) → 最近7天的详细记录
```

## 返回值说明

### get_overview 返回结构

```json
{
  "date": "2026-03-24",
  "counts": {"inbox": 3, "active": 5, "today": 1, "completed": 12},
  "urgent": [
    {"id": "task-xxx", "title": "...", "ddl": "2026-03-26T17:00:00Z", "ddl_type": "hard", "role_name": "研究生"}
  ],
  "roles": [
    {"id": "role-grad", "name": "研究生", "color": "#4A90D9", "active_count": 3}
  ],
  "schedule": [{"name": "上午", "start": "09:00", "end": "12:00"}],
  "stream_today": 4
}
```

### list_tasks 返回结构

任务列表不含 body（正文），已内联 `role_name`：

```json
{
  "tasks": [
    {"id": "task-xxx", "title": "...", "status": "active", "ddl": "2026-03-26", "ddl_type": "hard", "role": "role-grad", "role_name": "研究生"}
  ],
  "count": 1
}
```

需要正文时调 `get_task(id=...)` 获取完整信息。

## 注意事项

- 所有返回值为 **compact JSON**（无缩进），直接解析即可
- `list_tasks` 不含 body 字段，如需正文须调 `get_task`
- `update_task` 的 `note` 参数会写入任务的 Submissions 或 Postponements 记录段
- 创建子任务时用 `create_task(parent="父任务ID")`
- 任务状态流转: `inbox` → `active` → `today` → `completed` / `archived` / `cancelled`
- `search` 默认搜索全部，传 `scope="tasks"` 或 `scope="stream"` 可缩小范围
