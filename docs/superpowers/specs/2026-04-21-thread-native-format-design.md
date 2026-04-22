# Thread Native Format Design Blueprint

## 背景

这一轮讨论的目标，不是继续给现有 `work-thread` 加字段，而是把线程真正收敛成一种原生支持的内容格式。

当前仓库里已经有三条主线：

- `Task`：承诺、DDL、完成、子任务
- `Stream`：捕获、灵感、日志、旁支、原始材料
- `Thread`：恢复工作现场

问题在于，现有线程模型把太多东西都塞进了线程本体里，结果线程一边像任务系统，一边像笔记系统，一边又像 AI 运行时。用户写线程笔记时其实没有这么多稳定对象；他们更像是在一份文档里维护：

- 当前在推进什么
- 接下来先干什么
- 为什么现在停住
- 哪些东西已经承诺成任务
- 哪些只是旁支想法
- 过程中发生了什么

这份蓝图的目标是把线程收成一个更薄、更稳、可双向转换 Markdown 的原生格式，同时继续和 `Task / Stream / Board / Now` 无缝衔接。

## 这轮确认下来的结论

### 1. 线程内的显式块类型收成四类

- `/task`
- `/spark`
- `/log`
- `/mission`

其中：

- `/mission` 不是新模型，只是 `/task` 的别名
- `/mission` 对应的底层对象仍然是 `Task`
- 任务和 mission 的差别是语义标记，不是实体类型分叉

### 2. `resume` 和 `pause` 不是块类型

`resume` 和 `pause` 不再作为文档块出现，而是对象属性。

它们都需要支持被覆盖，并且需要历史。

`pause` 至少要能表达两层信息：

- `reason`：为什么先停
- `then`：条件满足后先接哪一步

### 3. `/log` 保留，但它的价值不是“只是记录”

`/log` 的存在意义有两层：

1. 在 thread 内成为结构化日志块，便于筛选、折叠和局部查看
2. 允许后续被提升为 `Stream.log`

这意味着 `/log` 不是普通正文的强制替代；正文仍然允许存在，但不参与结构化统计与提升流程。

### 4. 线程要有原生存储格式，Markdown 只是视图和交换格式

线程在主程序的存储层不应该以一整份 Markdown 为真相源。

正确方向是：

- 主存储：原生结构化 thread format
- 导出/导入：Markdown 双向转换
- UI：既能按块编辑，也能切到文档视图

### 5. 一个 thread 里可以有多个 mission

这一点很关键。线程不是只围绕一个唯一 mission 运转。

一个 thread 可以有：

- 多个 mission
- mission 下的普通 task
- spark
- log

当 thread 很长时，用户应该能切换统计/过滤视图，只看：

- missions
- tasks
- sparks
- logs

## 设计目标

1. 不新开 `Mission` 独立模型。
2. `Task` 继续是承诺层，`Thread` 继续是运行时层。
3. thread 内支持结构化块，但线程本体不再退化成一整份原始 Markdown。
4. `resume/pause` 作为频繁覆写的属性，必须进入历史体系。
5. `/log`、`/spark` 都允许提升到 `Stream`。
6. thread 很长时，支持按类型筛选和统计，而不是只能全文滚动。

## 非目标

1. 不把 thread 直接做成特殊 task。
2. 不让 Markdown 成为主程序的唯一存储格式。
3. 不要求用户每一句正文都写成结构化块。
4. 不在这一轮把 `Task`、`Stream`、`Thread` 合成一个超级模型。

## 核心设计

### 一、对象边界

#### 1. Task

`Task` 继续负责：

- 承诺
- 完成状态
- DDL
- 子任务
- 看板排序

这轮只增加一个语义层：

- `task` 可以被标记为 `mission`

也就是说，mission 只是 task 的一种语义视图，不是独立实体。

#### 2. Stream

`Stream` 继续负责：

- 跨线程捕获
- 全局日志
- 灵感池
- 原始材料

这轮需要支持两类从 thread 提升来的内容：

- `ThreadLog -> Stream.log`
- `ThreadSpark -> Stream.spark`

#### 3. Thread

`Thread` 负责：

- 当前工作线的恢复现场
- 结构化块的编排顺序
- `resume / pause`
- 过滤与统计视图

