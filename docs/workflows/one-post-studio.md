# 一篇图文操作台

同一张页面有两种入口。在 Dex Buddy 里，按钮走 `window.dex.call`。用本机命令打开时，按钮走 `POST /api/one-post/<方法>`。成稿、提示词和生图仍是 `src/one-post`，操作台不另写一套业务。

## 入口

```bash
cd /Users/peng.zhi/Documents/Codex/0007-小红书增长引擎
node scripts/run-studio.js --open
```

浏览器打开 `http://127.0.0.1:8768/`。只绑定本机。改 `src/studio/static` 里的 HTML、JS 或 CSS 后，已打开的页面会自动刷新。改 `src/one-post` 或 `scripts/run-studio.js` 需要重新运行这条命令。

同一套页面也可以作为 Dex Buddy 插件打开。仓库根上的 `plugin.manifest.json` 指向 `index.js` 和这份页面。插件里优先走 `window.dex.call`。既不在工作台、也不是这条本机命令打开时，生成按钮不可用，并说明要在工作台或本机操作台里打开。

开发时不要把源码拷进 Dex Buddy 的 `plugins/`。**打包版 Dex Buddy**：打开插件页 → 加号 →「加载本地目录」，选本仓根（里面直接有 `plugin.manifest.json`）。登记写在用户数据的 `unpacked-plugins.json`，重启还在。本地实例 id 是 `dev-` + 路径哈希，不是清单 `id`；设置、`plugin-data` 和页面调用都按实例 id。改完 `index.js`、它 require 的子文件或页面后，在插件详情「…」或工作区标题栏点重新加载即可，不必退出。详情里也可按发布预览（与插件中心同一套文件规则，仍用这份实例的设置）。移除只取消登记并删该实例下的宿主数据，源码还在磁盘上。侧边栏名字是「小红书增长引擎」，图标是仓库根上的 `icon.png`。

**未打包的 Dex Buddy 维护者**才用仓库根 `config.dev.json` 的 `extraPluginPaths`（从 `config.dev.example.json` 复制），或把本仓软链进 `plugins/`；打包后的应用不读 `extraPluginPaths`。界面里没有「移除」这些路径。

本地目录挂进来时，`ctx.dirs.data` 就是本仓、`ctx.dirs.cache` 是仓库 `cache/`：笔记写在 `output/one-post/posts/`，用户自学图册写在 `runtime/albums/`（一册一夹），用户参考图角色包写在 `runtime/image-refs/`，我们的图库写在 `runtime/materials/upload-refs/`，用户对标文案库写在 `runtime/materials/article-samples/`，产品资料库写在 `runtime/materials/reference-docs/`（整目录 `runtime/` gitignore），对标笔记原始快照写在 `cache/xhs-notes/`。从插件中心装进 Dex Buddy 之后，`ctx.dirs.data` 是用户数据目录 `plugin-data/app-dexbuddy-xiaohongshu-standard-editor/`，同样是 `output/…` 与上述 `runtime/` 分工；可重建的对标笔记快照写在 `ctx.dirs.cache`（`plugin-runtime/app-dexbuddy-xiaohongshu-standard-editor/cache/xhs-notes/`），不要写进 `plugin-data`。`assets/` 仍从安装目录读（出厂提示词与出厂图册）；启动时会把 assets 里序号 ≥ `100000` 的旧用户册迁到 `runtime/albums/`。

日常发版只走 [`docs/builtin-workflows/cut-release-tag.md`](../builtin-workflows/cut-release-tag.md)：`evo_agent_pack.json` 与 `plugin.manifest.json` 的 `version` 必须同号（`X.Y.Z`，不含 `v`），tag 为 `v` + 该号。插件中心只读清单；**禁止**只改一边。根上的 `dex-buddy-plugin.pack` 只列入清单、`index.js`、`icon.png`、`lib/`、`src/` 和 `assets/`（`lib/` 含接口层与独立跑实现）。可选再放 `dex-buddy-plugin.ignore` 从候选里挖掉路径。`scripts/`、测试、文档和 `.env` 不进这份 zip。这不是 `dex-buddy-plugin-pack.json`，仓库根上有那份旧文件时发布会失败。把仓库和这个 tag 告诉 Dex Buddy 维护者，由他在 Actions 里运行 Publish Plugin。

