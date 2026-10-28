# 一篇图文操作台

同一张页面有两种入口。在 Dex Buddy 里，按钮走 `window.dex.call`。用本机命令打开时，按钮走 `POST /api/one-post/<方法>`。成稿、提示词和生图仍是 `src/one-post`，操作台不另写一套业务。

## 入口

```bash
cd /Users/peng.zhi/Documents/Codex/0007-小红书增长引擎
node scripts/run-studio.js --open
```

浏览器打开 `http://127.0.0.1:8768/`。只绑定本机。改 `src/studio/static` 里的 HTML、JS 或 CSS 后，已打开的页面会自动刷新。改 `src/one-post` 或 `scripts/run-studio.js` 需要重新运行这条命令。

同一套页面也可以作为 Dex Buddy 插件打开。仓库根上的 `plugin.manifest.json` 指向 `index.js` 和这份页面。插件里优先走 `window.dex.call`。既不在工作台、也不是这条本机命令打开时，生成按钮不可用，并说明要在工作台或本机操作台里打开。

开发时不要把源码拷进 Dex Buddy 的 `plugins/`。在 Dex Buddy 仓库根把 `config.dev.example.json` 复制为 `config.dev.json`，写入：

```json
{
  "extraPluginPaths": [
    "/Users/peng.zhi/Documents/Codex/0007-小红书增长引擎"
  ]
}
```

`config.dev.json` 只在未打包的开发版里生效。改 `index.js` 或页面后重启 Dex Buddy。侧边栏名字是「小红书增长引擎」，图标是仓库根上的 `icon.png`。

开发、或 `config.dev.json` 挂进来时，`ctx.dirs.data` 就是本仓：笔记写在 `output/one-post/posts/`，用户自学图册写在 `runtime/albums/`（一册一夹），用户参考图角色包写在 `runtime/image-refs/`，上传参考库写在 `runtime/materials/upload-refs/`，用户范文库写在 `runtime/materials/article-samples/`（整目录 `runtime/` gitignore）。从插件中心装进 Dex Buddy 之后，`ctx.dirs.data` 是用户数据目录 `plugin-data/app-dexbuddy-xiaohongshu-standard-editor/`，同样是 `output/…` 与上述 `runtime/` 分工。`assets/` 仍从安装目录读（出厂提示词与出厂图册）；启动时会把 assets 里序号 ≥ `100000` 的旧用户册迁到 `runtime/albums/`。

日常发版只走 [`docs/builtin-workflows/cut-release-tag.md`](../builtin-workflows/cut-release-tag.md)：`evo_agent_pack.json` 与 `plugin.manifest.json` 的 `version` 必须同号（`X.Y.Z`，不含 `v`），tag 为 `v` + 该号。插件中心只读清单；**禁止**只改一边。根上的 `dex-buddy-plugin.pack` 只列入清单、`index.js`、`icon.png`、`lib/`、`src/` 和 `assets/`。`scripts/`、测试、文档和 `.env` 不进这份 zip。这不是 `dex-buddy-plugin-pack.json`，仓库根上有那份旧文件时发布会失败。把仓库和这个 tag 告诉 Dex Buddy 维护者，由他在 Actions 里运行 Publish Plugin。

工作台登录后走宿主会话，设置页不再要模型钥匙。作者独立运行在仓库 `.env` 填 `DEX_BUDDY_API_KEY`（可选 `DEX_GATEWAY_BASE_URL`）。钥匙不进设置页，不进 zip。装进 Dex Buddy 后不读这把钥匙。

## 参数

| 参数 | 说明 |
|---|---|
| `--host` | 默认 `127.0.0.1`；不是 `127.0.0.1`、`localhost` 或 `::1` 就拒绝启动 |
| `--port` | 默认 `8768` |
| `--open` | 启动后打开浏览器 |
| 自动刷新 | 命令行启动时开启。只监听 `src/studio/static`，通过页面里的刷新脚本整页重载。测试里的 `startServer` 默认不开启 |