Thread 不再持有一整棵“线程专用对象宇宙”，而是作为一种原生文档格式，组织：

- task block
- spark block
- log block

## 二、原生存储格式

### 1. Thread record

```ts
interface Thread {
  id: string
  title: string
  status: 'active' | 'paused' | 'done' | 'archived'
  resume?: string
  pause?: {
    reason: string
    then?: string
  }
  createdAt: number
  updatedAt: number
}
```

说明：

- `resume` 是 thread 级的“回来先接哪里”
- `pause` 是 thread 级的“为什么先停、恢复后先接什么”
- 这两个字段都允许为空

### 2. Thread block

```ts
type ThreadBlockKind = 'task' | 'spark' | 'log'
type ThreadTaskAlias = 'task' | 'mission'

interface ThreadBlock {
  id: string
  threadId: string
  kind: ThreadBlockKind
  sortKey: string

  taskAlias?: ThreadTaskAlias
  linkedTaskId?: string

  promotedStreamEntryId?: string

  title?: string
  body?: string

  createdAt: number
  updatedAt: number
}
```

说明：

- `kind='task'` 时，块的本体是一个 `Task` 引用
- `taskAlias='mission'` 表示该 task 在 thread 文档里显示为 `/mission`
- `kind='spark'` 与 `kind='log'` 时，块可以先是 thread 本地内容，之后再提升到 `Stream`
- `promotedStreamEntryId` 用来记录它已经提升到哪个 StreamEntry

### 3. Task 的 mission 语义

蓝图要求 mission 不新开模型，但实现上可以有两种落地办法：

#### 方案 A：复用现有 `taskType`

- `taskType='task'`：普通任务
- `taskType='project'`：mission

优点：

- 改动最小

缺点：

- `project` 语义不完全等于 `mission`

#### 方案 B：增加独立语义字段

```ts
taskKind: 'task' | 'mission'
```

优点：

- 语义更直接

缺点：

- 需要新增字段与迁移

本蓝图不强行限定二选一，但要求对外统一表现为：

- `/task` = 普通 task
- `/mission` = mission task

## 三、属性设计

### 1. Thread 属性

线程级：

- `resume`
- `pause.reason`
- `pause.then`

这些属性描述的是整条工作线，而不是某一个块。

### 2. Task / Mission 属性

普通 task 和 mission task 都允许有：

- `resume`
- `pause.reason`
- `pause.then`

这表示：

- thread 可以有“整条线的恢复点”
- mission 可以有“这个目标自己的恢复点”
- task 也可以有“这个动作自己的恢复点”

这三层不是互斥关系，而是不同粒度的状态。

### 3. Spark 属性

`spark` 不带 `resume / pause`。

原因是：

- spark 表示尚未承诺的想法、材料、旁支
- 它不承载恢复语义
- 一旦需要 `resume / pause`，它就应该被提升为 task 或 mission

### 4. Log 属性

`log` 本身只需要：

- `title?`
- `body`
- `promotedStreamEntryId?`

它不带 `resume / pause`。

如果某段 log 已经演化成明确待办或明确停顿，应转成 task 或 thread/task 属性，而不是继续停留在 log。

## 四、Markdown 视图和双向转换

### 1. 原则

- 原生结构化存储是唯一真相源
- Markdown 是导入、导出、分享、Obsidian 协作视图
- 任意时刻都可以从 thread native format 生成 Markdown
- 导入 Markdown 时，解析成 `Thread + ThreadBlocks + Task links`

### 2. Markdown 语法

线程头信息：

```md
---
title: 跑通 COMSOL 微型电阻案例
status: active
resume: 先重跑一次微型电阻，把每一步截图记下来
pause.reason: 在等 Codex 那边插件结果
pause.then: 修好后优先接专利搜索插件
---
```

结构化块：

```md
/mission
title: 跑通最小案例
done: 能完整复现并留下步骤

/task
title: 重跑微型电阻案例

/spark
title: 跑通后单开一条 COMSOL 学习路线

/log
官网案例已经能打开。
```

### 3. 正文

线程仍允许有自由正文。

但自由正文的定位是：

- 非结构化笔记
- 临时记录
- 未整理片段

它默认不参与：

- mission/task/spark/log 统计
- 结构化过滤
- 提升到 Stream 的动作