模型助手：`lib/dex-buddy-sdk.js` 是接口层（当前母版 `SDK_VERSION` `1.0.4`，含 `navigate` 导出）；工作台走宿主 `ctx.models`。本机 `node scripts/run-studio.js` 无宿主时，同目录还要有 `lib/dex-buddy-standalone.js`（`STANDALONE_VERSION` `1.0.3`；`bindModels` 会懒加载）。工作台登录后走宿主会话，本插件无 `configSchema`、不另开设置页，因此不调用 `navigate` / `window.dex.navigate`。作者独立运行在仓库 `.env` 填 `DEX_BUDDY_API_KEY`（可选 `DEX_GATEWAY_BASE_URL`）；本仓自己读 `.env`，SDK 不读。钥匙不进设置页，不进 zip。装进 Dex Buddy 后不读这把钥匙。

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
2. 在「要发什么」里同一行人设与目的下拉（人设：素人 / KOC / 达人 / 官号 / 创始人 / 店主 / 员工，默认素人；目的：种草 / 引流 / 涨粉 / 曝光 / 搜索 / 转化，默认涨粉）。已选人设时目的推荐前缀 `★`；无人设/目的旁帮助，无组合灰字。再是「这篇想讲什么」。产品资料文档方块最多 5（满额隐藏 `+`）：点 `+` 时若库里还有未加进这篇的条目，先出卡墙选库（可滚、底叠名称、可看预览），底部「新建产品资料」再写新；库空或无可选则直接写新（第一行名称、其余正文；保存并快照）；同篇正文全等不可再加；点方块只改这篇快照、不写回库；旧稿 `references: string[]` 读成无名称条目。对标文案无旁灰字说明，空时「从库挑 / 新建」（单框粘贴，首行标题），已选默认收起只读、操作仅「清除 / 换一篇」；笔记内图数量 0–9（不含封面）。底栏「写成笔记」业务一句为空时禁用。封面那句话由模型写进封面提示词，材料里不再单填这一句。当前篇粘贴的对标文案写在该篇 `draft.json` 的 `sampleBody`；资料库可复用的对标文案另存 `runtime/materials/article-samples/`，产品资料另存 `runtime/materials/reference-docs/`。成稿时有对标文案则模型提示词标「以下是参考文章」，要求不要复述原文结构、抓住重点仿写；产品资料管事实，有名称时拼「名称：正文」，与对标文案分开。旧稿 `articleType=素人` 读时迁成目的「涨粉」+ 人设「素人」。
3. 点「写成笔记」。没说清楚、对标文案超过 8000 字、或产品资料超过 5 条时，错误写在字段旁，不发模型请求。
4. 左栏「资料库」是壳；资源 Tab 有「风格」「我们的图」「对标文案」与「产品资料」。「风格」管柜子：卡片墙与笔记页「风格」竖卡节奏一致；点开样图、名称、说明、怎么画，**没有**「按此风格重算」。出厂册怎么画只读；用户册可改怎么画并「保存」回 `runtime/albums/<id>/prompt.md`。点「新建 → 风格」先出虚线上传框（拖入、Ctrl+V / ⌘V 粘贴、或点击从本机选一张 JPEG / PNG / WebP / BMP，≤8MB；JPEG 别名大小写可用；一次一张），合格后先用标准档短提示对样图做生图探针：过审才用宿主 chat 识图学成草稿；`CONTENT_FLAGGED` 则仍落盘样图册（`safetyStatus: flagged`，资料库红盾脚标），不学提示词；写笔记第二页风格列表不出现该册。探针通过后进草稿前按 `assets/prompts/one-post/image-safety/rewrites.json` 把已知不宜说法改成普通说法，草稿「怎么画」上方可显示「已改写：…」，屏幕上的字就是将要保存的全文；保存时 `album.json` 写 `safetyStatus: passed`（青绿盾牌勾）。历史册无该字段视为通过并显示绿盾，不迁移 album.json。草稿里单一白底副文本框可直接改文案，`#hex` 后行内色块可吸色（十字中心取样），再点「保存」落盘到 `runtime/albums/<id>/`（一册一夹：`album.json` / `prompt.md` / `copy-sample.md` / `sample.*`），点「放弃」或学习失败则目录不变。学习系统提示在 `assets/prompts/one-post/learn-album/system.md`，每次学习现读，改完保存即可，不必改 JS。学图按参考图的字形、配色、元素和位置写入 11 槽（题词结构 v2）；操作台可编辑的绘图题词只含 11 槽正文。发模型前程序再看有无图册样图：有则按 `input_images` 顺序拼「第一张是版式模板…」等说明并上传样图（说明来自出厂 `article-image/image-refs.md` 与 `runtime/image-refs/*.md` 合并，见下「参考图说明分层」）；其后按**该槽勾选**的我们的图（勾选序）接上，提示词「第 N 张是」后接该条图片用法，并追加「不得因版式模板忽略上传参考」硬约束（模型侧仍用工程用语）；缺文件则生图失败；**不**自动拼主体空位长文；纯文字册另拼禁插画句（约束模型画法）。我们的图的图片用法由用户自写，**不**因图片用法硬拦勾选或生图。版式说明与禁插画句都不进可编辑题词。出图比例七档可选（一篇一个）；未点比例芯片跟图册归档比例，点过后锁定；发模型前程序覆盖画幅句。自加图册可二次确认后删除；序号 `000001`～`099999` 系统预留（当前出厂五本在 assets）无删除入口；用户新学写入的图册从 `100000` 起递增，只写 `runtime/albums/`（gitignore），勿提交发版。「我们的图」Tab 浏览 `runtime/materials/upload-refs/`：方块网格只图不叠图片用法长句；点卡左图右图片用法浮层（标题固定「我们的图」）；可二次确认删除。「对标文案」Tab 浏览 `runtime/materials/article-samples/`：列表看标题与预览，可新建 / 改 / 删（页内确认）。「产品资料」Tab 浏览 `runtime/materials/reference-docs/`：竖卡墙同对标文案节奏，单框粘贴（第一行名称），可新建 / 改 / 删（页内确认）；删库后这篇里已经加过的，不受影响。「新建」菜单含「风格」「我们的图」「对标文案」「产品资料」「对标笔记」：我们的图先出虚线上传框（拖入、粘贴或点击选一张 JPEG / PNG / WebP / BMP，≤8MB）后浮层写图片用法，可「自动识别」（`material-usage/system.md`）再「保存」；对标文案浮层填标题与正文后入库；产品资料浮层填名称与正文后入库；「对标笔记」粘贴 explore / xhslink，经本机 Native Host 侧通道（`scripts/dexbuddy-native-host.js`，默认 `127.0.0.1:18769`，可用 `DEX_BUDDY_NATIVE_BRIDGE_PORT`）调内部特供版 `fetchNote`；解析后的链接写入 `runtime/materials/xhs-notes/`（收过没有只比链接全等）；勾选文案 / 封面 / 一张后面的图后，正文进对标文案库，图串行走现有学图草稿；学完可「用这篇去写」打开要发什么并带上该对标文案。都不依赖某篇笔记；笔记「保存到资料库」仍可用。篇内「上传」路径不自动识别。取料须本机 Chrome 已登录小红书，且扩展已打开「允许 Dex Buddy 连接」。Host 清单由本仓在操作台启动 / Dex Buddy `apply()` 时**静默写入**（默认扩展 ID `andhfibibleajbnnpbnfdmngmhkoeldj`，Host name `com.zhiying.dexbuddy.host`）；用户不必手装。开发排查见 [`docs/faqs/how-to-native-host-silent-register.md`](../faqs/how-to-native-host-silent-register.md)。
5. 笔记出来后停在「这篇笔记」。左边浅灰工具卡自上而下：`图片 n/m`（右侧「打开文件」）→ 七档生图比例芯片（一篇共用）→ 小图条与历史版本 → 「风格」→ 「画面内容」（默认收起，未套词时不可展开）→ 「我们的图」`勾选数/9`（篇内最多 48 张 JPEG / PNG / WebP / BMP，单张 ≤8MB；**当前张**最多勾 9 张进生图；`auto-fill` 网格换行；末尾 `+` 选从库挑或上传；点方块勾到当前张，默认新图勾全槽但跳过已满 9 的槽；悬停看预览；「笔」改图片用法；已入库不显示「保存到资料库」）。「要发什么」不选风格。写成笔记只出标题、正文、话题，不跑画面策划、不生图；点风格卡只换描边，点刷新才套画面内容并画当前张。没选风格则沿用已套用的图册，还没有则随机抽一本。画面内容框只展示可改段（第 11 槽与画面上的文案）。改我们的图、勾选或图片用法不重写文案、不废画面内容、不覆盖已生成图。再下面是标题和正文，都可以改，没有输入框。字数按小红书计：半角两个算一个字，全角算一个字。标题超过 20 字、正文超过 1000 字时计数变红，文字仍留着；成稿不因标题超长失败，由用户自删。话题写在正文末尾，一起算进这 1000 字。正文框跟着全文增高，框里不滚动。图片和文案的上下间距固定。「复制这篇」固定在页面最下面。右边是手机。笔记预览里多于一张时，图下的点用来切换；至少有一张已经生成，鼠标停在手机上才出现左右箭头。封面预览是发现页：顶栏和底栏是整图，这篇封面在左列第一张，旁边是比例错开的空卡。要改张数，回到「要发什么」改完再点「写成笔记」，整篇重写。改标题或正文不会删掉已经生成的图。
6. 每一张单独生成。小图右下角是刷新图标钮；再画一张追加，不覆盖旧图。选中某一张后，下面一排是它的历史，标着 1、2、3。点哪张，哪张成为选用图，不重新生图。生成中角上图标会转，当前选用的图还留在画面上。画面内容默认收起，展开后只改可改段；空画面内容也可以点刷新，由刷新先给整套定画面再画当前张。整套已套词且这一张被改空时才不能画。提示词目录用英文路径（`article/shell.md`、`article/article-voices/`、`article/article-types/`、`article/article-rules/`、`article-image/`（含 `lines/`、`scenes.md`、`tone.md`、`image-refs.md`、`subject-slot.md`）、`albums/`、`learn-album/`、`material-usage/`；`subject-slot.md` 可留档但不进默认拼装）。成稿走宿主 chat：`system`（角色/人设块/目的骨架/版式/emoji 规则）+ `user`（范文与新内容）。人设与目的分轴单选；人设七种、目的六种（提示词块在 article-voices / article-types）；写文案时代码在 `process` 与 `contrast` 里随机抽一种；绘图时代码合并扫描出厂 `assets/.../albums/<id>/album.json` 与 `runtime/albums/<id>/album.json`，点刷新时若尚未套词则随机抽一本或用已选中的 `look`；同风格且稿面未改不再调策划模型；换册且文案结构对得上则本地重套 1–10 槽；图册 ID 形如 `000001.magazine.dazibao`（`{序号}.{kind}.{slug}`，kind 决定文案 layout；出厂用小号，自加从 `100000` 起）。出厂与用户均为一册一夹：`album.json`（hint / label / copySchema / legacyIds / constraints / promptSheetVersion 等元数据）、`prompt.md`（绘图题词）、`copy-sample.md`（策划 few-shot）、`sample.*`（样图）。同 kind 加册只加这一夹；**新 kind** 确认写入后走通用槽（按 `copySchema` 与题词 `{{占位符}}` 装填），不必再为每种改 JS；出厂五种的 `frame` / `render` 分支保持不动。题词写死画幅句、1～10 规格槽与 `11. 主题绘画内容`（题词结构 v2，JSON 字段 `promptSheetVersion: 2`；已去掉旧「系列统一规则」槽）以及该册的**文字绘画方式 / layout**，并各自固定一套配色以便辨认；`infographic` 的模块/步骤条数上下限写在 JSON `constraints` 里。模型只写第 11 项「主题绘画内容」。生图时有样图则 Files 上传进 `input_images` 第一张（`template`），其后按该槽勾选上传参考顺序接上；提示词「第 N 张是」与 `input_images` 同序并带硬约束；上传参考说明用人写的用法句，不写回 `article-image/image-refs.md`。拼好提示词后只按说法对照库检查、不改字；命中则停住并提示（见 [`image-prompt-safety.md`](./image-prompt-safety.md)），不写「生成中」、不调生图。`000001`～`000005` 均已有样图。旧稿里的短名 look（如 `magazine`）打开时按 JSON `legacyIds` 映射到新 ID。文字绘画方式不另抽，跟图册绑定。同一次生图不改口；再次写成笔记或重算提示词才重新抽。写成笔记、张数变少，也不删已经生成的图。语气只装填，不单独请求模型。画面内容展开后可「打开文件」：本机用访达，工作台用宿主的显示文件能力。
7. 长任务先返回；点「写成笔记」立刻切到「这篇笔记」现成骨架（空图槽、空标题正文、手机框），浅灰工具卡上浮 Lottie，文案为「正在写这篇笔记 / 正在定这一套图 / 正在用{图册名}画封面」等，出图路径不出现「写这篇笔记」；成稿未回也出这套卡，不留「笔记还在写」一行字。「要发什么」表单上的等待层仍可用于其它长任务。刷新后是空白新稿。「以前的笔记」是竖卡墙（宽屏约 8 列、3:4 封面、标题与时间在封面下）：点卡弹出左图右文详情浮层（可翻图、打开文件、复制、编辑），有图可打开文件（按篇打开访达，不进编辑）；编辑才进写笔记；悬停封面右下角也可复制整篇。生图还没结束时刷新，仍停在这一篇。

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
- `runtime/materials/upload-refs/`：账号级我们的图库（文件 + 图片用法；gitignore）
- `runtime/materials/article-samples/`：账号级对标文案库（每条一夹 `meta.json`：标题 + 正文；gitignore）
- `runtime/materials/reference-docs/`：账号级产品资料库（每条一夹 `meta.json`：名称 + 正文；gitignore）
- `runtime/materials/xhs-notes/`：对标笔记链接身份（每条一夹瘦 `meta.json`：`noteId` / `sourceUrl` / `inputUrls` / `learned` 双向引用；按笔记 ID 去重；gitignore；本期无浏览 Tab）
- `cache/xhs-notes/<noteId>/`：取料原始快照（`payload.json` + `images/*`；可清；同次学习优先用预览 dataUrl，避免二次拉 CDN）
- 笔记目录下 `materials/upload-refs/`：这篇上传或从库挑来的参考文件；清单与按张勾选写在同篇 `draft.json` 的 `uploadRefs` / `picks`（新上传默认勾进全部槽）
- 同篇 `draft.json` 的 `sampleBody` / `sampleTitle` / `references`：这篇粘贴的对标文案快照与产品资料快照（`{ name?, body }[]`；旧 `string[]` 读成无名称；旧字段 `article` 读时迁入 `sampleBody`）

