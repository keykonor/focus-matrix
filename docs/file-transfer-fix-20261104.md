# Windows 文件接收修复（2026-11-04）

文档保存原先直接重命名临时文件，Windows 返回 OS error 17 时没有兼容路径。
现在复用本地数据保存已有的持久化 payload、SHA-256 封印和恢复写入机制，
保存成功后仍校验内容并设为只读副本。源文件不会被移动或删除。

文件拖放由 Windows OLE 接收器处理，支持 CF_HDROP 文件及 Unicode 文字/链接，
避免 Windows WebView2 的文件拖放与 HTML5 拖放通道冲突。
接收器只向前端授予一次性文件令牌，不开放任意路径读取。
已有任务保留描述，空白象限自动建立记录，多文件一次接收；
新任务的接收监听在 DOM 提交阶段安装，避免第一批文件早于监听就绪。
原来的任务移动改为指针手柄，文字/链接仍保持 Enter 提交规则。
附件忙时再次接收会提示稍候重试。

注册方式参考 [Wry Windows 拖放实现](https://github.com/tauri-apps/wry/blob/wry-v0.55.1/src/webview2/drag_drop.rs)，
保留 MIT 版权声明及 licenses/wry-MIT.txt。
相关配置见 [Tauri 配置文档](https://v2.tauri.app/reference/config/)。

验证记录：54 项 Vitest、23 项 Rust、任务/子任务/历史/跨日隔离浏览器回归、
更新恢复保护及公开源码检查通过。OS17 使用确定性错误注入验证兼容写入；
本次临时测试位置不支持新建 EFS 加密目录，因此不将其算作真实 EFS 验收。

原生验收使用编译后的独立 identifier/product/mutex/startup 身份，
不依赖替换 APPDATA。150% DPI 下，从真实资源管理器拖入既有任务、
Windows CF_HDROP 复制粘贴、多文件拖入空白象限及选中 URL 的原生 OLE 拖放均通过。
合成内容保存到独立 com.focusmatrix.transfercheck 数据目录；未添加到真实用户任务。
本次没有用用户文档测试默认应用打开，也没有宣称任意浏览器来源全部验证。

文件仍仅存于本机，不上传手机、云端或分享页面。