如果用户想让某一段正文参与结构化能力，应显式转成 `/log`、`/task` 或 `/spark` 块。

## 五、`/log` 提升到 Stream

### 1. 为什么要支持

用户在线程里写的 log，有些只是局部上下文；有些则值得成为全局流记录。

例如：

- 重要决策
- 外部结果
- 明确进展
- 对后续线程也有价值的观察

这些内容不应被困在线程内部。

### 2. 提升规则

`/log` 块支持一个显式动作：

- Promote to Stream

执行后：

1. 创建 `StreamEntry(entryType='log')`
2. 写回 `promotedStreamEntryId`
3. thread 内保留原 log 块
4. UI 显示该块已同步到 Stream

### 3. `/spark` 同理

`/spark` 块也支持：

- Promote to Stream spark

执行后生成：

- `StreamEntry(entryType='spark')`

## 六、历史与覆写

`resume` 和 `pause` 是高频覆写字段，不能只保留最新值。

### 1. 历史要求

对 thread 和 task 上的以下字段都记录历史：

- `resume`
- `pause.reason`
- `pause.then`

### 2. 记录方式

优先复用仓库现有的：

- `entity_revisions`
- `audit_events`

而不是在线程模型里额外堆一个 `resumeHistory[]` / `pauseHistory[]`。

### 3. 事件语义

建议补充这几类动作语义：

- `resume_updated`
- `pause_updated`
- `pause_cleared`

UI 可以在历史面板里单独聚合这些变化，形成：

- 最近恢复点变化
- 最近暂停原因变化

### 4. 为什么不用内联数组

因为 `resume/pause` 的历史不是 thread 独有能力，task 上也会需要。

统一走 revision/audit 体系，后续：

- task
- mission
- thread

都能共用一套历史查看方式。

## 七、多 mission 与统计视图

一个 thread 可以有很多 mission。

因此 thread 视图不能只是一篇长文档，还必须支持结构化筛选。

### 1. 统计口径

线程页需要能给出至少这些统计：

- mission 数量
- task 数量
- spark 数量
- log 数量
- mission 完成数
- task 完成数
- 未提升 spark 数量
- 未提升 log 数量

### 2. 过滤视图

thread 很长时，用户可以切换：

- All
- Missions
- Tasks
- Sparks
- Logs

### 3. mission/task 关系

允许两种组织方式：

1. mission 只是 thread 内多个平铺 block
2. mission 下挂子 task

第一版先不强制做树结构，只要求 mission 和 task 都能被筛出、统计、关联。

## 八、与看板和 Now 的关系

### 1. 看板

mission 本质上还是 task，因此：

- 可以上任务看板
- 可以按 status 排列
- 可以展开看到子任务

thread 本身不等于 task，但可以：

- 在 thread 页面里统计其 missions/tasks
- 从 mission 打开所属 thread

### 2. Now

Now 需要能同时考虑：

- 当前 thread 的 `resume`
- mission task 的 status / ddl / pause
- 普通 task 的 urgency

但这不要求把 thread 合并进 task，只要求：

- thread 能锚定一组 task
- task 能反向知道自己属于哪个 thread

## 九、推荐的第一版实现切法

### 1. 先保住语义，不急着一次性重做所有 UI

第一阶段先落这几个核心能力：

- thread native format
- `/mission` 作为 `/task` 别名
- `/log` 可提升到 Stream
- `resume/pause` 接入历史
- 基础过滤视图

### 2. 存储层

新增或收敛为：

- `work_threads`
- `work_thread_blocks`

并继续复用：

- `tasks`
- `stream_entries`
- `entity_revisions`
- `audit_events`

### 3. Markdown

保留现有 Markdown 兼容入口，但语义改成：

- Markdown 只是 thread native format 的一种视图
- 不是主存储

## 十、最后的收敛

这版蓝图的核心，不是“线程支持多少块”，而是三句话：

1. mission 不是新模型，它是 task 的语义别名。
2. thread 是原生结构化格式，Markdown 只是双向转换视图。
3. `/log` 保留，因为它需要能在线程里结构化存在，并在需要时提升到 Stream。

按这版走，线程会同时具备：

- 文档感
- 结构化视图
- 与 Task/Stream 的无缝衔接
- 可追溯的 `resume/pause` 历史

而不会继续膨胀成一套线程专属的平行系统。
