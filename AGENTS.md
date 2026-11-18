# 小红书增长引擎 — 小红书账号运营闭环

本仓负责小红书账号运营闭环：内容生产、互动、数据复盘和发布排期。产出是可复跑的运营流程、脚本和当轮产物。不做违规自动化，也不与捞客仓对接。

## 脚手架

| 字段 | 值 |
|---|---|
| scaffold_version | 2.8.0 |

<!-- 来自 Vibecoding「自进化 Agent 工作区脚手架」母版。升级脚手架约定时改此号并对照母版 CHANGELOG；业务功能变更不要改此号。 -->

## 开始工作前

1. 先读 [`docs/doc_index.md`](./docs/doc_index.md) 找到相关文档，再动手。
2. 改动落进既有目录语义（见下表），不新增平级顶层目录。
3. 新增或改动文档后，登记进 `docs/doc_index.md`。
4. **分夹**：新建可复跑的**业务**工作流 → 只写 [`docs/workflows/<slug>.md`](./docs/workflows/)（先复制 `_TEMPLATE.md`）。**禁止**在 [`docs/builtin-workflows/`](./docs/builtin-workflows/) 新建业务 slug。
5. **任务后反思**：用户明确要求反思 / 任务后回顾 / 跑 post-task-reflect 时（建议在用户已验证本轮产物可用之后）→ 读并执行 [`docs/builtin-workflows/post-task-reflect.md`](./docs/builtin-workflows/post-task-reflect.md)。
6. **跳过反思**：当前任务就是在跑本反思（禁止套娃）；用户明确说不要回顾。
7. **提取经验**：用户明确要求提取经验 / 提炼最佳实践 / 抽跨项目共性时 → 读并执行 [`docs/builtin-workflows/extract-experience.md`](./docs/builtin-workflows/extract-experience.md)。落盘目录见该流（须问用户或读 AGENTS `experience_target`）。
8. **写备忘**：用户明确要求写成备忘 / 记进 memos / write-memo 时 → 读并执行 [`docs/builtin-workflows/write-memo.md`](./docs/builtin-workflows/write-memo.md)。命名 `memo-五位序号-slug`，索引 [`docs/memos/memo-wiki-index.md`](./docs/memos/memo-wiki-index.md)。
9. **记忆巩固与遗忘**：用户明确要求遗忘 / 记忆巩固 / consolidate-memory / 剪枝记忆时 → 读并执行 [`docs/builtin-workflows/consolidate-memory.md`](./docs/builtin-workflows/consolidate-memory.md)。
10. **发工牌**：用户明确要求发工牌 / 写工牌 / 首次发布 / 改合同字段（`name`·`origin`·`depends_on`）时 → 读并执行 [`docs/builtin-workflows/publish-evo-agent-pack.md`](./docs/builtin-workflows/publish-evo-agent-pack.md)。**日常发版不要从本条进门**。
11. **打发版 tag**：用户明确要求发版 / 打 tag / 建 Release 时 → 读并执行 [`docs/builtin-workflows/cut-release-tag.md`](./docs/builtin-workflows/cut-release-tag.md)。已有工牌与 remote 后，日常发版只雇本篇。
12. **收纳插件**：用户明确要求收纳插件 / 把这个项目收成插件 / intake-plugin 时 → 读并执行 [`docs/builtin-workflows/intake-plugin.md`](./docs/builtin-workflows/intake-plugin.md)。已装插件的日常使用见「插件」节，不走本条。
13. **飞书需求管理**：用户明确要求按需求 ID 从飞书提取 / 回写状态 / 跑 feishu-feature-enginer，或使用 `/team:feishu-feature-enginer` 时 → 读并执行 [`.cursor/commands/team/feishu-feature-enginer.md`](./.cursor/commands/team/feishu-feature-enginer.md)。**不**自动扫表；缺需求 ID 则先问；本条**不**写功能 PRD。口述需求仍走 `/team:product-manager`，不与本条互替。
14. （可选总目录）若同级存在 [`../AgentWikiIndex/`](../AgentWikiIndex/)，改完「能力声明 / 兄弟关系」后执行：
   `python3 ../AgentWikiIndex/scripts/refresh_catalog.py`
   若不存在该目录，**跳过**，不要报错、不要去建。
