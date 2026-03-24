# E2E 测试指南

> 本文档为 my-little-todo 项目的 E2E（端到端）测试规划和实施指南，供后续负责实现的开发者参考。

---

## 1. 目标

E2E 测试验证**完整用户流程**是否正常工作：从浏览器/桌面端的 UI 操作，到后端 API 调用，到数据库持久化，再到结果在 UI 上的正确呈现。

与单元测试和集成测试不同，E2E 测试：
- 启动真实后端服务器（Rust）
- 在真实浏览器中运行前端（React）
- 模拟真实用户操作（点击、输入、导航）
- 验证最终用户可见的结果

## 2. 适用场景

| 适合用 E2E 测试 | 不适合用 E2E 测试 |
|---|---|
| 用户注册/登录完整流程 | 单个函数的边界值验证 |
| 流记录的创建→显示→编辑→删除 | Markdown 解析器的各种格式 |
| 数据导入/导出的完整链路 | JWT 签发/验证逻辑 |
| 跨页面导航和状态持久化 | 数据库 SQL 查询正确性 |
| 移动端/桌面端特有交互 | 配置文件加载 |

## 3. 技术栈推荐

### 3.1 Web 端（纯浏览器）

| 工具 | 说明 |
|---|---|
| **Playwright** | 首选。支持 Chromium/Firefox/WebKit，API 直观，自带 codegen |
| Cypress | 备选。社区生态大，但跨域和多 tab 支持较弱 |

推荐 Playwright，理由：
- 多浏览器引擎（包括 WebKit，与 Tauri 一致）
- 原生支持并行测试
- 网络请求拦截和 mock 能力强
- 可以生成测试代码（`npx playwright codegen`）

### 3.2 Tauri 桌面端

| 工具 | 说明 |
|---|---|
| **tauri-driver** + WebDriver | Tauri 官方方案，通过 WebDriver 协议控制 |
| Playwright + 自定义连接 | 连接到 Tauri 内部的 WebView 调试端口 |

桌面端测试比 Web 端复杂很多，建议先做 Web 端 E2E，验证核心逻辑后再扩展到 Tauri。

## 4. 环境搭建

### 4.1 依赖安装

```bash
# 在项目根目录
pnpm add -Dw @playwright/test

# 安装浏览器二进制
npx playwright install --with-deps chromium
```

### 4.2 配置文件

在 `packages/web/` 下创建 `playwright.config.ts`：

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // 可选：{ name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    // 启动 Rust 后端 + Vite 前端
    command: 'pnpm dev:web',
    port: 3001,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

### 4.3 测试数据库隔离

E2E 测试**必须使用独立的数据库**，绝不能连接开发/生产数据。

```bash
# 方案一：使用临时目录
export DATA_DIR=$(mktemp -d)
export AUTH_MODE=multi
export JWT_SECRET=e2e-test-secret

# 方案二：使用 Docker Compose
docker compose -f docker-compose.test.yml up -d
```

每次测试前清理数据：
```typescript
test.beforeEach(async () => {
  // 调用 API 清理，或重启服务器指向新的临时目录
});
```

## 5. 核心测试用例清单

### 5.1 认证流程

| # | 用例 | 操作步骤 | 预期结果 |
|---|---|---|---|
| A1 | 首次注册 | 打开应用 → 输入用户名密码 → 点击注册 | 成功进入主页面，显示用户名 |
| A2 | 登录 | 打开登录页 → 输入已注册的账号密码 → 点击登录 | 成功进入主页面 |
| A3 | 登录失败 | 输入错误密码 → 点击登录 | 显示错误提示，停留在登录页 |
| A4 | 退出登录 | 点击设置 → 点击退出 | 回到登录页 |
| A5 | Token 过期 | 等待 Token 过期后操作 | 自动跳转到登录页 |

### 5.2 流记录（Stream）

| # | 用例 | 操作步骤 | 预期结果 |
|---|---|---|---|
| S1 | 创建流记录 | 在输入框输入内容 → 按回车 | 记录出现在时间线中 |
| S2 | 带标签的记录 | 输入包含 `#标签` 的内容 | 标签被正确识别和高亮 |
| S3 | 查看历史 | 切换到前一天的日期 | 显示对应日期的记录 |
| S4 | 流记录提取为任务 | 点击流记录的"提取为任务"按钮 | 创建新任务，流记录标记为 [task] |

### 5.3 任务管理

