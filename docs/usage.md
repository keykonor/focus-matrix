# Focus Matrix 使用指南

[返回仓库首页](../README.md)

## 安装与校验

支持 Windows 10/11，x64；其他系统和 ARM64 尚未验收。
从 [Releases](https://github.com/keykonor/focus-matrix/releases) 下载 `FocusMatrix-Windows-x64-setup.exe`。
有旧程序时先保存工作，从托盘右键菜单选择“退出”；右上角 × 默认只是隐藏窗口。

安装器使用当前用户模式，默认目录 `%LOCALAPPDATA%\Focus Matrix\`。
缺少 WebView2 时会联网下载运行时；安装完成后本地任务和备忘录可以离线使用。

当前安装包未做 Windows 数字签名。Release 提供 `SHA256SUMS.txt` 和
`release-provenance.json`，用于核对下载文件与准确源码提交：

```powershell
Get-FileHash -LiteralPath .\FocusMatrix-Windows-x64-setup.exe -Algorithm SHA256
```

比较结果与同一 Release 的校验文件。SHA-256 不代替 Windows 签名。
GitHub 自动生成的 “Source code” ZIP/TAR 是源码，不是安装包。
0.2.0 的构建和下载校验见 [发布验收记录](releases/verification-v0.2.0.md)。

## 使用与退出

点击象限空白处或“添加任务”创建任务；Enter 新建下一项，Shift+Enter 换行。
拖动左侧手柄调整象限，勾选表示完成。顶部日期打开每日备忘录，“仓库”和“历史”用于回看。

保持软件运行，包括隐藏到托盘时，会按本地午夜检查归档。未完成任务不归档，当天新勾选的任务当天保留。
仓库和剩余任务成功保存后才收起主界面内容，失败保留并重试。关机过夜后启动会补做检查。
仓库目前只保存在本机。

窗口 × 默认隐藏到托盘；真正退出请右键托盘图标 → 退出，等待保存完成。

## 升级与卸载

安装器不强杀运行中的程序；检测到 Focus Matrix 仍运行会停止，请先从托盘退出。
安装、卸载前校验备份现有数据、窗口状态、内容历史、加密配置及发现的旧程序，备份失败停止。
安装器备份位于应用数据目录的 `backups/nsis-.../`，不自动删除。

卸载保留应用数据、历史和备份，重新安装后继续使用。不要把维护者的任务文件或加密配置复制给其他用户。

此前通过 `scripts/install-local.ps1` 安装的维护者本机版本位于
`%LOCALAPPDATA%\Programs\FocusMatrix\FocusMatrix.exe`，与公开安装器目录不同。
维护原路径仍使用该脚本；不要直接复制 EXE 覆盖运行中的程序。

## 数据与恢复

数据目录 `%APPDATA%\com.focusmatrix.desktop\`：

| 文件或目录 | 用途 |
| --- | --- |
| `focus-matrix.json` | 当前任务、日期备忘录、仓库、设置及跨日标记 |
| `.focus-matrix.previous.json` | 前一有效完整状态 |
| `.window-state.json` | 窗口位置和大小 |
| `history/` | 不可覆盖的内容历史 |
| `backups/` | 更新、安装和卸载前的备份 |
| `.cloud-config*.bin` | 当前 Windows 用户 DPAPI 加密的私人云端配置 |

读取失败或内容无法完整解析时停止写入，不用空数据覆盖原内容。兼容已有格式与未知字段。
Windows 加密目录拒绝原子替换时使用带 SHA-256 封印的写入日志，中断后校验恢复。
不要手工删除 `*.pending-write*` 恢复依据。

当前应用内“待办历史”恢复只替换任务列表（包括其中已完成项），保留当前日期备忘录、
已完成仓库、设置和窗口状态；恢复前保存当前版本。历史文件中也可能包含备忘录，
但当前恢复按钮不将其覆盖回来。手工恢复前先保存完整目录，不能用旧快照覆盖后来新增的内容。

## 云端分享与 Android

仓库包含已有桌面双向同步、分享网页、Android 离线 WebView、CloudBase API 与备用网关源码。
公开安装包没有维护者的写入凭据，不是安装后自动开通的公共云服务；云端需要独立部署和私下配置。

源码保留原服务地址和 Android 存储 origin，以兼容原有配置和绑定；没有迁移、重置或公开原数据库。
2026-10-17 的既有云端验收为 HTTP 410 停服，分享网页另有默认托管域名导航限制。
本次开源和仓库维护不表示上述服务恢复。

自建服务涉及 `TCB_ENV`、`PUBLIC_ORIGIN`、`CLOUDBASE_API_KEY`、`FOCUS_MATRIX_WRITE_TOKEN`
等服务端配置，以及 `cloudbase/migrations/` 的数据库结构。密钥不放前端、不上传 Git。
公开部署前必须独立验证匿名权限、分享撤权、设备权限、原子提交与备份恢复；
原始 Sites 项目不得通过重复创建站点替换。

Android 当前源码为 1.0.4，包名 `com.focusmatrix.mobile`。原签名密钥不公开，缺少它不能制作
可覆盖原应用的同签名更新。当前 Release 只发布 Windows 安装包；Android 真机覆盖安装及同步尚未完整验收。
维护原手机必须保留包名、签名和 IndexedDB origin，只覆盖安装，禁止卸载或清数据。
