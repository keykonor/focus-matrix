# Focus Matrix 项目记忆

用户要求：每次更新软件，都要保留更新前的内容。任务、日期备忘录、设置和窗口状态不能因更新而清空或被覆盖。

- 2026-10-23 用户明确持续维护只需每次提交/PR自动检查，不要每周扫描；页面优化目标是 GitHub 开源仓库首页 README，不是桌面视觉或分享站点。新增 `.github/workflows/checks.yml` 覆盖所有分支 push/PR（GitHub只观察推送，带skip标记会跳过），没有schedule/周期Dependabot/新增自动发布入口。普通CI不再要求SHA等于旧发布标签，真正发布仍严格验证版本/SHA并拒绝覆盖；10项发布引用回归通过。Vitest只收集根src，三时区各37项；源码归档与公开检查共享私密路径规则，误跟踪任务/窗口/更新/封印日志文件被拒绝，11项新回归及5项原归档通过。
- 同轮技术审计修复启动读取前编辑被覆盖、独占云端应用/跨日保存静默丢输入、退出保存期间新编辑未落盘的问题。同步ref与DOM inert锁保护全部内容控件，普通自动保存继续允许输入；事务失败解锁，退出幂等，更新nonce协议保留。隔离Edge原跨日/午夜/布局验收与新增8组交互场景通过，15项Rust、6项网关及更新保留/安装准备通过。没有修改存储格式、归档规则、历史只恢复待办的现有行为、真实用户数据或安装版。README加入本轮合成数据截图，长说明迁入docs/usage.md与docs/development.md，修正文档中与当前“恢复保留备忘录”行为不符的表述。细节见docs/security/technical-review-20261023.md；远端是否生效必须按实际提交的Actions记录核验，不能以本地测试冒称已更新GitHub。cloud-site依赖漏洞、CSP/权限、签名及图标许可等仍待专项处理。

- 2026-10-17（后续明确要求）用户强调不等下次打开，而是日期跨过午夜自动归档。已新增 `src/localDayClock.ts`，按下一本地午夜设置定时器，`useToday` 直接驱动原跨日归档；30 秒检查只用于时钟变动、延迟及失败重试兜底。保持软件运行（包括托盘）无需点击、焦点切换或重开。没有改变归档规则、数据格式或保存/恢复流程。37 项 Vitest 和完整隔离 UI 测试通过；新增页面保持打开、流动测试时钟真实跨午夜、零 focus/visibilitychange 事件、5 秒内完成归档的用例，未改系统时间或真实任务日期。
- 本轮已正式 `npm run tauri build -- --no-bundle` 并通过 `install-local.ps1` 更新，保存退出协议正常，备份 backups/20261017-223748-147-1bbee7。安装前后完整 Store 字节一致：10 项当前任务、6 条仓库记录、11 个备忘日期、设置/窗口状态及 255 个原历史文件保留；正常退出再重启后 Store SHA-256 016835EF31DA65F9F0D736D8AF22B2170F9A7EE5A53B2949414D33B99DCE37FC 不变。正式 exe SHA-256 3D0F4E551872A010F83EDF62201BF888023F2EFF78846958B29DFA529A9DA6F7，与构建一致；仅一个 canonical 实例，CDP 9236 已关闭。未在真实用户数据上伪造跨日，不声称已等待本机真实午夜；午夜无交互行为经隔离浏览器验证。详见 docs/midnight-archive-update-20261017.md。

- 2026-10-17（前一轮核验）用户再次要求已完成任务次日自动归档、不在主页面显示。当时确认原正式版本已有该逻辑，34 项 Vitest 及隔离浏览器跨日/失败重试/重启补归档测试全部通过；该轮没有修改运行时代码或重装 exe。实际最初运行的是旧路径 `Programs\Focus Matrix\Focus Matrix.exe`（磁盘 SHA 与正式 E34F... 相同），不是未运行；该实例未响应 nonce 保存退出确认，未强杀。用户所述无法关闭时 UIA 确认关闭行为为隐藏到托盘，不能据此断言本地保存失败。通过应用自身设置临时直接退出并正常退出后，启动 canonical `Programs\FocusMatrix\FocusMatrix.exe`；最终关闭行为仍为原 tray，桌面快捷方式及原开机启动项均指向 canonical 路径。
- 该次检查前备份 backups/20261017-220130-018-51bdd1；历史 `version-1792246125727159200-2.json` 是用户当次手动保存的最新内容，含 1 项较磁盘备份更新的勾选和额外 3 个备忘日期。禁止直接用较早整表覆盖该历史中的新内容。本次在正常保存退出并备份后，仅补回该 1 项完整任务状态及缺失的 2026-10-16/17/18 备忘日期，保留当前仓库、其他任务、设置和窗口状态。补回前备份 backups/20261017-222045-845-96f80b，最终完整备份 backups/20261017-222230-169-f15c00。未证明旧实例保存协议不响应及实时内容与磁盘差异的具体根因，不得归因为已证实的缓存或文件写入故障。
- 真实安装版最终核对：5 项较早完成的任务均从主界面收起且在仓库完整可查；其中 2 项已有相同完整归档，不重复添加，仓库从原 3 条增加到 6 条。主界面共 10 项（9 项未完成 + 今日新勾选 1 项），今日勾选的留到次日归档。手动历史中的全部 15 项任务可在当前主界面或仓库找到且逐字段相同，原 3 条仓库记录未改变，11 个备忘日期及原设置保留。最终安装版仓库布局和 253 个原历史文件校验通过；正常退出再重启完整 Store 字节不变、无重复归档，仅一个 canonical 实例，CDP 9236 关闭。云端仍报 HTTP 410，未改云端或凭据。详见 docs/daily-archive-verification-20261017.md。

