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

开发、或 `config.dev.json` 挂进来时，`ctx.dirs.data` 就是本仓：笔记写在 `output/one-post/posts/`，用户自学图册写在 `runtime/albums/`，用户参考图角色包写在 `runtime/image-refs/`（整目录 `runtime/` gitignore）。从插件中心装进 Dex Buddy 之后，`ctx.dirs.data` 是用户数据目录 `plugin-data/xhs-growth-engine/`，同样是 `output/…` 与 `runtime/albums/`、`runtime/image-refs/` 分工。`assets/` 仍从安装目录读（出厂提示词与出厂图册）；启动时会把 assets 里序号 ≥ `100000` 的旧用户册迁到 `runtime/albums/`。

日常发版只走 [`docs/builtin-workflows/cut-release-tag.md`](../builtin-workflows/cut-release-tag.md)：`evo_agent_pack.json` 与 `plugin.manifest.json` 的 `version` 必须同号（`X.Y.Z`，不含 `v`），tag 为 `v` + 该号。插件中心只读清单；**禁止**只改一边。根上的 `dex-buddy-plugin.pack` 只列入清单、`index.js`、`icon.png`、`src/` 和 `assets/`。`scripts/`、测试、文档和 `.env` 不进这份 zip。这不是 `dex-buddy-plugin-pack.json`，仓库根上有那份旧文件时发布会失败。把仓库和这个 tag 告诉 Dex Buddy 维护者，由他在 Actions 里运行 Publish Plugin。

在 Dex Buddy 里从侧栏底部「设置」选「小红书增长引擎」。文案一组填 DeepSeek 密钥、接口地址和模型，生图一组填 Replicate 令牌，然后点「保存」。仓库里的 `.env` 只给本机命令行用，不进 zip。工作台注入的值优先，`.env` 只补空位。

## 参数

| 参数 | 说明 |
|---|---|
| `--host` | 默认 `127.0.0.1`；不是 `127.0.0.1`、`localhost` 或 `::1` 就拒绝启动 |
| `--port` | 默认 `8768` |
| `--open` | 启动后打开浏览器 |
| 自动刷新 | 命令行启动时开启。只监听 `src/studio/static`，通过页面里的刷新脚本整页重载。测试里的 `startServer` 默认不开启 |

页上不填密钥。本机命令用仓库 `.env` 里的 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`、`DEEPSEEK_VISION_MODEL` 和 `REPLICATE_API_TOKEN`。缺省地址是 `https://api.deepseek.com`，写稿缺省模型是 `deepseek-chat`，图库学习识图缺省是 `deepseek-flash`。

## 日常步骤

