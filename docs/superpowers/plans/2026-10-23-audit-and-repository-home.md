# 项目技术审计与仓库首页优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复有复现依据的技术问题，建立仅在提交/PR 时运行的源码与测试检查，并优化 GitHub README。

**Architecture:** 保留现有存储格式、四象限界面与发布安装验收；补充跨平台轻量 CI，实际发布才校验发布标签。用当前应用的隔离合成数据截图展示功能，将长操作说明移入文档。

**Tech Stack:** React 19、TypeScript、Vitest、Node.js 24、Tauri 2、GitHub Actions、GitHub Markdown。

**Spec:** 用户本轮明确要求：每次提交/PR 检查，无每周扫描；审计当前项目技术错误；页面目标为开源仓库首页。此范围取代此前维护设计中的定时扫描及桌面界面优化假设。

## Global Constraints

- 修改前后运行 `npm run version:save`，不删除源码版本、标签、备份、历史或 Release。
- 不读写真实任务/备忘录/凭据，不改存储格式、不部署、不更新安装版。
- 无 cron、无周度扫描、无 Dependabot 周期配置，不自动发布或合并。
- 不改任务历史“只恢复待办、保留当前备忘录”的当前实现；README 必须准确描述。
- 审计与未整改项分开记录；源码扫描不是全历史秘密审计。

## Review Focus

- 初始读取、云端应用、跨日归档、恢复和退出期间，用户不能在界面上进行随后会丢失的编辑；失败后恢复交互。
- 普通 PR/分支提交不因旧 v0.2.0 标签存在误失败；真实发布仍拒绝 SHA 不匹配及覆盖旧版本。
- 误跟踪的数据文件被源码检查及快照拒绝，报错不包含数据内容。
- Vitest 仅收集根 src；outputs 内旧工作树不能影响结果。
- README 的下载、图片、内部链接及开发步骤可用；截图为本次运行的合成数据，不是用户任务。

## Tasks

### 1. 技术复现、检查与 CI

Files: `.github/workflows/checks.yml`、`.github/workflows/release-windows.yml`、`vitest.config.ts`、`scripts/validate-release-ref.ps1`、`scripts/test-release-ref.ps1`、`scripts/private-source-path.mjs`、公开源码/归档相关测试及 `package.json`。

- [ ] 在隔离 Git fixture 中验证普通提交不校验旧标签、真实发布错误标签失败、正确新发布通过；先观察失败，再实现发布专用校验。
- [ ] 用已跟踪的合成数据文件和 ignored 合成文件验证源码与快照保护；先观察拒绝缺失，再共享明确私密路径策略。
- [ ] 显式限制 Vitest include，放置 outputs 合成失败测试，验证它不会被收集。
- [ ] 每个分支 push/PR 自动执行公开源码、前端三时区、源码归档、技术回归与构建；复用现有固定 Action SHA，无定时触发。

### 2. 编辑时序问题修复

Files: `src/App.tsx`、隔离预览 fixture 与浏览器验收脚本。

- [ ] 用受控加载/提交 Promise 复现启动编辑、跨日/云端慢写入和退出保存时的交互风险。
- [ ] 将独占事务/退出状态反映到可访问的交互锁与修改回调；普通自动保存期间继续编辑。
- [ ] 浏览器验证读取失败保持保护、事务完成/失败解锁、保存前的编辑完整落盘、退出只发生在落盘后。

### 3. README 与持续维护说明

Files: `README.md`、`docs/usage.md`、`docs/development.md`、`CONTRIBUTING.md`、`docs/MAINTENANCE.md`、`docs/assets/`、本轮审计结果。

- [ ] 参考 Super Productivity、Planify 的首页层次：简介/下载、真实截图、功能、快速开始、开发与贡献导航。
- [ ] 从隔离应用抓取矩阵/日历/仓库截图并逐张检查，保留现有产品样式，不复制他人的品牌或素材。
- [ ] 将现有恢复、升级、云端和 Android 限制完整迁入操作文档，修正与当前待办恢复行为不一致的描述。
- [ ] 记录本轮修复证据和剩余风险，维护机制明确为提交/PR 触发，工作流推送前不声称已在 GitHub 生效。
- [ ] 校验 Markdown 相对链接、图片、Actionlint、前端/原生/隔离数据保护检查；独立审阅后留存源码快照。

## 执行记录

- 修改前快照：`versions/20261023-111747-176Z-4550c78e`，基线 a3b0c738e919798c8a3ebc2d762585d2b3dd7803。
- 用户澄清首页指 GitHub README；不执行桌面视觉改造。
- 已用 `npm ci --no-fund --no-audit` 恢复锁定依赖。沙箱临时文件 rename 导致基线 Vitest 无法运行，需在允许的执行环境复测，未归因为产品错误。
- 实施完成：发布引用10项、源码保护11项、归档5项、网关6项、Rust15项均通过；前端三时区各37项、生产构建、更新保留/安装准备通过；Edge原验收及新增8组编辑事务通过。
- 独立代码审阅未发现必须修复项。原“恢复备忘录”疑点经核实不是当前实现缺陷，保持只恢复tasks，修正文档。
- GitHub 首页采用原产品合成截图，无桌面视觉改动；不引入任何定时扫描配置。
