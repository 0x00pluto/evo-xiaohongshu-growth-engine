# 视觉事实源

改外观前先读本文件。竖切顺序与红线在 [`docs/mvp-map.md`](./mvp-map.md)，不在这里重复。

## 页侧

- 一份 HTML。状态用 Alpine。需要控件时用 daisyUI 5 浅色。
- 页面底保持白。强调色只出现在按钮和标记上。
- 色值用 daisyUI 5 浅色语义色，不手写脱离主题的颜色。
- 圆角和按钮尺寸跟随 daisyUI 5 浅色主题的默认控件，不另写一套。
- 不上构建链，不上 Next.js，不上 htmx。读写走 JSON。
- Dex Buddy 把插件页面开在隔离窗口里。按钮走 `window.dex.call`。

## 离开本事实源

操作台变成多路由产品，并且设计系统已经锁在 React，两件同时成立，才离开 HTML First。在那之前保持现在的页侧。