1. 启动操作台，或在 Dex Buddy 侧栏打开「小红书增长引擎」。
2. 在「这篇想讲什么」里用一句话说这篇。原文可贴可不贴。封面之外还要几张图，0 到 9，默认 1，只在「要发什么」里改。封面那句话由模型写进封面提示词，材料里不再单填这一句。
3. 点「写成笔记」。没说清楚或原文超过 8000 字时，错误写在字段旁，不发模型请求。
4. 左栏「资料库」是壳；第一个 Tab「图库」管柜子：卡片墙与笔记页「图册风格」竖卡节奏一致；点开只读样图、名称、说明、题词，**没有**「按此风格重算提示词」。点「增加」交一张本机参考图（JPEG / PNG / WebP，≤8MB），系统用识图模型（默认 `deepseek-flash`，可用 `DEEPSEEK_VISION_MODEL`）学习成只读草稿；点「确定写入」才落盘到 `runtime/albums/`（四件套：`<id>.json` / `.md` / `.copy-sample.md` 与 `samples/<id>.*`），点「放弃」或学习失败则目录不变。学习系统提示在 `assets/prompts/one-post/learn-album/system.md`，每次学习现读，改完保存即可，不必改 JS。学图按参考图的字形、配色、元素和位置写入 12 槽；操作台可编辑的绘图题词只含 12 槽正文。发模型前程序再看有无图册样图：有则按 `input_images` 顺序拼「第一张是版式模板…」等说明并上传样图（说明来自出厂 `image-refs.md` 与 `runtime/image-refs/*.md` 合并，见下「参考图说明分层」）；纯文字册另拼禁插画句。这两段都不进可编辑题词。出图仍是竖版 3:4。自加图册可二次确认后删除；序号 `000001`～`099999` 系统预留（当前出厂五本在 assets）无删除入口；用户新学写入的图册从 `100000` 起递增，只写 `runtime/albums/`（gitignore），勿提交发版。
5. 笔记出来后停在「这篇笔记」。左边浅灰工具卡顶部可展开「图册风格」：显示当前册（label）；展开是 6 列信息流竖卡（有样图铺底、无样图占位），点卡打开左样图右说明/图册题词浮层，再点「按此风格重算提示词」只重跑画册提示词、文案不动。「要发什么」不选风格，首轮写成笔记仍随机抽册。小图在风格条下面，再下面是标题和正文，都可以改，没有输入框。字数按小红书计：半角两个算一个字，全角算一个字。标题超过 20 字、正文超过 1000 字时计数变红，文字仍留着。话题写在正文末尾，一起算进这 1000 字。正文框跟着全文增高，框里不滚动。图片和文案的上下间距固定。「复制这篇」固定在页面最下面。右边是手机。笔记预览里多于一张时，图下的点用来切换；至少有一张已经生成，鼠标停在手机上才出现左右箭头。封面预览是发现页：顶栏和底栏是整图，这篇封面在左列第一张，旁边是比例错开的空卡。要改张数，回到「要发什么」改完再点「写成笔记」，整篇重写。改标题或正文不会删掉已经生成的图。
6. 每一张单独生成。小图右下角没图时是「生成这张」，已经生成过的是「再抽一张」。再抽追加一张，不覆盖旧图。点开这个位置，下面一排是它的历史，标着 1、2、3。点哪张，哪张成为选用图，不重新生图。生成中这枚图标会转，当前选用的图还留在画面上。点开这张图才看见提示词，可以改。还没有这张的提示词时不能抽。提示词目录用英文路径（`article/`、`lines/`、`scenes.md`、`albums/`、`tone.md`、`image-refs.md`、`learn-album/`）。写成笔记用种草、引流、素人三套骨架之一；写文案时代码在 `process` 与 `contrast` 里随机抽一种；绘图时代码合并扫描出厂 `assets/.../albums/*.json` 与 `runtime/albums/*.json`，首轮随机抽一本，笔记页可指定 `look` 重算；图册 ID 形如 `000001.magazine.dazibao`（`{序号}.{kind}.{slug}`，kind 决定文案 layout；出厂用小号，自加从 `100000` 起）。出厂每册三件套在 `assets/.../albums/`：`<id>.json`（hint / label / copySchema / legacyIds / constraints 等元数据）、`<id>.md`（绘图题词）、`<id>.copy-sample.md`（策划 few-shot）；用户册同结构落在 `runtime/albums/`。同 kind 加册只加这三件文件；**新 kind** 确认写入后走通用槽（按 `copySchema` 与题词 `{{占位符}}` 装填），不必再为每种改 JS；出厂五种的 `frame` / `render` 分支保持不动。题词写死画幅句、1～11（含系列统一规则）以及该册的**文字绘画方式 / layout**，并各自固定一套配色以便辨认；`infographic` 的模块/步骤条数上下限写在 JSON `constraints` 里。模型只写第 12 项「主题绘画内容」。每册另有样图（出厂在 `assets/.../samples/`，用户在 `runtime/albums/samples/`），给人看或选风格；生图时有样图则 Files 上传进 `input_images`，提示词用「第一张是…」点名（不进可编辑题词、不喂文案模型）；当前只挂图册样图为 `template` 角色；`000001`～`000005` 均已有样图。旧稿里的短名 look（如 `magazine`）打开时按 JSON `legacyIds` 映射到新 ID。文字绘画方式不另抽，跟图册绑定。同一次生图不改口；再次写成笔记或重算提示词才重新抽。写成笔记、张数变少，也不删已经生成的图。语气只装填，不单独请求模型。选用的图在提示词旁可以「显示文件」：本机用访达，工作台用宿主的显示文件。
7. 长任务先返回，页面把服务器步骤说成「正在写这篇笔记 / 正在做封面」。刷新后是空白新稿。「以前的笔记」里能打开或复制刚才那篇。生图还没结束时刷新，仍停在这一篇。

## 参考图说明分层

