# PRD 索引

本文件不计入 PRD 序号。新产品文档由产品经理追加一行，按序号数值排序。

| 序号 | 文件 | 说明 |
|------|------|------|
| 00001 | `specs/prds/prd-00001-one-post-from-article.md` | 一句业务必填、文章可选，生成一篇可复制的小红书图文、封面和 0–9 张配图。工程 partial |
| 00002 | `specs/prds/prd-00002-cover-feed-hook.md` | 封面先由模型选定故事句或对比，再套用该类型的画面和文字规则。封面上的那句话单独成模块。 |
| 00003 | `specs/prds/prd-00003-studio-cal-palette.md` | 操作台三页只换 Cal.com 色板。技术栈、信息架构和交互不动。工程 accepted |
| 00004 | `specs/prds/prd-00004-image-set.md` | 头图在现有风格里选定，封面之外的图按张数排成故事拆开系列，两者运行时拼成一套图集。 |
| 00005 | `specs/prds/prd-00005-album-library.md` | 左栏图库管理页：浏览图册、学习参考图成草稿后确认写入、自加可二次确认删除；出厂五本不可删；新 kind 走通用槽。工程 accepted |
| 00006 | `specs/prds/prd-00006-fuse-reference-images.md` | 生图时融进上传素材：用法句、模板主体空位换人、封面与配图各自勾选；R0 挂在这篇，R1 资料库素材 Tab。工程 accepted |
| 00007 | `specs/prds/prd-00007-note-style-samples.md` | 「要发什么」类型下拉；范文与参考资料拆开；成稿三段提示词；资料库范文笔记库。工程 accepted |
| 00008 | `specs/prds/prd-00008-dexbuddy-host-models.md` | 官方插件 id 改为 app-dexbuddy-xiaohongshu-standard-editor；生文识图与两档生图走宿主模型；本机 .env 填 DEX_BUDDY_API_KEY；步骤键入账。工程 accepted |
| 00009 | `specs/prds/prd-00009-sdk-entitlement-gates.md` | 换成 Dex Buddy SDK 1.0.0；写成笔记与刷图在任务开始前由插件触发买断，购买提示交给工作台弹框。工程 accepted |
| 00010 | `specs/prds/prd-00010-image-prompt-on-refresh.md` | 写成笔记只出文；点风格即选中；刷新才套整套提示词并生当前张；同风格不重算；提示词框只留可改段。 |
