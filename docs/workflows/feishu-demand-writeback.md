# 飞书需求状态回填

在对应功能 PRD 的修复已由你确认验收（或你明确要求放弃）后，只更新飞书「需求收集管理」该行的「需求状态」。不改需求描述、不新增列、不删功能 PRD（除非你另说要删）。

转入见 `docs/workflows/feishu-demand-to-prd.md`。约定见 `specs/prds/prd-00016-feishu-demand-loop.md`。

## 入口

团队命令：`/team:feishu-demand-writeback <需求ID> 验收|放弃`（见 `.cursor/commands/team/feishu-demand-writeback.md`）。无独立 CLI。你给出**需求 ID**（或功能 PRD 路径），并明确说 **已验收 / 已修好** 或 **放弃** 后，Agent 用 `lark-cli --as user` 执行。

```bash
cd /Users/peng.zhi/Documents/Codex/0007-小红书增长引擎
lark-cli base +url-resolve \
  --url 'https://fcnegd976pzo.feishu.cn/wiki/VKnpwNGxuiwwKgkUhvqcpc6OnJb?fromScene=spaceOverview&table=tbl3wVH0rGdbIKlO&view=vewMnpNgGD' \
  --as user --format json
```

## 参数

| 参数 | 说明 |
|---|---|
| 需求 ID | 推荐。与转入时相同，如 `20261105_0003` |
| 功能 PRD 路径 | 可选。用于读取 `demand_id` / `demand_record_id` 交叉核对 |
| 动作 | `验收` → 已完成；`放弃` → 待评估 |
| `--as user` | 固定用户身份 |

## 日常步骤

1. **确认意图**  
   仅当你明确说该需求已修好 / 已验收，或明确要求放弃时继续。没有明确意图则停下，不猜。

2. **解析 Base**  
   跑上方 `+url-resolve`，记下 `base_token`、`table_id`。

3. **定位行与本仓溯源**  
   - 有功能 PRD：读 frontmatter 的 `demand_id`、`demand_record_id`。  
   - 用需求 ID 在表中核对同一 `record_id`；不一致则停下问你。  
   - 无 PRD 仅有需求 ID：按需求 ID 查行；若表上不是进行中，说明情况后停下（验收路径不猜着改已完成）。

4. **读当前「需求状态」**

| 当前状态 | 验收 | 放弃 |
|---|---|---|
| 进行中 | 改为 **已完成** | 改为 **待评估** |
| 已完成 | 停下说明已关闭，不改 | 停下，除非你明确要求重开为待评估 |
| 空 / 待评估 | 停下：尚未转入或未标进行中 | 已是开放，不改 |
| 其他 / 读失败 | 停下说明 | 停下说明 |

5. **只写需求状态**

验收：

```bash
lark-cli base +record-batch-update \
  --base-token <base_token> --table-id <table_id> \
  --json '{"update_records":{"<record_id>":{"需求状态":["已完成"]}}}' \
  --as user --format json
```

放弃：

```bash
lark-cli base +record-batch-update \
  --base-token <base_token> --table-id <table_id> \
  --json '{"update_records":{"<record_id>":{"需求状态":["待评估"]}}}' \
  --as user --format json
```

禁止改描述、负责人、优先级、分类、截图。放弃时默认保留 `specs/prds/` 下功能 PRD；只有你明确要求删除时才删。

6. **向你汇报**  
   需求 ID、record_id、旧状态 → 新状态、关联功能 PRD 路径（若有）。

## 产物

- 飞书该行「需求状态」更新为已完成或待评估
- 无本仓新文件（除非你另要求改 PRD 工程验收状态，那是 `/team:prd-accept`，与本 workflow 分开）

## 失败排查

| 现象 | 处理 |
|---|---|
| 你说验收但表上不是进行中 | 停下；可能未跑转入或状态被人改过；请你确认是否仍要标已完成 |
| `demand_record_id` 与表内不符 | 以你当场确认的 record_id 为准；修好 PRD frontmatter |
| 更新失败 / 权限不足 | 修 `lark-cli` 用户权限后重试同一条 update |
| 误改了其他字段 | 立即停下汇报；只回滚你授权的字段 |

## 测试

1. 对一条已知进行中的测试行（须你指定）跑验收：状态变为已完成。  
2. 对同一行再跑验收：应停下且不改。  
3. 对一条进行中行跑放弃：状态变为待评估；本仓功能 PRD 仍在。  
4. 对一条待评估行跑验收：应停下。
