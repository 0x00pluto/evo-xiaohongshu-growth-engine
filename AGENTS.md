# 小红书增长引擎 — 小红书账号运营闭环

本仓负责小红书账号运营闭环：内容生产、互动、数据复盘和发布排期。产出是可复跑的运营流程、脚本和当轮产物。不做违规自动化，也不与捞客仓对接。

## 脚手架

| 字段 | 值 |
|---|---|
| scaffold_version | 2.4.0 |

<!-- 来自 Vibecoding「自进化 Agent 工作区脚手架」母版。升级脚手架约定时改此号并对照母版 CHANGELOG；业务功能变更不要改此号。 -->

## 开始工作前

1. 先读 [`docs/doc_index.md`](./docs/doc_index.md) 找到相关文档，再动手。
2. 改动落进既有目录语义（见下表），不新增平级顶层目录。
3. 新增或改动文档后，登记进 `docs/doc_index.md`。
4. **分夹**：新建可复跑的**业务**工作流 → 只写 [`docs/workflows/<slug>.md`](./docs/workflows/)（先复制 `_TEMPLATE.md`）。**禁止**在 [`docs/builtin-workflows/`](./docs/builtin-workflows/) 新建业务 slug。
5. **任务后反思**：用户明确要求反思 / 任务后回顾 / 跑 post-task-reflect 时（建议在用户已验证本轮产物可用之后）→ 读并执行 [`docs/builtin-workflows/post-task-reflect.md`](./docs/builtin-workflows/post-task-reflect.md)。**不**在每次任务结束后自动跑。
6. **跳过反思**：当前任务就是在跑本反思（禁止套娃）；用户明确说不要回顾。
7. **提取经验**：用户明确要求提取经验 / 提炼最佳实践 / 抽跨项目共性时 → 读并执行 [`docs/builtin-workflows/extract-experience.md`](./docs/builtin-workflows/extract-experience.md)。与反思同为手动触发、互不串联；**不**在每次任务后自动跑。落盘目录见该流（须问用户或读 AGENTS `experience_target`）。
8. **记忆巩固与遗忘**：用户明确要求遗忘 / 记忆巩固 / consolidate-memory / 剪枝记忆时 → 读并执行 [`docs/builtin-workflows/consolidate-memory.md`](./docs/builtin-workflows/consolidate-memory.md)。与反思、提取经验同为手动触发、互不串联；**不**自动跑。当前任务已是本流则禁止套娃。
9. **发工牌**：用户明确要求发工牌 / 写工牌 / 首次发布 / 改合同字段（`name`·`origin`·`depends_on`）时 → 读并执行 [`docs/builtin-workflows/publish-evo-agent-pack.md`](./docs/builtin-workflows/publish-evo-agent-pack.md)。**日常发版不要从本条进门**。
10. **打发版 tag**：用户明确要求发版 / 打 tag / 建 Release 时 → 读并执行 [`docs/builtin-workflows/cut-release-tag.md`](./docs/builtin-workflows/cut-release-tag.md)。已有工牌与 remote 后，日常发版只雇本篇。
11. （可选总目录）若同级存在 [`../AgentWikiIndex/`](../AgentWikiIndex/)，改完「能力声明 / 兄弟关系」后执行：
   `python3 ../AgentWikiIndex/scripts/refresh_catalog.py`
   若不存在该目录，**跳过**，不要报错、不要去建。
12. 团队命令在 [`.cursor/commands/team/`](./.cursor/commands/team/)，母版在 Vibecoding 团队成员库，命令全文不抄进本文件。
13. 改外观前先读 [`docs/DESIGN.md`](./docs/DESIGN.md)。
14. 踩坑记录与检索用技能 `huyuan-ai-dev-faq-assistant`，FAQ 目录为 `docs/faqs`。技能正文不拷进本仓库。

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
| `assets/` | 输入侧原料与样例 | 目录是；大媒体见 .gitignore |
| `tests/` | 测试，结构镜像 `src/` 与 `scripts/` | 是 |
| `docs/` | 文档，见 docs 约定 | 是 |
| `specs/prds/` | PRD，索引见 `specs/prds/prd-wiki-index.md` | 是 |
| `upgrades/` | 发版说明（GitHub Release 正文）；文件名与 tag 一致；首次发版再建 | 是 |
| `cache/` | 可重建缓存，按内容哈希命名 | 否 |
| `temp/` | 中间产物，可随时清空 | 否 |
| `output/` | 最终产物，按 `output/<主题>/` 归档 | 否 |

约束：`cache/`、`temp/`、`output/` 全部 gitignore；删掉它们不影响代码可运行。禁止根目录散文件。根目录 `evo_agent_pack.json` 首次发工牌再建（入库）。

### skills/ 约定

- 每个技能独占 `skills/<slug>/`（含 `SKILL.md` 等）；slug = frontmatter `name`；**禁止**以 `huyuan-ai` 开头。
- 共用逻辑放 `src/`；技能专属脚本放该技能内 `scripts/`。

### 升格门槛

- 一次性脚本先放 `temp/<主题>/` 或 `output/<主题>/`；确认还会复用再升到 `src/` / `scripts/` / `skills/`。
- 只有「以后还会复跑」的**业务**流程才写 `docs/workflows/<slug>.md` 并登记进 `docs/doc_index.md`。内置流程不走这条（初始化就有，放在 `docs/builtin-workflows/`）。

## 文档约定

| 路径 | 内容 |
|---|---|
| `docs/doc_index.md` | 唯一入口索引，每行路径 + 一行摘要 |
| `docs/workflows/<slug>.md` | 业务可复跑动作；人/Agent 新建只放这里（入口 / 参数 / 步骤 / 产物 / 排查 / 测试） |
| `docs/builtin-workflows/<slug>.md` | 脚手架自带；改已有文件可以，禁止当业务目录用；每篇必须在「开始工作前」有触发，否则不要新增 |
| `docs/best-practices/<slug>.md` | 可选：项目无关最佳实践（提取经验时再建）；须含 semver `version` |
| `docs/faqs/<问题>.md` | 一次踩坑一篇，文件名即问题 |
| `specs/prds/` | PRD 正文与索引；产品经理写入，工程验收官回写文末状态 |

## 环境

Node 用 **pnpm** 管理：`pnpm install` / `pnpm <script>`（安装命令只给用户手动执行）。

## 能力声明

| 字段 | 值 |
|---|---|
| lifecycle | active |
| owns | 小红书内容；互动运营；数据复盘；发布排期 |
| not | 违规自动化；与捞客仓对接 |

<!-- lifecycle：active / experiment / archive。若同级有 AgentWikiIndex，可被扫进其 CATALOG.md / CATALOG.json。 -->
