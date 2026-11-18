# 写备忘（write-memo）

把本仓稳定约束写成可检索 Markdown：心智模型、实现编排、操作约定、架构边界。

**仅**在用户明确要求「写成备忘 / 记进 memos / write-memo」时触发。**禁止**自行落盘。

模板：[`docs/memos/_TEMPLATE.md`](../memos/_TEMPLATE.md)。索引：[`docs/memos/memo-wiki-index.md`](../memos/memo-wiki-index.md)（不占序号）。

## 入口

打开本文件，按「日常步骤」落盘。入口不是 CLI。

## 参数

| 参数 | 说明 |
|---|---|
| 主题 | 一句话：这次要记哪条稳定约束 |
| origin | 见下「Frontmatter」 |
| related_prd | 有产品文档时填序号列表；无则 `[]` |

### 落点分工

| 落点 | 写什么 |
|------|--------|
| `specs/prds/`（若本仓有） | 产品要什么、验收 |
| `docs/faqs/` | 问题→症状→根因→解法（一次踩坑） |
| `docs/best-practices/` | 项目无关共性（走提取经验，不写进 memos） |
| `docs/memos/` | 稳定心智模型、实现编排、操作约定、架构边界 |

**禁止**整份复述 PRD；**禁止**把一次踩坑写成备忘。

## 命名

`docs/memos/memo-{五位序号}-{英文短横线 slug}.md`

- 读 `memo-wiki-index`「下一可用序号」取号，落盘后把索引里的下一号 +1
- slug 小写英文 + 短横线

## Frontmatter（必填）

| 字段 | 规则 |
|------|------|
| `name` | 与文件名去掉 `.md` 一致 |
| `sequence` | 整数，与五位序号一致 |
| `title` | 短标题 |
| `created` / `updated` | **精确到秒**，`YYYY-MM-DDTHH:mm:ss+08:00`；新建取落盘时刻；改正文时刷新 `updated` |
| `origin` | `requested`（人主动要）/ `delivery`（交付时落工程约束）/ `architecture`（系统/架构心智） |
| `author` | `requested` 默认 `user`；`delivery` / `architecture` 默认 `agent` |
| `kind` | `ops` / `implementation` / `architecture` / `build` |
| `related_prd` | 如 `[8]`；无则 `[]` |
| `status` | `current` / `draft` / `superseded` |

## 日常步骤

```text
判断落点（PRD / FAQ / best-practices / memo）
→ 读 memo-wiki-index 取下一序号
→ 定 slug、origin、author、kind
→ 查重（同题则改旧文 updated，不新开号）
→ 套 _TEMPLATE 落盘 memo-NNNNN-slug.md
→ 追加 memo-wiki-index 一行；更新「下一可用序号」
→ 登记 docs/doc_index.md 一行摘要
→ 互链相关备忘
```

1. **判断落点**：按「落点分工」；该进 PRD / FAQ / 提取经验的不要写成 memo。
2. **取号**：读 [`docs/memos/memo-wiki-index.md`](../memos/memo-wiki-index.md)「下一可用序号」。
3. **定元数据**：slug、origin、author、kind、related_prd。
4. **查重**：同题已有 current 备忘 → 改正文并刷新 `updated`，**不**新开号；否则新建。
5. **落盘**：复制 [`docs/memos/_TEMPLATE.md`](../memos/_TEMPLATE.md) → `docs/memos/memo-NNNNN-slug.md`，填满 frontmatter 与主体。
6. **索引**：在 `memo-wiki-index` 追加一行；把「下一可用序号」+1。
7. **总索引**：在 [`docs/doc_index.md`](../doc_index.md) 追加一行摘要。
8. **互链**：相关备忘互相点名。

## 产物

- `docs/memos/memo-{五位序号}-{slug}.md`
- 更新后的 `docs/memos/memo-wiki-index.md`
- 更新后的 `docs/doc_index.md` 一行摘要

## 失败排查

| 现象 | 处理 |
|------|------|
| 索引下一号与已有文件冲突 | 以磁盘上最大序号 +1 为准，回写索引 |
| 同题已有备忘却又开了新号 | 合并进旧文，新文件标 `superseded` 或删除，索引改回 |
| 误把踩坑写成备忘 | 改走 `docs/faqs/`；备忘删或标 superseded |
| 用户未明确要求却想落盘 | **停** |

## 测试

- 仅凭「日常步骤」能完成落盘。
- 新建后：有对应 `memo-NNNNN-*.md`；索引有行且下一号已 +1；`doc_index` 有摘要。
