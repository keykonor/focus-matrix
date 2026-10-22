# 0.2.0 发布验收记录

- 公开仓库：[keykonor/focus-matrix](https://github.com/keykonor/focus-matrix)，GitHub 已识别 MIT。
- 正式发布：[Focus Matrix 0.2.0](https://github.com/keykonor/focus-matrix/releases/tag/v0.2.0)，非草稿、非预发行。
- 发布时间：2026-10-23 02:10:55，Asia/Shanghai（GitHub UTC 记录为 2026-10-22 18:10:55）。
- 对应源码：`34af03c1c41e61712e327264af9e0760cbd46839`，`v0.2.0` 标签与构建来源一致。
- 构建与发布：[GitHub Actions 39828482672](https://github.com/keykonor/focus-matrix/actions/runs/39828482672)，Windows 与 publish 两个 job 均成功。

## 构建和测试

Windows runner 使用 Node 24.21.0、Rust 1.99.0 MSVC，依赖来自锁文件。已完成：

- 37 项前端测试在 UTC、Asia/Shanghai、America/Los_Angeles 三个时区分别通过。
- 5 项源码归档测试通过，覆盖 Windows 路径别名、父仓库拒绝、不可覆盖快照和敏感文件阻止。
- 15 项 Rust 测试通过，覆盖原生持久化、历史及既有同步逻辑。
- 完整更新快照、未知字段、窗口状态、损坏备份拒绝及封印日志恢复测试通过。
- 隔离浏览器验证跨日归档、保存失败重试、重启补归档、午夜无交互归档及 520/720/1200 宽度布局。
- 正式执行 Tauri 内嵌前端构建及 NSIS 打包。
- 在一次性 runner 上验证静默首装、运行中拒绝覆盖且不杀进程、备份期间启动的进程保护、重装、备份 SHA-256、卸载及卸载后重装；全部保留隔离数据字节。
- 根项目 npm 依赖扫描为 0 项已知漏洞。此结果不表示云端子项目或全部第三方组件都经过完整安全审计。

真实发现并修正的发布问题包括：测试时区假设、Windows 临时目录路径别名，以及安装器 PowerShell 缺少 `Get-FileHash`。备份校验改用 .NET SHA-256，新增缺少该命令的回归场景。没有降低备份或数据保留要求。

## 下载校验

从正式 Release 下载后，安装包和构建来源均与 `SHA256SUMS.txt` 一致；安装包哈希也与 GitHub 资产摘要一致。

| 资产 | 大小 | SHA-256 |
| --- | --- | --- |
| `FocusMatrix-Windows-x64-setup.exe` | 2,636,165 字节 | `560a4225414f404f6ea2a2b08e3e6afe50e4b579f6febe737730e4b87835bf27` |
| `release-provenance.json` | 669 字节 | `16dee3a2f02b47324c80fffab31f9298b2dc207c14840ced0e11ac7a9bdaaffb` |

安装包签名状态实测为 `NotSigned`。安装器按需下载缺失的 WebView2 运行时。

## 验证边界

安装器测试使用合成数据，没有启动应用本体或读取维护者的真实任务；不代替所有 Windows 环境的真机验收。维护者已安装的程序未被此次发布替换。

本次没有恢复或重新部署云服务，没有迁移数据库、轮换凭据或发布新的 Android 包。旧桌面二进制仍按历史清单中的真实源码匹配程度标注；不将当前构建冒充旧版。