本机命令写在仓库里。装进 Dex Buddy 之后笔记在 `plugin-data/app-dexbuddy-xiaohongshu-standard-editor/output/one-post/posts/`，用户图册、参考图角色包、我们的图库、对标文案库、产品资料库与对标笔记链接资源在同 data 下的 `runtime/albums/`、`runtime/image-refs/`、`runtime/materials/upload-refs/`、`runtime/materials/article-samples/`、`runtime/materials/reference-docs/`、`runtime/materials/xhs-notes/`，原始笔记缓存在 `plugin-runtime/app-dexbuddy-xiaohongshu-standard-editor/cache/xhs-notes/`（宿主 `ctx.dirs.cache`）。学成顺序：封面入库 → 后面的图入库 → 再写对标文案；对标文案 `meta.json` / 图册 `album.json` 可带 `source` 指回笔记，链接 `learned` 指回对标文案与图册。仓库里如果还有旧的 `output/one-post/latest/`，第一次打开会抄进历史并删掉那个目录。

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
| 学习失败 / 参考图不合格 | 资料库「风格」Tab 停在选择或卡片墙，人话错误可见；`runtime/albums/` 与出厂 `assets/.../albums|samples` 文件集合不变。可换图再试 |
| 连不上本机取料通道 / host not found / 扩展版本过低 | 进料弹层会先探测通道与扩展 ≥0.9.0，未通过则禁用粘贴；先启动操作台或加载插件（静默写清单），重载内部特供版，`lsof` 看 18769，打开「允许连接」。详见 faqs/how-to-native-host-silent-register |
| 这篇笔记已经收录过了 | 同一 `sourceUrl` 或曾用过的粘贴串不再取料、不再学；删掉学出的对标文案/风格后链接记录仍在 |
| 保存怎么画失败 / 出厂不能改 | 用户册须保留 11 槽（v2）与占位符；出厂详情无保存。接口会拒绝改 assets |
| 出厂图册不能删除 | 出厂五本无删除按钮；接口也会拒绝 |
| 这本图册正在用于生成 | 等当前笔记的提示词或生图这一轮结束再删 |
| 找不到提示词文件 | 同上。不把这次没写完的头图或系列提示词写成成功结果 |
| 这一张的画面是空的 | 同上。每一张都要写出第 11 项画什么 |
| 绘图提示词缺了一槽 / 槽序不对 | 同上。图册须 `promptSheetVersion: 2`，含 1～10 与 `11. 主题绘画内容`，不得含「系列统一规则」 |
| 封面那句话是空的 / 策划字段不完整 | 策划没按该图册 `copySchema` 写出必填上图字段（未标可空的必须非空，如外刊 `bodyCn`）。程序会再调一次策划；仍失败则提示词不落成，刷新可再点。不要从笔记正文摘句硬塞进提示词 |
| 还没有这一张的画面内容 | 整套已经套过词、这一张被改空时不能画。新篇空画面内容可以点刷新，会先定画面 |
| 要指明封面或配图序号 | 一次只生成一张，先选定封面或某一张配图 |
| 生图失败 / 积分不足 | 稿面和提示词保留。网络等失败后请再点一次**同槽取回**（同一 `idempotencyKey`，不重复扣费）；成图对象过期（`OUTPUT_EXPIRED`）会清 pending 并消耗该 gen，再点换新 `gen-{n}`。用户主动「再抽一张」也换新 gen。`CONTENT_FLAGGED`（内容未过安全审核）提示换画面说明或参考图，不清成「取回」、不复用同一 key |
| 学风格红盾 / 笔记不出现 | 探针未过审的风格仍在资料库（红盾），写笔记风格面板不展示；换一张图重新学，或删掉 flagged 册 |
| 正在生成，请等这一轮结束 | 等这一轮结束，或重启操作台后再看最近一篇 |

## 测试

```bash
pnpm check
```

等价于先 `pnpm run check:types`（`tsc --noEmit`），再 `pnpm test`（`node --test tests/**/*.test.js`）。