页上不填密钥。本机命令用仓库 `.env` 里的 `DEX_BUDDY_API_KEY`；可选 `DEX_GATEWAY_BASE_URL`（缺省 `https://www.dexbuddy.app`）。生文和识图共用 chat 渠道，空目录回退 `dexbuddy-chat`。封面默认 `dexbuddy/image-standard`，保真档 `dexbuddy/image-pro`。

## 日常步骤

1. 启动操作台，或在 Dex Buddy 侧栏打开「小红书增长引擎」。
2. 在「要发什么」里同一行人设与目的下拉（人设：素人 / KOC / 达人 / 官号 / 创始人 / 店主 / 员工，默认素人；目的：种草 / 引流 / 涨粉 / 曝光 / 搜索 / 转化，默认涨粉）。标签旁帮助可悬停；已选人设时目的推荐前缀 `★`。人设目的下是组合灰字（身份/语气/目标），再是「这篇想讲什么」。参考资料文档芯片最多 5；范文同行灰字说明，空时「从库挑 / 新建」（单框粘贴，首行标题），已选默认收起只读、操作仅「清除 / 换一篇」；封面之外还要几张 0–9。底栏「写成笔记」业务一句为空时禁用。封面那句话由模型写进封面提示词，材料里不再单填这一句。当前篇粘贴的范文写在该篇 `draft.json` 的 `sampleBody`；资料库可复用的范文另存 `runtime/materials/article-samples/`。成稿时有范文则提示词标「以下是参考文章」，要求不要复述原文结构、抓住重点仿写；参考资料管事实，与范文分开。旧稿 `articleType=素人` 读时迁成目的「涨粉」+ 人设「素人」。
3. 点「写成笔记」。没说清楚、范文超过 8000 字、或参考资料超过 5 条时，错误写在字段旁，不发模型请求。
4. 左栏「资料库」是壳；资源 Tab 有「图库」「上传参考」与「范文」。「图库」管柜子：卡片墙与笔记页「图册风格」竖卡节奏一致；点开样图、名称、说明、题词，**没有**「按此风格重算提示词」。出厂册题词只读；用户册可改题词并「保存」回 `runtime/albums/<id>/prompt.md`。点「增加」交一张本机参考图（JPEG / PNG / WebP，≤8MB），系统用宿主 chat 渠道识图学成草稿；草稿里单一白底副文本框可直接改文案，`#hex` 后行内色块可吸色（十字中心取样），再点「确定写入」落盘到 `runtime/albums/<id>/`（一册一夹：`album.json` / `prompt.md` / `copy-sample.md` / `sample.*`），点「放弃」或学习失败则目录不变。学习系统提示在 `assets/prompts/one-post/learn-album/system.md`，每次学习现读，改完保存即可，不必改 JS。学图按参考图的字形、配色、元素和位置写入 11 槽（题词结构 v2）；操作台可编辑的绘图题词只含 11 槽正文。发模型前程序再看有无图册样图：有则按 `input_images` 顺序拼「第一张是版式模板…」等说明并上传样图（说明来自出厂 `article-image/image-refs.md` 与 `runtime/image-refs/*.md` 合并，见下「参考图说明分层」）；其后按**该槽勾选**的上传参考（勾选序）接上，提示词「第 N 张是」后接该条用法句，并追加「不得因版式模板忽略上传参考」硬约束；缺文件则生图失败；**不**自动拼主体空位长文；纯文字册另拼禁插画句（约束模型画法）。上传参考的用法句由用户自写，**不**因用法句硬拦勾选或生图。版式说明与禁插画句都不进可编辑题词。出图仍是竖版 3:4。自加图册可二次确认后删除；序号 `000001`～`099999` 系统预留（当前出厂五本在 assets）无删除入口；用户新学写入的图册从 `100000` 起递增，只写 `runtime/albums/`（gitignore），勿提交发版。「上传参考」Tab 浏览 `runtime/materials/upload-refs/`：方块网格只图不叠用法长句；点卡左图右用法浮层（标题固定「上传参考」）；可二次确认删除。「范文」Tab 浏览 `runtime/materials/article-samples/`：列表看标题与预览，可新建 / 改 / 删（页内确认）。「新建」菜单含「上传参考」与「范文」：上传参考选本机图（JPEG / PNG / WebP，≤8MB）后浮层写用法句，可「识图起草」（`material-usage/system.md`）再「确认入库」；范文浮层填标题与正文后入库；都不依赖某篇笔记；笔记「存进库」仍可用。篇内「上传」路径不自动识图。
5. 笔记出来后停在「这篇笔记」。左边浅灰工具卡自上而下：`图片 n/m`（右侧「显示文件」）+ 小图条与历史版本 → 「图册风格」→ 「这张的提示词」（默认收起）→ 「上传参考图」`勾选数/9`（篇内可囤最多 48 张 JPEG / PNG / WebP，单张 ≤8MB；**当前张**最多勾 9 张进生图；`auto-fill` 网格换行；末尾 `+` 选从库挑或上传；点方块勾到当前张，默认新图勾全槽但跳过已满 9 的槽；悬停看用法；「笔」改用法；已入库不显示「存进库」）。「要发什么」不选风格，首轮写成笔记仍随机抽册。改上传参考、勾选或用法不重写文案、不废提示词、不覆盖已生成图。再下面是标题和正文，都可以改，没有输入框。字数按小红书计：半角两个算一个字，全角算一个字。标题超过 20 字、正文超过 1000 字时计数变红，文字仍留着；成稿不因标题超长失败，由用户自删。话题写在正文末尾，一起算进这 1000 字。正文框跟着全文增高，框里不滚动。图片和文案的上下间距固定。「复制这篇」固定在页面最下面。右边是手机。笔记预览里多于一张时，图下的点用来切换；至少有一张已经生成，鼠标停在手机上才出现左右箭头。封面预览是发现页：顶栏和底栏是整图，这篇封面在左列第一张，旁边是比例错开的空卡。要改张数，回到「要发什么」改完再点「写成笔记」，整篇重写。改标题或正文不会删掉已经生成的图。
6. 每一张单独生成。小图右下角是刷新图标钮；再抽追加一张，不覆盖旧图。选中某一张后，下面一排是它的历史，标着 1、2、3。点哪张，哪张成为选用图，不重新生图。生成中角上图标会转，当前选用的图还留在画面上。提示词默认收起，展开才可改；还没有这张的提示词时不能抽。提示词目录用英文路径（`article/shell.md`、`article/article-voices/`、`article/article-types/`、`article/article-rules/`、`article-image/`（含 `lines/`、`scenes.md`、`tone.md`、`image-refs.md`、`subject-slot.md`）、`albums/`、`learn-album/`、`material-usage/`；`subject-slot.md` 可留档但不进默认拼装）。成稿走宿主 chat：`system`（角色/人设块/目的骨架/版式/emoji 规则）+ `user`（范文与新内容）。人设与目的分轴单选；人设七种、目的六种（提示词块在 article-voices / article-types）；写文案时代码在 `process` 与 `contrast` 里随机抽一种；绘图时代码合并扫描出厂 `assets/.../albums/<id>/album.json` 与 `runtime/albums/<id>/album.json`，首轮随机抽一本，笔记页可指定 `look` 重算；图册 ID 形如 `000001.magazine.dazibao`（`{序号}.{kind}.{slug}`，kind 决定文案 layout；出厂用小号，自加从 `100000` 起）。出厂与用户均为一册一夹：`album.json`（hint / label / copySchema / legacyIds / constraints / promptSheetVersion 等元数据）、`prompt.md`（绘图题词）、`copy-sample.md`（策划 few-shot）、`sample.*`（样图）。同 kind 加册只加这一夹；**新 kind** 确认写入后走通用槽（按 `copySchema` 与题词 `{{占位符}}` 装填），不必再为每种改 JS；出厂五种的 `frame` / `render` 分支保持不动。题词写死画幅句、1～10 规格槽与 `11. 主题绘画内容`（题词结构 v2，JSON 字段 `promptSheetVersion: 2`；已去掉旧「系列统一规则」槽）以及该册的**文字绘画方式 / layout**，并各自固定一套配色以便辨认；`infographic` 的模块/步骤条数上下限写在 JSON `constraints` 里。模型只写第 11 项「主题绘画内容」。生图时有样图则 Files 上传进 `input_images` 第一张（`template`），其后按该槽勾选上传参考顺序接上；提示词「第 N 张是」与 `input_images` 同序并带硬约束；上传参考说明用人写的用法句，不写回 `article-image/image-refs.md`。`000001`～`000005` 均已有样图。旧稿里的短名 look（如 `magazine`）打开时按 JSON `legacyIds` 映射到新 ID。文字绘画方式不另抽，跟图册绑定。同一次生图不改口；再次写成笔记或重算提示词才重新抽。写成笔记、张数变少，也不删已经生成的图。语气只装填，不单独请求模型。展开提示词后可「显示文件」：本机用访达，工作台用宿主的显示文件。
7. 长任务先返回；点「写成笔记」立刻切到「这篇笔记」现成骨架（空图槽、空标题正文、手机框），浅灰工具卡上浮 Lottie，文案为「正在写这篇笔记 / 正在做封面」等；成稿未回也出这套卡，不留「笔记还在写」一行字。「要发什么」表单上的等待层仍可用于其它长任务。刷新后是空白新稿。「以前的笔记」是竖卡墙（宽屏约 8 列、3:4 封面、标题与时间在封面下）：点卡弹出左图右文详情浮层（可翻图、显示文件、复制、编辑），有图可显示文件（按篇打开访达，不进编辑）；编辑才进写一篇笔记；悬停封面右下角也可复制整篇。生图还没结束时刷新，仍停在这一篇。