| # | 用例 | 操作步骤 | 预期结果 |
|---|---|---|---|
| T1 | 创建任务 | 打开任务创建表单 → 填写标题和详情 → 保存 | 任务出现在列表中 |
| T2 | 完成任务 | 在任务列表中点击完成按钮 | 任务状态变为已完成 |
| T3 | 编辑任务 | 打开任务 → 修改标题 → 保存 | 标题更新成功 |
| T4 | 删除任务 | 打开任务 → 点击删除 → 确认 | 任务从列表消失 |
| T5 | 设置 DDL | 编辑任务 → 设置截止日期 | DDL 显示在任务卡片上 |

### 5.4 设置

| # | 用例 | 操作步骤 | 预期结果 |
|---|---|---|---|
| ST1 | 修改设置 | 打开设置页 → 修改某项 → 保存 | 刷新后设置保持 |
| ST2 | 数据导出 | 点击导出 JSON | 下载的文件包含所有数据 |
| ST3 | 数据导入 | 上传之前导出的 JSON | 数据完整恢复 |

### 5.5 跨页面验证

| # | 用例 | 操作步骤 | 预期结果 |
|---|---|---|---|
| X1 | 流记录→任务联动 | 在流中创建带任务引用的记录 | "此刻"视图能看到相关任务 |
| X2 | 刷新持久化 | 创建数据后刷新页面 | 所有数据仍然存在 |

## 6. E2E 测试代码示例

```typescript
import { test, expect } from '@playwright/test';

test('注册并创建第一条流记录', async ({ page }) => {
  await page.goto('/');

  // 注册
  await page.fill('[data-testid="username-input"]', 'testuser');
  await page.fill('[data-testid="password-input"]', 'testpass123');
  await page.click('[data-testid="register-button"]');

  // 等待进入主页面
  await expect(page.locator('[data-testid="stream-input"]')).toBeVisible();

  // 创建流记录
  await page.fill('[data-testid="stream-input"]', '今天开始写 E2E 测试了 #testing');
  await page.keyboard.press('Enter');

  // 验证记录出现
  await expect(page.locator('text=今天开始写 E2E 测试了')).toBeVisible();
  await expect(page.locator('text=#testing')).toBeVisible();
});
```

## 7. 注意事项与踩坑点

### 7.1 Tauri 桌面端特殊性

- Tauri 使用系统 WebView（Windows 用 WebView2，macOS 用 WebKit），行为可能与 Chrome 不同
- Tauri IPC 调用（如 `@tauri-apps/plugin-sql`）在浏览器环境中不可用，E2E 测试需要走 HTTP API 而非 Tauri IPC
- 桌面端 `AuthMode::None` 模式无登录页面，需要根据模式调整测试流程

### 7.2 数据隔离

- **每个测试用独立数据库**，防止测试间互相干扰
- 推荐给 E2E 服务器设置 `DATA_DIR` 为临时目录
- 测试结束后清理临时目录
- 并行运行时，每个 worker 需要独立端口和数据目录

### 7.3 等待与稳定性

- 避免 `page.waitForTimeout(1000)` 这类硬等待
- 使用 Playwright 的自动等待：`await expect(locator).toBeVisible()`
- 网络请求可能有延迟，关注 `networkidle` 状态
- 动画（Framer Motion）可能影响元素可见性判断，考虑在测试中禁用动画

### 7.4 CI 集成难点

- CI 中需要先编译 Rust 后端（~3-5 分钟），再启动服务器
- 需要安装浏览器二进制（Playwright 约 200MB）
- 总 CI 时间可能超过 10 分钟，建议放在单独的 workflow 中，不阻塞常规 PR 合并
- 考虑只在 `main` 分支或手动触发时运行 E2E

### 7.5 测试数据构造

- 使用固定的种子数据（fixture），而非依赖 `Date.now()` 等动态值
- 为 UI 元素添加 `data-testid` 属性，避免依赖不稳定的 CSS 选择器
- 当前代码库中**尚未添加 `data-testid`**，实施 E2E 前需要先在关键 UI 元素上添加

## 8. 实施建议

1. **先做 Web 端**：用 Playwright 测试 `dev:web` 启动的 HTTP 模式，覆盖认证 + 核心 CRUD
2. **添加 `data-testid`**：在关键交互元素上添加测试锚点
3. **独立 CI workflow**：E2E 测试单独一个 workflow，不阻塞主 CI
4. **桌面端后做**：等 Web 端 E2E 稳定后，再探索 `tauri-driver` 方案
5. **保持用例精简**：E2E 测试维护成本高，只覆盖核心路径，细节交给单元/集成测试
