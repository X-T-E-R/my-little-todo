# 发布验收记录

更新时间：2026-04-13

## 本轮已完成

- `pnpm lint` 通过
- `pnpm typecheck` 通过
- `pnpm test:all` 通过
- `pnpm --filter @my-little-todo/web build:vite` 通过

## 本轮新增保障

- 新增 Web 侧备份导入导出测试：
  - 备份 JSON 稳定字段契约
  - ZIP / JSON 导入解析
  - 本地恢复写入不静默丢任务、流记录、设置
  - 旧文件型备份识别
- 将备份导入导出核心逻辑从设置页视图中下沉到独立 helper，降低回归风险：
  - `packages/web/src/utils/backupPayload.ts`
  - `packages/web/src/utils/backupPayload.test.ts`
- 同步修正文档承诺边界：
  - 中英文 README
  - 中英文发布检查清单

## 当前自动化验证结果

### 1. 工程门槛

已验证通过：

```bash
pnpm lint
pnpm typecheck
pnpm test:all
pnpm --filter @my-little-todo/web build:vite
```

### 2. 数据安全相关

当前已自动化覆盖：

- 服务端 JSON 导出包含备份元信息与 blob
- 服务端 blob 读取权限校验
- 服务端导出到磁盘的管理员与路径限制
- 服务端同步 push / changes 基础链路
- 服务端 blob 删除同步
- Web 本地备份 JSON 结构稳定性
- Web JSON / ZIP 导入解析
- Web 本地导入恢复任务、流记录、设置

### 3. 构建结果

- Web 构建通过
- 主入口 chunk 已收敛到首发可接受范围
- 仍保留一个编辑器相关的大 chunk warning，但属于按需链路，不阻塞首发

## 当前未自动化、仍需人工验收

以下项目在当前会话环境中没有真实跑通，发布前仍建议手工验收：

1. 旧版本升级到当前版本后的本地数据保留
2. 升级中断后再次启动的恢复行为
3. Desktop 安装包安装与升级
4. Android/Capacitor 真机安装、升级与本地 SQLite 路径确认
5. API / WebDAV 冲突同步时的真实交互表现
6. 关闭全部 Beta 能力后的完整主流程体验
7. 任一 Beta 功能失败时主界面与核心数据是否完全不受影响

## 当前非阻塞残留项

- 仓库里仍有 33 条历史 warning，主要是复杂度债务和部分旧的 Hook 依赖提示
- `milkdown-components` 仍有大 chunk warning
- `desktopWidget` 仍有一条 ineffective dynamic import warning，属于 Beta / 设置链路问题，不阻塞当前首发

## 当前判断

从自动化门槛、类型、测试、Web 构建和文档承诺一致性来看，当前版本已经达到“候选发布版”状态。

如果要把“候选发布版”提升到“正式对外发布版”，建议下一步只做两件事：

1. 跑完上面的人工验收清单
2. 记录一份真实升级与恢复演练结果