- 2026-10-16 用户明确授权继续本机备份、恢复和更新后，已完成两次真实 `install-local.ps1` 更新及 `check-completed-installed.mjs --exact` 验收：从关闭状态安装的备份为 backups/20261016-185521-418-c22058；运行状态保存退出再更新的备份为 backups/20261016-185600-291-ce4780。15 条待办、3 条仓库记录、8 个备忘日期及原有历史完整保留（两次分别核对 243/245 个原历史文件），设置和窗口状态一致。正常退出临时实例并重启后完整 Store SHA-256 仍为 B95CB3D54CED9721A9865681C7C54C324A7AE8B9FC35BE57CED8259883CC19A2；云端写入/分享凭据身份及手机记录未变，只有一个正式实例，CDP 9236 已关闭。最终正式 exe SHA-256 E34F6567ED182ECF8CC444BC40724B3161936639ACC4589D0FC5A7AFE81D43E2。不能以更早整表覆盖后来新增内容。详细报告 docs/update-preservation-review-20261016.md。
- 本机数据目录实际启用 Windows EFS；PowerShell 默认编码误读中文以及 File.Replace/MoveFileEx 拒绝加密目录替换均已修复。原生保存和安装 helper 优先原子替换，遇到 Windows 17/1175/6002 错误改用先落盘的 payload + SHA-256 封印日志，目标写入中断时在下次启动/写入前恢复；未封印或损坏日志不能覆盖数据。保留加密属性，不解密目录；内容一致的更新恢复不重复替换文件。`*.pending-write*` 纳入数据备份并从源码归档排除。15 项原生测试在实际加密目录通过，PowerShell 加密目录双次写入及中断日志恢复通过。34 项 Vitest、隔离浏览器跨日/完整快照和 520/720/1200 安装版布局通过。

- 2026-10-16 更新数据保护修正：以更新前当前完整 Store 为唯一恢复基线，不拿更早的整表覆盖后来新增内容。`install-local.ps1` 使用 nonce/PID/协议号的保存退出确认，不允许固定等待后强制杀旧程序；旧版首次需先安全保存退出。停止后完整备份并恢复当前快照，新版在开启编辑/同步前逐字节核对并确认，失败保留现场后回退。`.update-session.json` 记录当前更新及本地日期保护，更新当天不触发额外归档，首个缺少日期标记的旧数据启动只建立日期，不清理已完成项。该规则替代之前首次升级立即归档的行为。
- 桌面本地读写改用 `src-tauri/src/local_data.rs` 与 `src/storage.ts` 的 Tauri 原生原子文件提交，文件路径和原 Store 格式不变；只提交变化字段，保存前历史及落盘成功后同步确认规则不变。不再因读取错误重建空数据；缺少任务字段、坏任务/备忘录/仓库必须停止写入。保留未知字段，归档仅改变目标任务、仓库和日期标记；`.focus-matrix.previous.json` 保留前一有效完整状态，并纳入更新备份。`npm run test:update` 与 `npm run check:completed` 只使用隔离测试数据。
- 本次腾讯官方 CLI 只读诊断：环境 NORMAL、体验版到期 2027-04-07、函数配置 Active，但 `AvailableStatus=InsufficientBalance`；公网 410 响应头 `x-cloudbase-upstream-type=Tencent-SCF_HTTP`、`x-cloudbase-upstream-status-code=410`。腾讯云 SCF 官方状态码定义 410 为账户余额不足停服，因此不是已证实的默认域名到期，也不能用重新配对/换链接解决。需用户核对腾讯云费用中心的余额和账单；未充值、购买、变更套餐或清除数据库/凭据。云同步目前不能声称恢复。