生图参考图角色说明分两层，按 `## role` 小节合并；**同名 role 以用户包为准**。本轮 `references` 里没有的 role 不写进提示词；缺说明则报错「参考图角色 xxx 没有说明」。

| 层 | 路径 | 放什么 |
|---|---|---|
| 出厂 | `assets/prompts/one-post/image-refs.md` | 仅跨用户通用：`template`（版式锁）、`logo`（标识锁）。**不要**再往这里堆课程图 / 软硬件等产品细分 |
| 用户 | `{dataDir}/runtime/image-refs/<pack-id>.md` | 场景相关角色包（如 `course-shot`、`software-ui`） |

以后「学参考图角色」的产物形态（本轮未接 UI / 学习流水线）：一份 `<pack-id>.md`，内含一个或多个 `## <role>`（英文 token，如 `course-shot`）+ 短说明正文，**不含**「第 N 张」前缀；发模型时仍由代码按 `input_images` 下标拼「第 N 张是…」+ 该段正文。目录空或不存在时只用出厂，行为与只有 `template` 样图时一致。

## 产物

- `output/one-post/posts/index.json`
- `output/one-post/posts/<年月日-时分秒>/draft.json`
- 同目录的 `cover-1.png`、`cover-2.png`……封面这个位置的历史。旧稿里的 `cover.png` 仍算第 1 张
- 同目录的 `gallery-01-1.png`、`gallery-01-2.png`……每个配图位置各自一份历史
- `runtime/albums/`：用户自学图册（与笔记 `output/` 分工，不互相嵌套）
- `runtime/image-refs/`：用户参考图角色说明包（与图册四件套分开；gitignore）

本机命令写在仓库里。装进 Dex Buddy 之后笔记在 `plugin-data/xhs-growth-engine/output/one-post/posts/`，用户图册与参考图角色包在同 data 下的 `runtime/albums/`、`runtime/image-refs/`。仓库里如果还有旧的 `output/one-post/latest/`，第一次打开会抄进历史并删掉那个目录。

## 失败排查

| 现象 | 处理 |
|---|---|
| 拒绝非本机绑定 | `--host` 只用 `127.0.0.1`、`localhost` 或 `::1` |
| 生成按钮不可用 | 用本机命令打开 `http://127.0.0.1:8768/`，或在 Dex Buddy 工作台里打开 |
| 先用一句话说你要发什么 | 这篇想讲什么去掉空白后不能是空的 |
| 缺少 DEEPSEEK_API_KEY | 本机写入 `.env`；工作台写入设置。已有稿面保留 |
| 文章类型不在允许列表 | 写成笔记前就拒绝，不调用模型。类型只能是种草、引流、素人 |
| 故事类型或图册不在允许列表 | 提示词这一步停住，标题、正文、话题还在，不开始生图。回到「要发什么」，再点「写成笔记」 |
| 学习失败 / 参考图不合格 | 资料库「图库」Tab 停在选择或卡片墙，人话错误可见；`runtime/albums/` 与出厂 `assets/.../albums|samples` 文件集合不变。可换图再试 |
| 出厂图册不能删除 | 出厂五本无删除按钮；接口也会拒绝 |
| 这本图册正在用于生成 | 等当前笔记的提示词或生图这一轮结束再删 |
| 找不到提示词文件 | 同上。不把这次没写完的头图或系列提示词写成成功结果 |
| 这一张的画面是空的 | 同上。每一张都要写出第 12 项画什么 |
| 绘图提示词缺了一槽 / 槽序不对 | 同上。图册须含 1～11 固定槽与 `12. 主题绘画内容`，且系列统一规则在主题绘画内容之前 |
| 封面那句话是空的 / 策划字段不完整 | 策划没按该图册写出必填文案字段。回到「要发什么」，再点「写成笔记」 |
| 还没有这一张的提示词 | 这一张先不要抽。等提示词出来，或把提示词写进框里 |
| 要指明封面或配图序号 | 一次只生成一张，先选定封面或某一张配图 |
| 缺少 REPLICATE_API_TOKEN | 同上。稿面和提示词保留，可以再抽这一张 |
| 正在生成，请等这一轮结束 | 等这一轮结束，或重启操作台后再看最近一篇 |

## 测试

```bash
pnpm check
```

等价于先 `pnpm run check:types`（`tsc --noEmit`），再 `pnpm test`（`node --test tests/**/*.test.js`）。
