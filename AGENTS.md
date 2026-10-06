# Focus Matrix 项目记忆

用户要求：每次更新软件，都要保留更新前的内容。任务、日期备忘录、设置和窗口状态不能因更新而清空或被覆盖。

- 更新本机安装版时，使用 `scripts/install-local.ps1`；不要直接复制新的 exe 覆盖安装目录。该脚本必须先运行 `scripts/backup-before-update.ps1`，并在备份失败时停止更新。
- 修改本地存储格式或直接接触用户数据前，也要先运行备份脚本。保留原始文件，迁移应兼容已有任务和设置。
- 备份位于 `%APPDATA%\com.focusmatrix.desktop\backups\`，按时间分目录保存任务数据、窗口状态、旧版 exe 和 SHA-256 清单。不要自动删除旧备份。
- 更新后检查数据文件仍可读取，任务数量及内容未被安装流程更改；如果检查失败，先停止使用新版本并从备份恢复。
- 日期备忘录按本地日期保存在同一 Store 文件的 `dailyMemos` 字段；日期界面开关保存在 `settings.calendarOpen`。后续更新必须兼容并保留这些字段。
- 内容历史版本保存在应用数据目录的 `history/` 中，每个版本一个不可覆盖的 JSON 文件。禁止自动删除；更新备份必须包含这些文件。恢复只替换任务和日期备忘录，恢复前先保存当前内容，保留当前设置及窗口状态。
- 云端分享凭据单独保存在应用数据目录 `.cloud-config.bin`，使用 Windows 当前用户 DPAPI 加密；更新备份必须包含它。不得将写入凭据放入前端、源码、日志或明文设置。云端只同步当前任务及日期备忘录，不上传设置、窗口位置或历史记录。分享使用随机链接，可允许编辑、关闭或更换链接；编辑者署名、时间和变更内容必须保留。新产生的云端版本和编辑日志不自动删除。
- 云端网站位于 `cloud-site/`；必须复用 `.openai/hosting.json` 中的 Sites project_id，不重新创建站点。发布后检查无令牌不显示数据、协同编辑权限和撤销编辑权限。
- 正式 exe 必须通过 `npm run tauri build -- --no-bundle` 构建，启用内嵌前端的 custom-protocol；不能将普通 `cargo build --release` 结果安装给用户，后者可能依赖开发服务。云端联网遵循 Windows 系统代理。加密凭据的旧副本 `.cloud-config.previous.bin` 也须包含在更新备份内。

- Android 使用 `mobile-app/` 轻量官方 WebView 壳，React 界面内置在 APK 中。手机使用 IndexedDB 保存离线草稿、同步基线、待重试请求和不可覆盖的内容版本；更新须保持包名 `com.focusmatrix.mobile` 和 `mobile-app/signing/` 签名密钥，禁止卸载清数据。签名密码使用 Windows DPAPI 保存，不能发布或写入日志。
- 桌面双向同步收到响应后，先保存本地内容和历史，再确认同步基线；网络中断或落盘失败时保留待同步请求，不能提前确认。分享接收者不能生成配对链接、管理手机或获取电脑写入密钥。
- Windows aapt2 曾生成 assets/mobile\index.html 等反斜杠 ZIP 条目，Android 无法读取。scripts/build-android.ps1 必须在签名前统一 ZIP 条目为正斜杠，并运行 mobile-app/tests/ApkAssetsTest.java 检查首页和引用资源，不能只校验签名。首页使用 loadDataWithBaseURL，从 AssetManager 直接读入，保留原 HTTPS origin，不能换域名或清空 IndexedDB。
- Android 1.0.2 起，连接框识别分享与配对链接。分享令牌始终保持 share 权限，不可作为手机设备凭据；链接校验使用固定云端域名，不依赖 WebView location.origin。请求超时应兼容没有 AbortSignal.timeout 的 WebView。后续更新保留这些兼容能力。

- Android 一键部署使用 Deploy-Android.cmd 和 scripts/deploy-android.ps1，通过官方 ADB USB 或 Android 11+ 无线调试连接。覆盖安装只用 install -r；禁止 uninstall、pm clear、自动降级与更换签名。多设备必须明确选择。无线配对码仅隐藏输入后经 stdin 交给 ADB，不放入命令行或日志；ADB 首次授权由用户在手机上完成。
- 本机荣耀 Magic7 的 USB 文件传输和 HDB 已可用，但首次 ADB 仍需手机 RSA 授权；助手能看到手机不能当作 ADB 已授权。scripts/copy-apk-to-phone.ps1 可经 MTP 传到 Download，仅读写安装包且保留旧包；此操作不能声称已完成自动安装或启动。MTP 大小使用 ExtendedProperty(System.Size)，不用通常返回 0 的 FolderItem.Size。

- Android 1.0.3 起，手机绑定没有到期时间，首次连接链接的 10 分钟有效期不能作为已绑定设备有效期。网络失败、电脑离线或关闭分享不能自动清空绑定。桌面缓存设备记录及链接存于 DPAPI 配置 phoneConnection；旧配置必须默认兼容。
- 手机主动取消连接先持久保存 disconnected/disconnectPending，再调用仅能撤销自己的 /api/devices/self；离线待确认期间停止同步但保留草稿、基线、待重试内容和历史，联网后重试确认。重新配对必须合并原离线内容，不能直接以云端覆盖。
- 2026-10-07 已复现原 chatgpt.site 普通网络返回 Cloudflare HTML 403，而电脑代理返回真实 API JSON。代理访问成功不能作为手机/分享链接可访问的验收结果。新的正式公网入口必须通过无代理、无托管预览令牌的健康及权限测试，才能切换 cloud-site/lib/publicCloudConfig.json，并构建更新客户端；保留 Android 原 IndexedDB origin 和原数据库/设备凭据。
- cloud-gateway/ 准备了腾讯 EdgeOne 免费公网入口，当前正式账号授权/认领尚未确认。临时诊断项目返回托管预览限制，不能当作可用的长期链接，也不能把 eo_token 或 .edgeone 凭据写进客户端。继续部署先确认 whoami 与认领；不要将“腾讯网页已登录”等同于 CLI 已授权。原 Sites project_id 不变，用户安装版在新地址通过验收前不替换。