15. 团队命令在 [`.cursor/commands/team/`](./.cursor/commands/team/)，母版在 Vibecoding 团队成员库，命令全文不抄进本文件。
16. 改外观前先读 [`docs/DESIGN.md`](./docs/DESIGN.md)。
17. 踩坑记录与检索用技能 `huyuan-ai-dev-faq-assistant`，FAQ 目录为 `docs/faqs`。技能正文不拷进本仓库。
18. **后端 JS 检查**：改 `index.js`、其 `require` 到的 `src/` 业务文件，或 `scripts/run-studio.js` 时，文件须有 `// @ts-check` 与 JSDoc（外部参数先当 `unknown`，禁止 `any`）；改完跑 `pnpm run check:types`。页面 `src/studio/static/` 不在此列。
19. 查代码时 **首选 Codebase Memory MCP**，再降级全文检索：
   - 本仓：`project="Users-peng.zhi-Documents-Codex-0007-e5b08fe7baa2e4b9a6e5a29ee995bfe5bc95e6938e"`，用 `search_graph` / `search_code` / `trace_path` / `get_code_snippet`
   - **降级**：MCP 未接入、项目不在列表、查询失败，或目标落在 `.cursor/`、`cache/`、`output/`、`temp/` 时，再用 `Grep` / `Read`

## 内置流分工

内置流**仅**用户显式触发；任务结束**不**自动跑；互不串联；当前任务已是某流则禁止套娃。职责边界只看本表，正文不重复。

| 流 | 管什么 | 不管什么 |
|---|---|---|
| `post-task-reflect` | 本轮步骤该不该在（删→程序化→鲁棒→加速） | 不写跨项目最佳实践；不写备忘；不剪枝记忆 |
| `extract-experience` | 项目无关最佳实践 | 不改本轮步骤；不写仓内备忘 |
| `write-memo` | 本仓稳定约束 → `docs/memos/` | 不复述 PRD；一次踩坑走 FAQ；跨项目共性走提取经验 |
| `consolidate-memory` | 仓内约定冲突消解、过期/一次性剪枝 | 不做平行记忆库/向量库 |
| `publish-evo-agent-pack` | 首次/改合同工牌 | 日常发版 |
| `cut-release-tag` | 日常发版（upgrades→tag→Release） | 改合同字段 |
| `intake-plugin` | 把来源项目收成 `plugins/<id>/`；同 id 已装则按插件自身变更逐跳升级 | 已装插件的日常口令使用；卸插件 |

## 基线规则

本仓自带；不依赖某家 IDE 的全局规则。若运行时另有全局规则（如 Cursor `~/.cursor/rules/`），一并遵守；冲突时取更严 / 更具体者。

- **设计**：KISS；模块化（高内聚低耦合）；DRY；YAGNI；单一职责
- **质量**：可读性优于简洁；明确优于隐晦
- **协作**：注释解释为什么；优先复用已有组件 / 工具
- **包管理**：npm / pnpm 安装或移除只把命令给用户手动执行；不改 `node_modules` / lockfile；不直接改 `package.json` 依赖字段；新增依赖默认最新稳定版（用户指定版本除外）

## 目录约定

| 目录 | 用途 | 入库 |
|---|---|---|
| `src/` | 业务逻辑包，可被 import | 是 |
| `scripts/` | CLI 入口，一个脚本 = 一个工作流入口 | 是 |
| `skills/` | 可发布成员技能；每个技能一个子目录 `skills/<slug>/` | 是 |
| `plugins/` | 收纳进来的插件；每个插件一个子目录 `plugins/<id>/`；空仓不预建 | 是（装了才有） |
| `assets/` | 输入侧原料与样例 | 目录是；大媒体见 .gitignore |
| `config-templates/` | 程序行为配置出厂默认（怎么跑：超时、静音、开关等） | 是 |
| `configs/` | 运行时配置（首次从 `config-templates/` 同名文件拷入；可写回本机路径） | 否（整目录 gitignore） |
| `tests/` | 测试，结构镜像 `src/` 与 `scripts/` | 是 |
| `docs/` | 文档，见 docs 约定 | 是 |
| `specs/prds/` | PRD，索引见 `specs/prds/prd-wiki-index.md` | 是 |
| `upgrades/` | 发版说明（GitHub Release 正文）；文件名与 tag 一致；首次发版再建 | 是 |
| `cache/` | 可重建缓存，按内容哈希命名 | 否 |
| `temp/` | 中间产物，可随时清空 | 否 |
| `output/` | 最终产物，按 `output/<主题>/` 归档 | 否 |

