# 视觉事实源

改外观前先读本文件。竖切顺序与红线在 [`docs/mvp-map.md`](./mvp-map.md)，不在这里重复。配色范围以 [`specs/prds/prd-00003-studio-cal-palette.md`](../specs/prds/prd-00003-studio-cal-palette.md) 为准。

## 页侧

- 一份 HTML。状态用 Alpine。需要控件时用 daisyUI 5 浅色。
- 页面底保持白。主按钮是近黑，不是蓝，也不是主题默认紫。
- 色值只用下面这组 daisyUI 语义变量。组件里不手写另一套颜色。
- 圆角和按钮尺寸跟随 daisyUI 5 浅色主题的默认控件，不另写一套。
- 不上构建链，不上 Next.js，不上 htmx。读写走 JSON。
- Dex Buddy 把插件页面开在隔离窗口里。按钮走 `window.dex.call`。

## 配色

颜色来自 Cal.com 的色板，落到 daisyUI 的语义变量上。`data-theme="light"` 在壳层覆盖一次，写笔记和历史跟着变。

| 语义变量 | 色值 | 用途 |
|----------|------|------|
| `--color-primary` | `#111111` | 主按钮底 |
| `--color-primary-content` | `#ffffff` | 主按钮上的字 |
| `--color-base-100` | `#ffffff` | 页面底 |
| `--color-base-200` | `#f5f5f5` | 浅灰面 |
| `--color-base-300` | `#e5e7eb` | 边框与分割线 |
| `--color-base-content` | `#111111` | 默认文字 |
| `--color-error` | `#ef4444` | 错误 |
| `--color-error-content` | `#ffffff` | 错误底上的字 |
| `--color-success` | `#10b981` | 成功 |
| `--color-success-content` | `#ffffff` | 成功底上的字 |
| `--color-warning` | `#f59e0b` | 警告 |
| `--color-warning-content` | `#111111` | 警告底上的字 |
| `--color-accent` | `#3b82f6` | 点缀。不用于主按钮 |
| `--color-accent-content` | `#ffffff` | 点缀底上的字 |

Cal 的正文灰 `#374151` 本期不单独做。默认文字用 `#111111`。

## 离开本事实源

操作台变成多路由产品，并且设计系统已经锁在 React，两件同时成立，才离开 HTML First。在那之前保持现在的页侧。