- 2026-10-16 新增跨日已完成仓库：本地 Store 的 `completedTasks` 保存完整任务快照和归档日期/时间，`taskDay` 保存已处理的本地日期。按本地日期跨日时收起此前已勾选的任务，首次升级只处理最后修改日期早于当天的完成项；重开、唤醒、托盘及写入失败重试均需兼容。仓库和剩余任务必须同次保存成功后才移除界面任务，不能提前确认云端同步。仓库不自动删除；恢复待办历史必须保留现有仓库。更新备份包含整个 Store，因此也包含仓库。仓库目前仅保存在本机，不加入云端只同步当前任务/备忘录的协议。`npm run check:completed` 只在隔离浏览器模拟日期和数据，不可更改系统时间测试真实任务。
- 本次正式构建及 install-local.ps1 更新成功，安装前备份 backups/20261016-124129-749-60ff7d。真实安装版验收：原 14 条任务完整保留为 11 条活跃任务及 3 条仓库记录，8 个备忘日期、设置、窗口状态和 237 个原历史文件核对通过。30 项 Vitest、跨日/重启/关机补归档/写入失败重试/搜索筛选隔离 UI 测试、520/720/1200 宽度安装版布局通过；正常重启后仓库仍在，临时 CDP 已关闭。正式 exe SHA-256 DD0DE11577D5D5A06C6A26A6B213D1B64193BDA6E0F3EF2E5E676A4137E14752。验收时现有腾讯 API 健康接口和安装版同步均返回 HTTP 410，未修改云端域名或部署；不能声称云同步正常，本地内容、待同步请求和绑定仍保留。详细记录 docs/completed-repository-20261016.md。

- 用户要求保留每个软件版本。从 2026-10-08 起，每次修改软件前及更新完成后运行 `npm run version:save -- "版本说明"`；桌面安装和 Android 构建脚本也会自动保存源码。该命令提交当前未忽略源码，创建不可覆盖的 `versions/` 标签及 `outputs/source-versions/` 源码 ZIP、提交哈希和 SHA-256 清单，失败时停止更新。禁止自动删除标签、提交历史或归档。源码归档不替代原有用户数据备份；不允许提交密钥、签名或任务数据。历史缺失的版本不能声称已恢复。

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
- 2026-10-07 已用腾讯官方 CloudBase CLI 3.8.5 成功执行 cloudbase/ 下的 `tcb config update fn focus-matrix-api`，交互选择合并环境变量。原配置 instanceConcurrencyConfig 仅有空 dynamicEnabled，触发 FailedOperation.MaxConcurrency；移除此空配置后更新成功，保留云端现有并发参数。读取云端函数确认 Active，TCB_ENV、PUBLIC_ORIGIN、CLOUDBASE_API_KEY、FOCUS_MATRIX_WRITE_TOKEN 四项均与本地匹配，密钥值未输出。本地 cloudbase/cloudbaserc.json 含服务端密钥，已在 .gitignore 中，禁止发布或复制到客户端。该次更新未触碰用户任务数据或安装版。当前配置的 tcloudbaseapp.com 地址 /api/health 与 /api/plan 无代理访问仍为 HTML 404；CLI service list 存在 /api → focus-matrix-api，但公网入口路由/域名尚未验收，不能声称手机同步恢复，也不能切换正式客户端地址。
- 2026-10-07 桌面正式版已通过 `npm run tauri build -- --no-bundle` 构建，并经 `scripts/install-local.ps1` 更新、正常重启。备份目录为 backups/20261007-223818-707-b8b1ed；任务、日期备忘录、设置和窗口状态核对通过。新正式 API 为 https://matrix-d4ggytzjuc8ad872a-1323076267.ap-shanghai.app.tcloudbase.com；原 tcloudbaseapp.com 是错误的静态入口。用户已明确批准向其 CloudBase 迁移原云端任务、备忘录、版本、分享权限及设备绑定；已先生成当前用户 DPAPI 加密云快照备份，逐表验证迁移成功，原 Sites DB 未删除。腾讯函数沿用原桌面 DPAPI 写入密钥，原分享令牌及设备哈希不变。现有 Sites project_id 不变，版本 7（a842276c5dbe63aa484828a4bc0465ef085761cf）已发布，旧 API 代理至腾讯，避免双库分裂。
- CloudBase 使用 public.focus_matrix_commit RPC 原子提交内容、不可覆盖版本、编辑日志及回执；迁移 SQL 和自动回滚测试位于 cloudbase/migrations/20261007223000_atomic_sync_commit.sql、cloudbase/tests/atomic-sync.sql。Windows 应直接 `node .cloud-tools/cloudbase/node_modules/@cloudbase/cli/bin/tcb ...` 调用官方 CLI，避免 .cmd 包装器损坏 JSON 引号和多行 SQL。
- 新 API 无代理健康、匿名权限、真实安装版内容一致、编辑撤权、临时设备配对/撤销、APK 哈希检查均通过。16 项 Vitest、8 项 Rust 测试、APK 资源/离线浏览器检查通过。桌面 520/720/1200 宽度无溢出，临时 CDP 已关闭。
- Android 1.0.4（versionCode 5）APK 已构建，包名及原签名不变，HTTPS IndexedDB origin 仍为原 chatgpt.site，API 改为腾讯。新域名链接可识别且打开时归一到原存储来源。只构建了更新包，未在真实手机覆盖安装；旧 APK 仍使用旧 API，需 install -r 或由手机用户覆盖安装，不能清数据。新版签名 APK SHA-256：448B5F21AD2AC402E6850DE79BDC3FF0DBA1F6745FB1C7F3848FB49632C9D5FA。
- 腾讯默认 app.tcloudbase.com 域名的浏览器导航实测返回平台“页面访问提示”（HTTP 404），普通资源请求附 Content-Disposition: attachment；真实公网网页浏览器验收未通过，不能声称分享网页已稳定可用。JSON API 与 APK 内置页面同步不受本次观察到的导航提示影响。下一步需要符合腾讯要求的正式网页域名或已授权正式免费静态托管前端，不可绕过平台提示，也不要把 Node fetch 200 当作浏览器页面通过。桌面“Focus Matrix 安卓部署”快捷方式只是 ADB 安装辅助工具，日常启动用“Focus Matrix”。