约束：`cache/`、`temp/`、`output/`、`configs/` 全部 gitignore；删掉它们不影响代码可运行（`configs/` 会从 `config-templates/` 再生）。禁止根目录散文件。根目录 `evo_agent_pack.json` 首次发工牌再建（入库）。出厂行为配置改 `config-templates/`；本机调参改 `configs/`（勿改模板）；密钥与本机私密走环境变量 / `.env`，不进上述 JSON。空仓**不**预建 `plugins/`；装了插件才出现 `plugins/<id>/`。

### skills/ 约定

- 每个技能独占 `skills/<slug>/`（含 `SKILL.md` 等）；slug = frontmatter `name`；**禁止**以 `huyuan-ai` 开头。
- 共用逻辑放 `src/`；技能专属脚本放该技能内 `scripts/`。

### plugins/ 约定

- 每个插件独占 `plugins/<id>/`。内部再用 `assets/` / `docs/` / `scripts/` / `configs/`，缺哪类就省略哪类，不预建空夹。插件内 `configs/` 仍是随插件入库的出厂参数（不另套 `config-templates/`）。
- 宿主自己的 `assets/`、`docs/`、`scripts/`、`config-templates/`、`configs/` 仍只放本仓自己的东西；插件流程不进 `docs/workflows/`，也不进 `docs/builtin-workflows/`。
- 安装、升级、卸载的单位是整个 `plugins/<id>/`。收纳与升级走 builtin `intake-plugin`。

### 升格门槛

- 一次性脚本先放 `temp/<主题>/` 或 `output/<主题>/`；确认还会复用再升到 `src/` / `scripts/` / `skills/`。
- 只有「以后还会复跑」的**业务**流程才写 `docs/workflows/<slug>.md` 并登记进 `docs/doc_index.md`。内置流程不走这条（初始化就有，放在 `docs/builtin-workflows/`）。

## 文档约定

| 路径 | 内容 |
|---|---|
| `docs/doc_index.md` | 唯一入口索引，每行路径 + 一行摘要 |
| `docs/workflows/<slug>.md` | 业务可复跑动作；人/Agent 新建只放这里（入口 / 参数 / 步骤 / 产物 / 排查 / 测试） |
| `docs/builtin-workflows/<slug>.md` | 脚手架自带；改已有文件可以，禁止当业务目录用；每篇必须在「开始工作前」有触发，否则不要新增 |
| `docs/memos/` | 本仓稳定约束（备忘）；`memo-NNNNN-slug.md`；索引 `docs/memos/memo-wiki-index.md`（不占序号） |
| `docs/best-practices/<slug>.md` | 可选：项目无关最佳实践（提取经验时再建）；须含 semver `version` |
| `docs/faqs/<问题>.md` | 一次踩坑一篇，文件名即问题 |
| `specs/prds/` | PRD 正文与索引；产品经理写入，工程验收官回写文末状态 |

## 插件

人说话 → 对照下表口令 → 打开 `plugins/<id>/docs/` 里点名的那一篇 → 只在 `plugins/<id>/` 里改文件。对不上任何插件口令，就当本节为空，跳过。

| id | 版本 | 目录 | 口令 → 读 |
|---|---|---|---|
| （空） | — | — | 尚未收纳插件；要收纳时走 [`docs/builtin-workflows/intake-plugin.md`](./docs/builtin-workflows/intake-plugin.md) |

<!-- 收纳后每行记：id、版本、plugins/<id>/、口令与对应 docs 路径。全仓路由仍只认本文件；doc_index 追加插件流程行。 -->

## 环境

Node 用 **pnpm** 管理：`pnpm install` / `pnpm <script>`（安装命令只给用户手动执行）。

## 能力声明

| 字段 | 值 |
|---|---|
| lifecycle | active |
| owns | 小红书内容；互动运营；数据复盘；发布排期 |
| not | 违规自动化；与捞客仓对接 |

<!-- lifecycle：active / experiment / archive。若同级有 AgentWikiIndex，可被扫进其 CATALOG.md / CATALOG.json。 -->
