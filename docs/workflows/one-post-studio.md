# 一篇图文操作台

同一张页面有两种入口。在 Dex Buddy 里，按钮走 `window.dex.call`。用本机命令打开时，按钮走 `POST /api/one-post/<方法>`。成稿、提示词和生图仍是 `src/one-post`，操作台不另写一套业务。

## 入口

```bash
cd /Users/peng.zhi/Documents/Codex/0007-小红书增长引擎
node scripts/run-studio.js --open
```

浏览器打开 `http://127.0.0.1:8768/`。只绑定本机。

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

开发、或 `config.dev.json` 挂进来时，`ctx.dirs.data` 就是本仓，笔记写在 `output/one-post/posts/`。从插件中心装进 Dex Buddy 之后，`ctx.dirs.data` 是用户数据目录 `plugin-data/xhs-growth-engine/`。`assets/` 仍从安装目录读。

插件中心发版只改 `plugin.manifest.json` 的 `version`（`X.Y.Z`，不要前导 0），提交并推送，再打 tag `vX.Y.Z` 并推送。`v` 后面必须和清单版本相同。根上的 `dex-buddy-plugin.pack` 只列入清单、`index.js`、`icon.png`、`src/` 和 `assets/`。`scripts/`、测试、文档和 `.env` 不进这份 zip。这不是 `dex-buddy-plugin-pack.json`，仓库根上有那份旧文件时发布会失败。把仓库和这个 tag 告诉 Dex Buddy 维护者，由他在 Actions 里运行 Publish Plugin。

在 Dex Buddy 里从侧栏底部「设置」选「小红书增长引擎」。文案一组填 DeepSeek 密钥、接口地址和模型，生图一组填 Replicate 令牌，然后点「保存」。仓库里的 `.env` 只给本机命令行用，不进 zip。工作台注入的值优先，`.env` 只补空位。

## 参数

| 参数 | 说明 |
|---|---|
| `--host` | 默认 `127.0.0.1`；不是 `127.0.0.1`、`localhost` 或 `::1` 就拒绝启动 |
| `--port` | 默认 `8768` |
| `--open` | 启动后打开浏览器 |

页上不填密钥。本机命令用仓库 `.env` 里的 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL` 和 `REPLICATE_API_TOKEN`。缺省地址是 `https://api.deepseek.com`，缺省模型是 `deepseek-chat`。

## 日常步骤

1. 启动操作台，或在 Dex Buddy 侧栏打开「小红书增长引擎」。
2. 在「这篇想讲什么」里用一句话说这篇。原文可贴可不贴。封面之外还要几张图，0 到 9，默认 1。
3. 点「写成笔记」。没说清楚或原文超过 8000 字时，错误写在字段旁，不发模型请求。
4. 笔记出现后可以改字、复制整篇。标题、正文、话题或张数变了，画面标成待重算，先点「让画面跟上」。
5. 点「做出封面和配图」。封面是一张 3:4 PNG，配图按张数生成。失败的一张可以单独重试。成功的图可以「显示文件」：本机用访达，工作台用宿主的显示文件。
6. 长任务先返回，页面把服务器步骤说成「正在写这篇笔记 / 正在让画面跟上 / 正在做封面」。刷新后是空白新稿。「以前的笔记」里能打开或复制刚才那篇。生图还没结束时刷新，仍停在这一篇。

## 产物

- `output/one-post/posts/index.json`
- `output/one-post/posts/<年月日-时分秒>/draft.json`
- 同目录的 `cover.png`
- 同目录的 `gallery-01.png` 到 `gallery-09.png`（有配图时）

本机命令写在仓库里。装进 Dex Buddy 之后写在 `plugin-data/xhs-growth-engine/output/one-post/posts/`。仓库里如果还有旧的 `output/one-post/latest/`，第一次打开会抄进历史并删掉那个目录。

## 失败排查

| 现象 | 处理 |
|---|---|
| 拒绝非本机绑定 | `--host` 只用 `127.0.0.1`、`localhost` 或 `::1` |
| 生成按钮不可用 | 用本机命令打开 `http://127.0.0.1:8768/`，或在 Dex Buddy 工作台里打开 |
| 先用一句话说你要发什么 | 这篇想讲什么去掉空白后不能是空的 |
| 缺少 DEEPSEEK_API_KEY | 本机写入 `.env`；工作台写入设置。已有稿面保留 |
| 缺少 REPLICATE_API_TOKEN | 同上。稿面和提示词保留，可以只重试失败的那一张 |
| 正在生成，请等这一轮结束 | 等这一轮结束，或重启操作台后再看最近一篇 |

## 测试

```bash
node --test tests/**/*.test.js
```
