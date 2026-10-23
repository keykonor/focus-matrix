# 开发与发布

[仓库首页](../README.md) · [贡献指南](../CONTRIBUTING.md) · [维护机制](MAINTENANCE.md)

## 环境与检查

前端使用 Node.js 24，执行 `npm ci` 安装准确锁定版本，不以本机陈旧 node_modules 验收。
原生开发需要 Windows、Rust MSVC、Visual Studio C++ Build Tools、Windows SDK 与 WebView2。
GitHub Windows runner 不依赖维护者本机工具链或凭据。

```powershell
npm ci
npm run release:check
npm test
npm run version:test
npm run test:source-policy
npm run build
node --test cloud-gateway/test.mjs
```

Vitest 显式只收集根目录 `src` 的测试，忽略 `outputs` 中的旧工作树。发布前在 UTC、
Asia/Shanghai、America/Los_Angeles 分别运行，检查本地日期行为。

完整 Windows 验证：

```powershell
npm run test:update
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-installer-preparation.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-release-ref.ps1
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
npm run check:completed
```

`check:completed` 使用独立浏览器资料目录、合成数据和测试时钟，不修改系统时间或真实任务。
浏览器合成预览为 `calendar-preview.html`，由 mock IPC 模拟本地保存和历史。

**原生开发启动可能访问真实应用数据。** Tauri 使用同一应用标识；运行 `npm run tauri dev`
前先备份，或使用独立 Windows 用户。普通浏览器预览不等于正式原生验收。

## 正式构建与安装

```powershell
npm run tauri build -- --no-bundle
npm run tauri bundle -- --bundles nsis
```

原生程序位于 `src-tauri/target/release/focus-matrix.exe`，安装器位于
`src-tauri/target/release/bundle/nsis/`。普通 `cargo build --release` 可能未启用内嵌前端，
禁止把它安装给用户。

更新维护者本机原路径使用 `scripts/install-local.ps1`，先正常保存退出、备份当前完整数据、
再更新并逐字节核对恢复。源码 ZIP 不代替数据备份。

## 发布规则

每个分支 push/每个 PR 运行 [Source and tests](../.github/workflows/checks.yml)。
main、面向 main 的 PR、版本标签或手动触发另运行
[Windows build and release](../.github/workflows/release-windows.yml)。没有周期扫描。

普通提交不要求当前 SHA 等于已经发布的 v0.2.0 标签。只有真正的版本标签推送或
手动启用 publish 时，才严格校验发布版本、已存在标签与构建 SHA。
`publish` 依赖完整 Windows job，校验选定资产及来源后发布；已有同名 Release 不覆盖，标签不强制移动。

新版本需同步 `package.json`、根锁文件、Tauri 配置、Cargo.toml、Cargo.lock 和
`docs/releases/` 对应说明。不要在已有 v0.2.0 标签上重复尝试发布新源码。
在 GitHub 手动运行时使用准备好的新版本标签，确认同一提交的检查和安装验收完成。

修改前后保存不可覆盖源码版本：

```powershell
npm run version:save -- "准确描述本次修改"
npm run release:check
```

该命令提交当前未忽略源码并创建 `versions/` 标签、ZIP 及 SHA-256 清单。
不要在描述中添加 `[skip ci]` 等跳过标记；GitHub 会按提交消息跳过相应检查。
工作流不上传整个 `outputs/`，只上传明确选定的发布资产。不自动删除历史、标签或备份。

## 目录

```text
src/                 桌面 React 界面与测试
src-tauri/           Rust、Windows 集成、图标和 NSIS 钩子
cloud-site/          分享网页、手机前端及原站点集成
cloudbase/           CloudBase API、数据库迁移及测试
cloud-gateway/       备用网关
mobile-app/          Android Java WebView 壳与资源测试
scripts/             构建、数据保护、验收与发布检查
docs/                使用、开发、审计、历史及发布说明
.github/workflows/   提交/PR 检查和 Windows 构建发布
```

[历史版本清单](version-history.md) 区分完整源码、旧 EXE 候选与重新构建；不补造历史发布时间，
不把当前源码冒充旧版本。