- 2026-10-09 修复云端弹窗将初始加载/配置读取失败误报为“尚未配置”并隐藏真实错误的问题；配置读取可独立重试，首次同步等启动读取完成再安排，设备缓存先恢复显示，联网错误保留 HTTP/超时/连接失败原因。原安装版受控重启后持续故障未复现，不能断言已查明最初一次读取失败的原因。真实 API 无代理健康 200、匿名同步 401、已有凭据读取 200，云端与本地任务/备忘录一致。21 项 Vitest、11 项 Rust、4 项源码归档测试和隔离浏览器启动场景通过；Vitest 仅收集 src，归档测试用 version:test。已正式构建并用 install-local.ps1 更新，备份 backups/20261009-100812-744-6a17fb；7 条任务、5 个备忘日期、设置/窗口状态及 100 个原历史文件核对通过。第一次安装因备份期间同步写入凭据触发校验停止，停止旧程序后重新备份安装成功。服务端 5 条设备记录均为已撤销，本次未配对/撤销设备，不能称为 5 台已绑定手机。未部署或更换云端地址，分享网页导航限制仍需另行解决。详细报告 docs/cloud-sync-startup-review-20261009.md。
- 该次最终正常重启后新增 1 条任务，原 7 条任务完整保留，最终 8 条与云端一致；额外备份 backups/20261009-101042-038-22d015。临时 CDP 和隔离测试服务器均已关闭。不能因实时新增内容与安装前快照不同而回滚用户的新任务。

- 2026-10-13 用户要求查找原有可转发、接收端自动更新的版本。精确找到网页 Sites 版本 1（4e70728ac86afb425044d7c8d815ca90f36c5904，2026-10-06 12:57），固定只读链接每 30 秒刷新并监听 visibilitychange。已在 outputs/recovered-versions/20261013-original-live-share/share-site-v1 建立独立 Git 仓库，分支 codex/original-live-share-20261006；另保存源码 ZIP、桌面和网页完整历史 bundle、校验清单、原备份中的候选旧 exe。候选 exe 来自 backups/20261006-131733-806-33d702，SHA-256 09E32E944ED45D6C207B4149E75619F06EABF22F9C1D2062631561CDE33B4EE8；10 月 6 日桌面源码缺少完整提交，不能称为已恢复精确匹配的桌面源码，候选 exe 未运行/安装。旧网页未修改源码的隔离测试确认同一链接约 30 秒自动更新、可见时刷新、故障保留和恢复更新、分享撤销清空显示。当前安装版受控重启后读取原凭据并恢复分享链接，未轮换凭据或权限；检查前备份 backups/20261013-135846-960-5b70f0。旧 Sites 普通网络直连仍 HTTP 403，腾讯健康 200；未发布/回退网站、切换域名或安装旧版，不能称为恢复了公网分享。详细说明 docs/share-version-recovery-20261013.md。
