# Focus Matrix

[![Windows release](https://github.com/keykonor/focus-matrix/actions/workflows/release-windows.yml/badge.svg)](https://github.com/keykonor/focus-matrix/actions/workflows/release-windows.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Windows 桌面四象限任务便笺。把任务按重要性和紧急程度整理，配合每日备忘录、内容历史和已完成仓库，保留每天做过的事。

**[下载 Windows x64 安装包](https://github.com/keykonor/focus-matrix/releases/latest/download/FocusMatrix-Windows-x64-setup.exe)** · **[全部版本与更新说明](https://github.com/keykonor/focus-matrix/releases)** · [更新日志](CHANGELOG.md)

## 能做什么

- 四象限任务：直接编辑、多行文字、拖动换象限、勾选完成。
- 日期备忘录：按本地日期分别记录早上、下午、晚上。
- 已完成仓库：跨过本地午夜后，先完整保存，再从主界面收起此前已完成的任务；当天刚勾选的任务当天保留。
- 内容历史：修改后保留内容版本，支持预览和恢复；恢复前再保存当前内容。
- 桌面与托盘：支持置顶、桌面底层、透明度、字体和开机启动。默认窗口 720 × 480，最小 520 × 360。
- 本地保存：任务、备忘录、仓库和设置可离线使用。保存失败停止覆盖，并保留原文件及恢复依据。

## 安装与启动

支持范围：**Windows 10/11，x64**。安装器通过 GitHub Actions 在 Windows 环境构建；其他版本 Windows 和 ARM64 尚未验收。

1. 从 [Releases](https://github.com/keykonor/focus-matrix/releases) 下载 `FocusMatrix-Windows-x64-setup.exe`。
2. 安装前保存工作，并在旧程序的托盘右键菜单选择“退出”。右上角 × 默认只是隐藏窗口。
3. 运行安装器，完成后从开始菜单或桌面快捷方式打开 Focus Matrix。

安装器使用当前用户模式，默认安装到 `%LOCALAPPDATA%\Focus Matrix\`。缺少 WebView2 时会下载运行时，需要联网。安装完成后，本地任务和备忘录不依赖联网。

当前安装器未做 Windows 数字签名。Release 同时提供 `SHA256SUMS.txt` 和 `release-provenance.json`，可核对文件与准确源码提交：

```powershell
Get-FileHash -LiteralPath .\FocusMatrix-Windows-x64-setup.exe -Algorithm SHA256
```

GitHub 自动生成的 “Source code” ZIP/TAR 是源码，不能直接当作安装包运行。

## 使用与退出

点击象限空白处或“添加任务”创建任务。Enter 新建下一项，Shift+Enter 换行；拖动左侧手柄调整象限。顶部日期进入日历，顶部“仓库”和“历史”分别查看已完成内容及以前的内容版本。

软件在运行中，包括隐藏到托盘时，按本地午夜定时检查归档。未完成任务不归档；关机过夜后启动会补做检查。仓库保存成功后才移除主界面任务，失败会保留并重试。已完成仓库目前只保存在本机。

窗口 × 默认隐藏到托盘。**真正退出请右键托盘图标 → 退出**，等待程序保存完成。

## 升级、卸载与数据保留

安装器不会强杀运行中的程序；检测到 Focus Matrix 仍在运行时会停止，提示先保存并从托盘退出。安装或卸载前，会校验备份现有数据、窗口状态、内容历史、加密配置及发现的旧程序；备份失败停止操作。备份放在数据目录的 `backups/nsis-.../`，不自动删除。

卸载保留应用数据、历史和备份，重新安装后继续使用。卸载不是清空内容的方式。不要把维护者的任务文件或加密配置复制到其他用户电脑。

此前通过 `scripts/install-local.ps1` 安装的本机版本位于 `%LOCALAPPDATA%\Programs\FocusMatrix\FocusMatrix.exe`，与公开安装器的默认目录不同。维护该原路径继续使用原脚本；不要直接复制 EXE 覆盖运行中的程序，也不要用更早整表覆盖后来新增内容。

## 本地数据与恢复

数据目录为 `%APPDATA%\com.focusmatrix.desktop\`：

| 文件或目录 | 用途 |
| --- | --- |
| `focus-matrix.json` | 当前任务、日期备忘录、仓库、设置和跨日标记 |
| `.focus-matrix.previous.json` | 前一有效完整状态 |
| `.window-state.json` | 窗口位置和大小 |
| `history/` | 不可覆盖的任务及备忘录历史 |
| `backups/` | 更新、安装和卸载前的备份 |
| `.cloud-config*.bin` | Windows 当前用户 DPAPI 加密的私人云端配置 |

读取失败或内容无法完整解析时停止写入，不用空数据覆盖原内容。文件保存兼容已有格式及未知字段；Windows 加密目录拒绝原子替换时使用带 SHA-256 封印的写入日志，中断后校验恢复。不要手动删除 `*.pending-write*` 恢复依据。

应用内恢复内容历史只替换任务和日期备忘录，保留当前设置、窗口状态与已完成仓库。手工恢复前先保存当前完整目录；不能以旧快照覆盖后来新增的内容。不要在公开 Issue 附带真实数据、分享链接或配对码。

## 云同步、分享和 Android 的范围

仓库包含已有的桌面双向同步、分享网页、Android 离线 WebView、CloudBase API 和备用网关源码。**公开安装包不包含维护者的写入凭据，也不是安装后自动开通的公共云服务。** 首次下载可使用本地功能；云端需要单独部署和私下配置。

当前源代码仍保留原服务地址和 Android 存储 origin，以兼容原有本机配置及绑定。没有迁移、重置或公开原数据库。2026-10-17 的最近既有云端验收记录是 HTTP 410 停服，分享网页另有默认托管域名导航限制；本次开源发布不代表这些服务已恢复。

自建服务需要 `TCB_ENV`、`PUBLIC_ORIGIN`、`CLOUDBASE_API_KEY`、`FOCUS_MATRIX_WRITE_TOKEN` 等服务端配置，以及 `cloudbase/migrations/` 中的数据库结构。密钥只保存在服务端与本机受保护配置中，不放进前端、不上传 Git。公开部署前自行验证匿名权限、分享撤权、设备权限、原子提交和备份恢复。现有原始 Sites 项目不能通过重复创建站点替换。

Android 当前源码版本为 1.0.4，包名 `com.focusmatrix.mobile`。旧签名密钥不公开，缺少原密钥无法制作可覆盖已有应用的同签名更新。本次只发布 Windows 安装包；Android 真机覆盖安装及同步没有完整验收。维护已有手机时保留包名、原签名和 IndexedDB origin，只覆盖安装，禁止卸载或清数据。

## 开发与检查

需要 Node.js 24、Rust MSVC、Visual Studio C++ Build Tools、Windows SDK 和 WebView2。GitHub Actions 使用干净的 Windows runner，不依赖维护者电脑中的工具链或凭据。

```powershell
npm ci
npm test
npm run version:test
npm run test:update
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-installer-preparation.ps1
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
npm run check:completed
npm run tauri dev
```

`check:completed` 使用隔离数据、浏览器资料目录与测试时钟，检查跨日、失败重试、历史、仓库及窗口布局，不修改系统时间或真实任务。Tauri 开发版使用同一应用标识，**原生开发启动可能访问本机真实数据**；有已有内容时请先备份或使用独立 Windows 用户。

正式构建和打包：

```powershell
npm run tauri build -- --no-bundle
npm run tauri bundle -- --bundles nsis
```

原生程序位于 `src-tauri/target/release/focus-matrix.exe`，安装器位于 `src-tauri/target/release/bundle/nsis/`。不要把普通 `cargo build --release` 的输出作为正式程序安装，它可能未启用内嵌前端。

## 发布流程

[Windows workflow](.github/workflows/release-windows.yml) 在 `main` 更新时验证，在版本标签或手动启用发布时生成 Release。需要版本字段一致、测试通过、Tauri 正式构建成功以及隔离安装器验收成功。

```powershell
# 修改前及完成后保存源码；不包含用户数据与凭据
npm run version:save -- "版本说明"
# 核对公开源码范围及版本
npm run release:check
# 已有 gh 登录且版本与说明准备好时，在 GitHub 构建并发布
gh workflow run release-windows.yml --ref main -f publish=true -f tag=v0.2.0
```

工作流只上传选定安装器、校验文件和构建来源，不上传整个 `outputs/`。Release 不自动覆盖已有同名版本。更新版本时同步修改 `package.json`、根锁文件、Tauri 配置、Cargo.toml、Cargo.lock 和对应 `docs/releases/` 说明。

## 目录与历史

```text
src/                 桌面 React 界面与测试
src-tauri/           Rust、Windows 集成、图标和 NSIS 钩子
cloud-site/          分享网页、手机前端及原站点集成
cloudbase/           CloudBase API、数据库迁移及测试
cloud-gateway/       备用网关
mobile-app/          Android Java WebView 壳与资源测试
scripts/             构建、数据保护、验收与发布检查
docs/                发布说明、真实历史与审查记录
.github/workflows/   GitHub 托管的构建与发布流程
```

原始 Git 提交和 `versions/` 标签保留。[历史版本清单](docs/version-history.md) 区分完整源码、旧 EXE 候选和重新构建；不补造历史发布时间，也不把当前代码冒充旧版。

## 许可证与反馈

本项目原始源码采用 [MIT](LICENSE)。第三方组件沿用原许可证，见 [第三方声明](THIRD_PARTY_NOTICES.md)。问题反馈请使用 [Issues](https://github.com/keykonor/focus-matrix/issues)，附上版本、Windows 环境和可复现步骤；隐私处理见 [SECURITY.md](SECURITY.md)。
