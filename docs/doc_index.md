# Document index

## Index

- `docs/mvp-map.md`: 增长引擎竖切地图；每刀出口是一篇可复制去发的稿；studio 只放页面，业务在 src 其他包
- `docs/builtin-workflows/post-task-reflect.md`: 任务后反思（白痴指数 → 删 → 程序化 → 鲁棒 → 加速）；用户明确要求时触发，不自动跑
- `docs/builtin-workflows/extract-experience.md`: 提取经验 → 项目无关最佳实践；用户明确要求时触发；落盘须问或读 experience_target，默认本仓 docs/best-practices/
- `docs/builtin-workflows/consolidate-memory.md`: 记忆巩固与遗忘（冲突消解 → 情景提纯 → 剪枝）；仅用户显式触发；与反思 / 提取经验互不串联
- `docs/builtin-workflows/publish-evo-agent-pack.md`: 仅首次 / 改合同时发布或核对 evo_agent_pack.json 工牌；日常发版勿进门；打 tag 改走 cut-release-tag；不做安装器
- `docs/builtin-workflows/cut-release-tag.md`: 日常发版唯一入口；汇总变更 → upgrades → 对齐工牌与（若有）plugin.manifest 同号 → tag → 推送 → gh 或网页建 Release；major 须人指定
- `docs/workflows/one-post-studio.md`: 一篇图文操作台与资料库（图库 / 上传参考 / 范文 6 列竖卡；以前的笔记约 8 列竖卡墙，点卡开左图右文浮层、编辑进笔记页、悬停复制；材料页组合灰字+贴底写成笔记；范文单框粘贴首行标题、已选只读；参考≤5；成稿标题超 20 不拦）；本机命令改页面会自动刷新，与 Dex Buddy 共用页面，插件包范围见 dex-buddy-plugin.pack
- `docs/workflows/_TEMPLATE.md`: 业务 workflow 六段骨架；新建业务工作流时复制并改名，写完后删掉本行或改成真实条目
- `docs/DESIGN.md`: 页侧视觉事实源（HTML、Alpine、daisyUI 5；配色为 Cal 色板；页头默认 text-xl / py-3；写一篇笔记 / 以前的笔记 / 资料库同档；以前的笔记约 8 列竖卡墙与小红书式详情浮层；排版含壳与侧栏 Lucide 图标/大屏收起、间距、两屏和手机框；等待用 Lottie 浮层；要发什么紧凑贴底 CTA；范文库同图库 6 列竖卡；学图册用 image-scan + 轮播文案）；改外观前先读
- `docs/references/xhs-prompt-taxonomy.md`: 人设×目的×形式提示词分类与组合校验原文，供操作台释义与写稿对照
- `specs/prds/prd-wiki-index.md`: PRD 索引，不计入序号；产品经理追加一行，工程验收官可回写状态
- `.cursor/commands/team/product-manager.md`: 产品经理，`/team:product-manager`，写 PRD
- `.cursor/commands/team/prd-accept.md`: 工程验收官，`/team:prd-accept`，回写 PRD 文末状态
- `.cursor/commands/team/front-enginer.md`: 前端工程师，`/team:front-enginer`，HTML First
- `.cursor/commands/team/test-enginer.md`: 测试工程师，`/team:test-enginer`，手工排障
- `.cursor/commands/team/feature-dev.md`: 自主交付工程师，`/team:feature-dev`，S1 到 S3
