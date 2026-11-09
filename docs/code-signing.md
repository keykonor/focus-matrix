# Code signing policy

Focus Matrix 的 Windows 安装包由本仓库的 GitHub Actions 从公开源码构建。已发布的 0.2.0 安装包尚未签名。SignPath Foundation 方案需要基金会批准后启用。

- 维护与代码审查由仓库维护者负责。外部贡献经维护者审查后合并。
- 申请时拟指定仓库所有者 [keykonor](https://github.com/keykonor) 为签名审批人。获批后，每次发布均由授权审批人手动批准，参与签名的成员须在 GitHub 和 SignPath 开启多因素认证。
- 获批并正式启用后，使用基金会要求的署名文字：“Free code signing provided by SignPath.io, certificate by SignPath Foundation”。签名范围为提供给用户下载的 Windows x64 NSIS 安装程序。

任务、备忘录和日记可在本机离线使用。用户开启并配置云同步或分享后，程序才会将同步范围内的任务和日期备忘录传给所配置的服务。日记和附件文件保存在本机。安装器在缺少 WebView2 时会向微软下载运行时。详见 [使用指南](usage.md) 和 [微软隐私声明](https://privacy.microsoft.com/privacystatement)。

## 申请资料

在 [SignPath Foundation 申请页](https://signpath.org/apply) 填写维护者自己的联系信息。项目资料可使用：

- 项目名：Focus Matrix
- 许可证：MIT
- 源码：https://github.com/keykonor/focus-matrix
- 项目主页：https://keykonor.github.io/focus-matrix/
- 现有可下载版本：https://github.com/keykonor/focus-matrix/releases/tag/v0.2.0
- 构建流程：https://github.com/keykonor/focus-matrix/actions/workflows/release-windows.yml
- 项目简介：Focus Matrix is an MIT-licensed Windows desktop Eisenhower matrix for tasks and daily notes. Its NSIS installer is built and tested from the public repository on GitHub-hosted Windows runners. We request Authenticode signing for the Windows x64 setup executable with manual approval for each release.

## 获批后接入

1. 在 SignPath 关联本仓库和 GitHub.com 可信构建系统。将提交权限限于发布流程，启用人工审批，限制可信来源为本仓库的 Windows 发布工作流和正式发布引用。按 SignPath 审核结果配置 GitHub App 和分支或标签保护。
2. 将 [windows-nsis.xml](signpath/windows-nsis.xml) 配置为签名项目的产物规则。规则仅接受固定文件名的安装程序，并检查产品名和版本。
3. 在 GitHub 仓库的 Actions secrets 中设置 `SIGNPATH_API_TOKEN`。在 Actions variables 中设置 `SIGNPATH_ORGANIZATION_ID`、`SIGNPATH_PROJECT_SLUG`、`SIGNPATH_SIGNING_POLICY_SLUG` 和 `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG`。确认设置及审批人后，将 `WINDOWS_SIGNING_ENABLED` 设为 `true`。
4. 使用新的发布版本运行 Windows 发布工作流。审批人核对提交和待签名产物后，在 SignPath 批准。工作流检查返回文件的 Authenticode 签名、时间戳、发布者和版本，生成签名后文件的 SHA-256，再用同一份安装包测试安装、卸载和数据保留，通过后才上传到 Release。

启用后，如果签名请求、签名验证或安装测试失败，该次发布会停止。可以在 Windows 中右键下载安装包，查看“属性 → 数字签名”，或使用 `Get-AuthenticodeSignature` 检查签名状态和发布者。签名与校验值对应具体的发布文件。
