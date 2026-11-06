# 生图说法对照库

识图学出的风格模板，在放进草稿前可按对照库把**已知不宜说法**改成普通说法；资料库「怎么画」里看到的就是将要保存的全文。点「画这张」时只检查不改字，命中则提示，由人自己改。

不做谐音、拆字、同形字、零宽字符，也不循环改词重试生图。

## 何时用、何时不用

| 情况 | 怎么做 |
|---|---|
| **提示词说法**踩敏感（同一套参考图、换/改描述后能过） | 往 `rewrites.json` 的 `rules` 加条目 |
| **样图 / 参考图**本身不过审（短提示 + 仅该图仍 `CONTENT_FLAGGED`） | **不要**往词库堆词；靠学风格探针与红盾；换图或删 flagged 册 |
| 网关已回 `CONTENT_FLAGGED` | 宿主提示换画面说明或参考图，不当成「再点取回」；词库管的是本地事先改/拦文案 |

对照库只管**文案侧已知说法**；图片内容安全靠探针与网关，二者不要混用。

## 当前默认

`assets/prompts/one-post/image-safety/rewrites.json` 现为：

```json
{ "version": 1, "rules": [] }
```

- `rules` 为空：学模板**不改字**，画这张**不因词库**停下。
- 保留 `version` 与 `rules` 数组形状；机制（`apply` / `find`）仍在，需要时再往 `rules` 追加。
- 已落盘的图册题词**不会**因清空词库而自动回写。

## 入口

对照库与检测都在本仓，无独立 CLI。

```bash
cd /Users/peng.zhi/Documents/Codex/0007-小红书增长引擎
pnpm test -- tests/prompts/image-safety.test.js
pnpm run check:types
```

学图系统提示在 `assets/prompts/one-post/learn-album/system.md`，改完保存即可，不必改 JS。

## 参数

| 路径 | 说明 |
|---|---|
| `assets/prompts/one-post/image-safety/rewrites.json` | 说法对照；`version` + `rules[]`；每条 `id`、`match`、`replace` |
| `src/prompts/image-safety/apply.js` | `applyImageSafety` 学模板替换；`findImageSafety` 画这张只报告 |

## 如何加一条规则

确认是**提示词**问题后再加，不要为「图不过」加词。

1. 对照发出去的提示词，在**描述段**（「图片必须准确呈现」之前）找出可疑原句。
2. 在 `rules` 追加一条：
   - `id`：稳定英文短名（如 `body-care`）
   - `match`：与模型原文一字不差
   - `replace`：准确的普通说法；可写空串表示删掉该说法
3. 长句单独一条；加载时按 `match` 长度降序应用，避免短词先吃掉长句。
4. 补单测或用临时词库跑 `pnpm test -- tests/prompts/image-safety.test.js` 与 `pnpm run check:types`。
5. 新学风格会在草稿里换成新说法，并可显示「已改写：…」。已保存图册不自动改；画这张若 `find` 命中，笔记页错误行提示说法与建议改法，人在「怎么画」或画面内容里改完再画。

## 三个时机（与探针分工）

1. **学风格探针**：识图前用标准档 +「生成一张类似的图」+ 仅本张样图。`CONTENT_FLAGGED` 时仍落盘样图册（`safetyStatus: flagged`），不学提示词；通过才识图学词，保存时写 `safetyStatus: passed`。历史册无该字段：语义当通过、仍显示绿盾，不批量改写 album.json。写笔记风格面板不展示 `flagged`；资料库仍可见红盾、可删。
2. **学模板**：识图结果进草稿前 `apply` 一次（空库则原样）；保存按屏幕原文落盘。
3. **画这张**：拼好提示词后 `find`；有命中则停，不写「生成中」、不调生图、不改题词。网关若回 `CONTENT_FLAGGED`，提示换画面说明或参考图，**不**当成「再点取回」。

## 产物

- 学习草稿 `promptTemplate`（空库时与识图结果一致；有规则时可带 `promptRewrites`）
- 新学图册 `album.json` 可含 `safetyStatus`；资料库绿/红盾；笔记不展示 flagged
- 笔记页 `job.error`：词库命中提示，或 `CONTENT_FLAGGED` 人话

## 失败排查

| 现象 | 处理 |
|---|---|
| 新学草稿仍有旧说法 | 确认 `rewrites.json` 已保存且含对应 `match`；是否与模型原文一字不差 |
| 画这张提示命中但「怎么画」里没有 | 可能在画面内容或「我们的图」用法句；按提示改可见文字 |
| 改完词库仍 E005 / CONTENT_FLAGGED | 先核参考图（风格样图 / 我们的图）；学风格看是否红盾；不要为图不过往词库堆词 |
| 上图文案被改掉 | `apply` 只动「图片必须准确呈现」之前；把文案放回该标记之后 |
| 旧风格也有绿盾 | 正常：历史无 `safetyStatus` 视为通过并显示绿盾 |
| 空库时期望改词 | 当前默认不改；按「如何加一条规则」追加后再学 |

## 测试

```bash
pnpm test -- tests/prompts/image-safety.test.js
pnpm run check:types
```
