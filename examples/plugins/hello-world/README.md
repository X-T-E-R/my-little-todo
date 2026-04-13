# Hello World（示例 .mltp 插件）

演示：设置页 UI、`plugin:` KV 计数器、可选 CSS 与 `locales/`。

## 构建

在 monorepo 根目录：

```bash
pnpm --filter @my-little-todo/plugin-sdk build
pnpm --filter @example/mltp-hello-world build
```

产物：`dist/hello-world-0.1.0.mltp`

## 安装

应用内：**设置 → 插件 → 第三方插件 → 从文件安装**，选择上述 `.mltp`。
