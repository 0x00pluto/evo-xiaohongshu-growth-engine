# 飞书需求池 → 功能 PRD

把飞书「需求收集管理」里你指定的一条需求，在可处理时转成本仓功能 PRD，并把该行「需求状态」改为进行中。只服务本仓产品类型「DX-小红书增长引擎」。不扫全表、不改表结构、不改需求描述。

流程约定见 `specs/prds/prd-00016-feishu-demand-loop.md`。修完后的状态回填见 `docs/workflows/feishu-demand-writeback.md`。

## 入口

团队命令：`/team:feishu-demand-to-prd <需求ID>`（见 `.cursor/commands/team/feishu-demand-to-prd.md`）。无独立 CLI。你给出**需求 ID**（如 `20261105_0003`）后，Agent 用 `lark-cli --as user` 按下列步骤执行。

稳定 wiki URL（每次执行先 resolve，勿把 token 当唯一入口）：

```text
https://fcnegd976pzo.feishu.cn/wiki/VKnpwNGxuiwwKgkUhvqcpc6OnJb?fromScene=spaceOverview&table=tbl3wVH0rGdbIKlO&view=vewMnpNgGD
```

```bash
cd /Users/peng.zhi/Documents/Codex/0007-小红书增长引擎
lark-cli base +url-resolve \
  --url 'https://fcnegd976pzo.feishu.cn/wiki/VKnpwNGxuiwwKgkUhvqcpc6OnJb?fromScene=spaceOverview&table=tbl3wVH0rGdbIKlO&view=vewMnpNgGD' \
  --as user --format json
```

## 参数

| 参数 | 说明 |
|---|---|
| 需求 ID | 必填。表字段「需求ID」，如 `20261105_0003` |
| `--as user` | 固定用户身份；不要默认 bot |
| 功能 slug | 转入时可处理时再定；须合法 kebab-case，见产品经理命令 |

## 日常步骤

1. **解析 Base**  
   跑上方 `+url-resolve`，记下 `base_token`、`table_id`（及可选 `view_id`）。

2. **按需求 ID 定位行**  
   列出记录并投影最少字段，或按「需求ID」筛出唯一行，记下 `record_id`：

```bash
lark-cli base +record-list \
  --base-token <base_token> --table-id <table_id> \
  --field-id 需求ID --field-id 需求状态 --field-id 产品类型 \
  --field-id 需求分类 --field-id 优先级 --field-id 需求描述 \
  --field-id 需求提出人 --field-id 需求截图 \
  --as user --format json
```

若 CLI 支持按字段名投影失败，改用 resolve 返回的 `field_id`。表行数通常很少：优先拉全表后在本地按「需求ID」精确匹配；`auto_number` 上的 `--filter-json` 可能报 invalid_request，不要依赖服务端筛需求 ID。必须确认唯一命中一行；0 行或多行都停下问你。

3. **分流（改状态之前）**

| 条件 | 动作 |
|---|---|
| 产品类型 = Dexbuddy客户端 | 停下说明属客户端，**不改状态** |
| 产品类型 = 我也不知道 | 问你是否本仓；未确认前 **不改状态** |
| 产品类型 ≠ DX-小红书增长引擎 | 停下，**不改状态** |
| 需求状态 = 已完成 | 停下说明已关闭，**不改状态** |
| 需求状态 = 进行中 | 在 `specs/prds/` 搜 frontmatter `demand_id` 等于本需求 ID；有则指向该 PRD，**不重复开篇、不改状态**；无则告诉你表已是进行中但本仓无溯源，问是否仍要新开 |
| 需求状态为空或待评估 | 继续充分度判断 |
| 需求描述不足以写验收（过短、无可观察结果） | 问你补信息或是否仍开 PRD；未确认前 **不改状态** |
| 描述可写验收 | 进入步骤 4 |

相似描述（例如多条违禁词）只提示你，**不自动合并**。

4. **有截图则先下载查看**  
   「需求截图」非空时，用 `base +record-download-attachment` 下到 `temp/feishu-demand/<需求ID>/`（相对仓库根），读图后再写 PRD。路径只用相对路径。

5. **开功能分支并写功能 PRD**  
   - 从当前干净主干（或你指定的基线）开分支，建议名 `prd/<feature-slug>`。  
   - 按 `/team:product-manager` / 仓库 PRD 约定分配五位序号，落盘 `specs/prds/prd-{SEQ}-{feature-slug}.md`。  
   - 功能 PRD 的 YAML frontmatter **必须**含：

```yaml
demand_id: "20261105_0003"
demand_record_id: "recxxxxxxxx"
demand_source: feishu-demand-pool
```

   - 正文写清来源需求 ID、原描述摘要、目标与非目标、用户故事与验收要点。  
   - 登记 `specs/prds/prd-wiki-index.md`（及若需要的 `docs/doc_index.md`）。

6. **PRD 落盘后再改进行中**  
   确认功能 PRD 文件已在工作区存在后，只更新「需求状态」：

```bash
lark-cli base +record-batch-update \
  --base-token <base_token> --table-id <table_id> \
  --json '{"update_records":{"<record_id>":{"需求状态":["进行中"]}}}' \
  --as user --format json
```

单选值必须是数组。禁止顺手改描述、负责人、优先级、分类。

7. **向你汇报**  
   需求 ID、record_id、功能 PRD 路径、分支名、飞书状态已为进行中。后续实现与验收走功能 PRD；关闭状态走 `feishu-demand-writeback`。

## 产物

- 功能分支（如 `prd/<feature-slug>`）
- `specs/prds/prd-{SEQ}-{feature-slug}.md`（含 `demand_id` 等）
- `specs/prds/prd-wiki-index.md` 新增一行（若新建）
- 可选：`temp/feishu-demand/<需求ID>/` 截图（gitignore）
- 飞书该行「需求状态」= 进行中

## 失败排查

| 现象 | 处理 |
|---|---|
| `url-resolve` / 读表权限失败 | 按 `lark-shared` 修用户登录与 Base 权限；勿改 `--as bot` 蒙混 |
| 需求 ID 找不到 | 核对表内「需求ID」原文；请你确认是否抄错 |
| 更新返回 `ignored_fields` | 勿写自动编号等只读列；只提交「需求状态」 |
| 写成进行中但本仓无 PRD | 违反步骤 6；补写 PRD 或把状态改回待评估（须你同意） |
| 误动了客户端行 | 立刻停下；状态若已改错，按你指示用 writeback 或手工改回 |

## 测试

手工烟测（不改真实业务行时可用已完成的测试行只读；写入须你指定可写的需求 ID）：

1. resolve 能拿到 `base_token` 与表「需求收集管理」。  
2. 指定一条「DX-小红书增长引擎」且状态为空/待评估的需求 ID，走完步骤 5–6 后：本仓有带 `demand_id` 的 PRD，飞书为进行中。  
3. 再跑同一需求 ID：应命中「已进行中」分支，指向已有 PRD，不第二篇。  
4. 指定一条「Dexbuddy客户端」：停下且状态不变。
