# 2026-10-16 更新保护修复与云端诊断

## 当前状态：正式构建完成，安装验收未完成

源码及原数据已先备份。修复实现了保存退出确认、完整快照恢复确认、更新当天归档保护、按变化字段提交、原子落盘和读取异常停止保护。34 项 Vitest、14 项 Rust 测试、隔离浏览器归档/完整更新快照测试及独立 PowerShell 恢复测试通过。

正式 exe SHA-256：`943a036033e2eee53adbb3b1e86f366fc75bce8f7ce30823898e521b976d7cb2`。

真实安装先发现 Windows PowerShell 默认编码误读中文 JSON，已统一为明确 UTF-8，并隐藏解析错误中的用户正文。随后 `File.Replace` 出现 EFS 文件属性兼容错误，已改为同目录 `MoveFileEx` 原子替换及写透；修复后的中文快照恢复隔离测试通过。程序文件已替换，但完整恢复启动流程尚未确认成功；旧程序已通过保存退出事件正常结束，未启动不经验证的更新实例。

最后只读核对：当前 15 条任务、3 条仓库记录、8 个备忘日期，完整 Store SHA-256 `b95cb3d54ced9721a9865681c7c54c324a7ae8b9fc35be57ced8259883cc19a2`，与完整备份 `backups/20261016-160321-287-6098e3` 相同。不得用更早整表覆盖这些后来新增内容。

自动审批对修复后的安装命令连续两次未在期限内完成，命令未执行；系统未给出具体不安全理由。已向用户请求明确授权继续本机备份、恢复、覆盖更新及重启验收。仍需执行 `scripts/install-local.ps1`，先从已关闭状态安装并验收，再在运行状态执行第二次同版本更新，验证 nonce/PID/协议保存确认。每次通过后执行 `node scripts/check-completed-installed.mjs --exact`。验收用 WebView2 本机调试端口 9236；完成后保存退出并正常重启，关闭调试端口。

安装前源码记录 `eef1278fe34f47c340be93020daa40080d90d853`；后续两个 PowerShell helper 的修复尚未提交，差异另存 `outputs/pending-update-preservation.patch`。最终完成后必须执行 `npm run version:save`。目前不能声称连续两次更新验收完成或全流程已正常。

## 云同步根因已确认

腾讯官方 CLI：环境 NORMAL，体验版到期 2027-04-07；函数配置 Active，但实际 `AvailableStatus=InsufficientBalance`。无代理健康接口 HTTP 410，响应头 `x-cloudbase-upstream-type=Tencent-SCF_HTTP` 和 `x-cloudbase-upstream-status-code=410`。

[腾讯云 SCF 官方状态码](https://cloud.tencent.com/document/product/583/42611) 将 410 InsufficientBalance 定义为账号余额不足停服。尚未查询具体欠费金额，未充值、购买或变更套餐，未更换云端域名、迁移或删除云端数据、凭据及手机绑定。需用户在腾讯云费用中心核对余额和账单；恢复服务后仍需重新验收才能宣称同步恢复。
