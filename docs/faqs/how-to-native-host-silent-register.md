# 小红书取料：Native Host 静默注册与排查

## 结论

用户装 Dex Buddy 插件后**不必**再手装 Host。本仓在插件 `apply()` 与本机操作台启动时静默写入 Chrome Native Messaging 清单。

**本机即可联调**：Host 是 Chrome `connectNative` 拉起的**本机独立进程**，不必打开 Dex Buddy 窗口。

Chrome 扩展**不能**自己写系统清单；`Specified native messaging host not found` 表示本机还没有清单或扩展未重载。

Host 可执行脚本在仓库 [`src/xhs-note/dexbuddy-native-host.js`](../../src/xhs-note/dexbuddy-native-host.js)（会进插件中心包）；[`scripts/dexbuddy-native-host.js`](../../scripts/dexbuddy-native-host.js) 只是旧入口转发。

## 扩展 ID（不要写死）

智赢内部版是「加载已解压的扩展」，Chrome 用**安装目录绝对路径**生成 ID。同一路径不变则 ID 不变；换用户、换目录会变。

本仓按下列路径**都算、都写入** `allowed_origins`（不先看目录是否存在）：

| 系统 | 当前目录 | 旧目录 |
|------|----------|--------|
| macOS | `~/QuanMediaCrawl/extension` | `~/Library/Application Support/QuanMediaCrawl/extension` |
| Windows | `%USERPROFILE%\QuanMediaCrawl\extension` | `%LOCALAPPDATA%\QuanMediaCrawl\extension` |

算法：绝对路径、无末尾斜杠、不 `realpath`；macOS/Linux 对 UTF-8 字节 SHA-256；Windows 盘符小写改大写后对 UTF-16LE 做 SHA-256；取前 32 个 hex，映射 `0→a`…`f→p`。

校验：`/Users/peng.zhi/QuanMediaCrawl/extension` → `andhfibibleajbnnpbnfdmngmhkoeldj`。

`DEX_BUDDY_XHS_EXTENSION_ID` 与 CLI `--extension-id` **追加**进白名单（开发目录如 `build/chrome-mv3-dev`），不替换上述两条。不要读 Chrome Preferences。

**不要搬 Chrome 插件目录。** 扩展路径可以含中文用户名；ID 按真实路径算。要避开中文的是 Host 程序路径，不是扩展安装位置。

## Host 安装目录

| 系统 | 目录 |
|------|------|
| macOS | `~/Library/Application Support/DexBuddy/native-host`（包装器 `.sh`；不写 `C:\` / ProgramData） |
| Windows（用户目录纯 ASCII） | `%LOCALAPPDATA%\DexBuddy\native-host` |
| Windows（用户目录含中文等非 ASCII） | `C:\ProgramData\DexBuddy\native-host`；创建失败再落到 `C:\Users\Public\DexBuddy\native-host` |

Windows 上清单 JSON 与 Host 同目录；`HKCU\Software\Google\Chrome\NativeMessagingHosts\com.zhiying.dexbuddy.host` 指向该文件。`.cmd` 里的 DexBuddy / Node 路径若含中文，会在安装目录下建 `runtime-bin` 目录联接，只把 ASCII 路径写进 `.cmd`。

## 职责

| 角色 | 负责 |
|------|------|
| 智赢内部特供版扩展 | `connectNative`、取料、`允许 Dex Buddy 连接` |
| 本仓 / Dex Buddy | 写 Host 清单（路径算 ID）、提供 Host 脚本 |
| 用户 | 装内部特供版、登录小红书、打开允许连接 |

## 开发机排查

1. 启动一次操作台或加载插件（触发静默注册）。
2. 确认清单 `path` 为纯 ASCII，且 `allowed_origins` ≥ 2：

```bash
# macOS
cat "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.zhiying.dexbuddy.host.json"
# path ≈ ~/Library/Application Support/DexBuddy/native-host/dexbuddy-native-host.sh

# Windows（英文用户名示例；中文用户名则看 ProgramData）
type "%LOCALAPPDATA%\DexBuddy\native-host\com.zhiying.dexbuddy.host.json"
reg query "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.zhiying.dexbuddy.host"
```

3. `chrome://extensions` **重载**内部特供版。
4. 打开「允许连接」后：`lsof -nP -iTCP:18769 -sTCP:LISTEN`（Windows 用 `netstat -ano | findstr 18769`）。
5. 操作台 → 资料库 → 新建 → 小红书笔记：弹层会先探测取料通道与扩展版本（需 ≥ 0.9.0）；通过后显示「Chrome插件连接正常」，再粘贴链接取这篇。同 `noteId` 若 `cache/xhs-notes/` 已有 payload，取这篇不走插件。

可选手动注册：

```bash
node scripts/install-dexbuddy-native-host.mjs
node scripts/install-dexbuddy-native-host.mjs --extension-id <dev-id>
```

日志：安装目录下的 `host.log`（`sh-boot` → `boot` → `bridge listening`）。

### `Native host has exited`

1. 看安装目录 `host.log` 有无新的 `sh-boot` / `boot`。
2. 无 `sh-boot`：清单 path 是否仍含中文仓库路径（禁止）；重跑注册。
3. 有 boot 立刻 `stdin end`：扩展未保持 `connectNative`。
4. 扩展 ID：核对 `chrome://extensions` 当前 ID 是否落在清单 `allowed_origins`；开发目录加载用 `--extension-id` 追加。

## 不要做的

- 不要把单个扩展 ID 写死进仓库当默认回落。
- 不要把清单 `path` 指回含中文的仓库目录。
- 不要为了过 ASCII 检查去搬智赢扩展安装目录。
- 不要在 macOS 上写 `C:\ProgramData` 一类 Windows 路径。
- 不要读 Preferences 猜扩展 ID。
- 第二个业务插件不要再注册第二个 Host name。