## 参考图说明分层

生图参考图角色说明分两层，按 `## role` 小节合并；**同名 role 以用户包为准**。本轮 `references` 里没有的 role 不写进提示词；缺说明则报错「参考图角色 xxx 没有说明」。

| 层 | 路径 | 放什么 |
|---|---|---|
| 出厂 | `assets/prompts/one-post/article-image/image-refs.md` | 仅跨用户通用：`template`（版式锁）、`logo`（标识锁）。**不要**再往这里堆课程图 / 软硬件等产品细分 |
| 用户 | `{dataDir}/runtime/image-refs/<pack-id>.md` | 场景相关角色包（如 `course-shot`、`software-ui`） |

以后「学参考图角色」的产物形态（本轮未接 UI / 学习流水线）：一份 `<pack-id>.md`，内含一个或多个 `## <role>`（英文 token，如 `course-shot`）+ 短说明正文，**不含**「第 N 张」前缀；发模型时仍由代码按 `input_images` 下标拼「第 N 张是…」+ 该段正文。目录空或不存在时只用出厂，行为与只有 `template` 样图时一致。

## 产物

- `output/one-post/posts/index.json`
- `output/one-post/posts/<年月日-时分秒>/draft.json`
- 同目录的 `cover-1.png`、`cover-2.png`……封面这个位置的历史。旧稿里的 `cover.png` 仍算第 1 张
- 同目录的 `gallery-01-1.png`、`gallery-01-2.png`……每个配图位置各自一份历史
- `runtime/albums/`：用户自学图册（与笔记 `output/` 分工，不互相嵌套）
- `runtime/image-refs/`：用户参考图角色说明包（与图册四件套分开；gitignore）
- `runtime/materials/upload-refs/`：账号级上传参考库（文件 + 用法句；gitignore）
- `runtime/materials/article-samples/`：账号级范文库（每条一夹 `meta.json`：标题 + 正文；gitignore）
- 笔记目录下 `materials/upload-refs/`：这篇上传或从库挑来的参考文件；清单与按张勾选写在同篇 `draft.json` 的 `uploadRefs` / `picks`（新上传默认勾进全部槽）
- 同篇 `draft.json` 的 `sampleBody` / `sampleTitle` / `references`：这篇粘贴的范文快照与参考资料（旧字段 `article` 读时迁入 `sampleBody`）

本机命令写在仓库里。装进 Dex Buddy 之后笔记在 `plugin-data/app-dexbuddy-xiaohongshu-standard-editor/output/one-post/posts/`，用户图册、参考图角色包、上传参考库与范文库在同 data 下的 `runtime/albums/`、`runtime/image-refs/`、`runtime/materials/upload-refs/`、`runtime/materials/article-samples/`。仓库里如果还有旧的 `output/one-post/latest/`，第一次打开会抄进历史并删掉那个目录。

## 失败排查

| 现象 | 处理 |
|---|---|
| 拒绝非本机绑定 | `--host` 只用 `127.0.0.1`、`localhost` 或 `::1` |
| 生成按钮不可用 | 用本机命令打开 `http://127.0.0.1:8768/`，或在 Dex Buddy 工作台里打开 |
| 先用一句话说你要发什么 | 这篇想讲什么去掉空白后不能是空的 |
| 缺少 DEX_BUDDY_API_KEY | 本机写入 `.env`。已有稿面保留 |
| 未登录或会话失效 | 写成笔记和刷图时看工作台登录弹框，任务不开始，页面不写这句。登完后再点同一按钮。重算提示词或学习图册仍可能把这句写进稿面错误 |
| 当前账号未开通这个插件 | 写成笔记和刷图时看工作台购买弹框，任务不开始，页面不写这句。买完后再点同一按钮。重算提示词或学习图册仍可能把这句写进稿面错误 |
| 积分不足 | 充值后再试。已有稿面和提示词保留 |
| 文章目的 / 人设不在允许列表 | 写成笔记前就拒绝，不调用模型。目的：种草、引流、涨粉、曝光、搜索、转化；人设：素人、KOC、达人、官号、创始人、店主、员工 |
| 故事类型或图册不在允许列表 | 提示词这一步停住，标题、正文、话题还在，不开始生图。回到「要发什么」，再点「写成笔记」 |
| 学习失败 / 参考图不合格 | 资料库「图库」Tab 停在选择或卡片墙，人话错误可见；`runtime/albums/` 与出厂 `assets/.../albums|samples` 文件集合不变。可换图再试 |
| 保存题词失败 / 出厂不能改 | 用户册须保留 11 槽（v2）与占位符；出厂详情无保存。接口会拒绝改 assets |
| 出厂图册不能删除 | 出厂五本无删除按钮；接口也会拒绝 |
| 这本图册正在用于生成 | 等当前笔记的提示词或生图这一轮结束再删 |
| 找不到提示词文件 | 同上。不把这次没写完的头图或系列提示词写成成功结果 |
| 这一张的画面是空的 | 同上。每一张都要写出第 11 项画什么 |
| 绘图提示词缺了一槽 / 槽序不对 | 同上。图册须 `promptSheetVersion: 2`，含 1～10 与 `11. 主题绘画内容`，不得含「系列统一规则」 |
| 封面那句话是空的 / 策划字段不完整 | 策划没按该图册写出必填文案字段。回到「要发什么」，再点「写成笔记」 |
| 还没有这一张的提示词 | 这一张先不要抽。等提示词出来，或把提示词写进框里 |
| 要指明封面或配图序号 | 一次只生成一张，先选定封面或某一张配图 |
| 生图失败 / 积分不足 | 稿面和提示词保留，可以再抽这一张 |
| 正在生成，请等这一轮结束 | 等这一轮结束，或重启操作台后再看最近一篇 |

## 测试

```bash
pnpm check
```

等价于先 `pnpm run check:types`（`tsc --noEmit`），再 `pnpm test`（`node --test tests/**/*.test.js`）。
