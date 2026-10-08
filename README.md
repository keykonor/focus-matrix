# Focus Matrix

Windows 桌面艾森豪威尔矩阵便笺，使用 Tauri 2、React 和 TypeScript。默认 720 × 480，可缩小到 520 × 360。

## 开发与构建

要求 Node.js、Rust MSVC 工具链、Visual Studio C++ Build Tools 和 Windows SDK。当前工作区已安装项目内 Rust 工具链，`npm run tauri ...` 会自动使用它；在其他电脑上也可使用全局 Rust。

```powershell
npm install
npm run tauri dev
npm test
npm run build
npm run tauri build
npm run tauri build -- --no-bundle
```

运行 `npm run tauri dev` 时，也可以执行 `npm run check:ui`。此检查使用本机 Edge 渲染带示例任务的预览页，核对默认窗口、最小窗口、密集任务和设置弹窗是否发生横向溢出或文字遮挡。

前端开发服务运行后，执行 `npm run check:calendar` 检查日期、三段备忘录、自动保存、跨日同步、页面开关状态及小窗口布局。此检查使用 Tauri 官方模拟接口和独立测试数据，不访问用户的任务文件。

该界面检查同时验证历史版本手动保存、任务和备忘录恢复、撤回恢复、重启保留及恢复失败时的内容保护。`npm test` 检查版本保存失败时不覆盖当前数据；项目内 Cargo 的 `test --manifest-path src-tauri/Cargo.toml --lib` 检查实际版本文件读写和旧备份读取。

`npm run tauri build -- --no-bundle` 直接生成 `src-tauri/target/release/focus-matrix.exe`。`npm run tauri build` 还会尝试下载 NSIS 并生成安装包，需要构建机能访问该下载源。开发模式不会把依赖 Vite 的调试程序注册为开机启动项。

更新当前电脑的安装版时，运行 `powershell -ExecutionPolicy Bypass -File scripts/install-local.ps1`。脚本先保存并校验任务、设置、窗口状态和旧版 exe，再替换程序；备份失败会中止更新。仅需备份时运行 `powershell -ExecutionPolicy Bypass -File scripts/backup-before-update.ps1`。备份保留在 `%APPDATA%\com.focusmatrix.desktop\backups\`，不会自动删除。

## 软件版本保留

每次运行桌面更新脚本 `scripts/install-local.ps1` 或 Android 构建脚本 `scripts/build-android.ps1`，会先保存当前完整源码：提交所有未忽略的源码修改，创建唯一的 `versions/` Git 标签，再生成源码压缩包及 SHA-256 清单。任一步失败都会停止后续更新。标签和压缩包不自动覆盖或删除。

```powershell
npm run version:save -- "本次版本说明"
npm run version:list
npm run version:test
```

源码压缩包位于项目内 `outputs/source-versions/`，每个版本一个独立目录。可解压对应的 `source.zip` 到新文件夹查看、构建旧版；也可使用 `git show <版本标签>:<文件路径>` 查看某个旧文件。请勿通过清空任务数据或卸载手机应用恢复软件版本。

源码归档不包含用户任务、备忘录、密钥、签名文件和安装包。桌面更新前的程序及用户数据继续保存在 `%APPDATA%\com.focusmatrix.desktop\backups\`；Android 旧 APK 继续保存在 `outputs/android-versions/`。应用内“历史”用于恢复任务和备忘录。这些记录均不自动删除；此前未保存的版本无法凭空补回。所有备份目前仅保存在这台电脑，重要版本建议另行复制到其他磁盘。

## 使用

- 点击顶部“历史”查看以前的任务和日期备忘录。编辑内容后，400 毫秒自动保存时会保留一个完整内容版本；删除或修改过的内容可从旧版本恢复。也可以点击“保存当前版本”手动留下记录。
- 历史界面先预览任务和备忘录，选择“恢复此版本”并确认即可恢复。恢复前会自动保留当前内容，可再次选择“恢复前的内容”撤回恢复。恢复不会改动当前设置和窗口位置。
- 升级前保留的数据备份也会显示在历史列表。版本文件位于 `%APPDATA%\com.focusmatrix.desktop\history\`，不会自动删除；当前软件更新备份也包含此目录。该功能可以恢复已保存的版本，无法还原以前从未保存或没有备份的内容。
- 点击左上角日期按钮进入日历，点击日期可填写当天的早上、下午、晚上备忘录。可切换月份，点击“回到今天”回到系统当天；页面在跨日及电脑恢复后同步日期。点击日期按钮或“返回矩阵”关闭日期界面。
- 日期界面的打开或关闭状态会保存，下次启动保持上次状态。每日备忘录自动保存，支持换行，按日期分别保留。
- 点击象限空白处或“添加任务”新建任务，直接在任务文字中编辑。长文字会自动换行并展开高度；Enter 在当前任务后新建一项，Shift+Enter 在当前任务内换行。
- 勾选完成；点任务右侧 × 删除。空白任务失焦后会自动移除。
- 拖动任务左侧手柄可移动到其他象限。
- 点击右上设置图标可修改开机启动、桌面底层、置顶、关闭行为、字体、透明度和已完成任务的显示状态。默认使用 90% 不透明度及桌面底层模式。桌面底层模式会将便笺放在 Explorer 桌面之上、普通窗口之下；编辑时仍可单击便笺，失焦后恢复底层。
- 默认点击系统窗口 × 会隐藏到托盘；托盘菜单提供显示、隐藏、设置、退出。退出前会刷新待保存的数据。
- Windows 登录后，开机启动项会以 `--autostart` 参数显示主窗口；再次打开桌面快捷方式会显示已有窗口，不会创建第二个实例。

当前用户安装位置为 `%LOCALAPPDATA%\Programs\FocusMatrix\FocusMatrix.exe`，桌面快捷方式和开机启动项均指向此处。使用无空格的路径，避免 Windows 启动注册表在解析程序路径时产生歧义。

## 本地数据

桌面端联网遵循 Windows 已配置的系统代理，不修改系统网络设置。分享配置写入时会保留 `.cloud-config.previous.bin` 加密旧副本并校验落盘结果，以兼容重定向的 Windows 用户目录。

右上角“分享”支持可编辑链接。知道完整链接的人可访问当前任务和日期备忘录；开启“允许对方编辑”后，可以新增、修改、完成、删除任务，修改日期备忘录。编辑项下方显示署名与时间，展开可查看修改前后内容和高亮文字。“修改记录”还保留已删除项的变更。署名由编辑者填写，不等同于实名认证。

电脑、手机与云端双向同步，在线每 10 秒检查更新；修改先保存本地，再同步。不同字段修改自动合并，同一段文字冲突保留两份。每个设备保存离线草稿、已同步基线与待重试请求，服务端以请求编号防止重复写入。电脑收到远程修改后先保留历史并保存内容，再确认新基线。关闭分享仅撤销分享链接，不断开已配对手机；设备列表可单独断开手机。设置、窗口状态和电脑旧历史不上传；云端保存本次更新之后产生的内容版本和编辑日志，不自动删除。

完整分享链接的令牌只位于 URL 的 # 片段，API 使用 Authorization；页面禁止索引和 referrer。电脑写入密钥使用 Windows 当前用户 DPAPI 加密保存在 .cloud-config.bin，不进入前端或源码。服务器只允许电脑管理分享与配对，手机凭据只能同步，分享访客只能在授权时编辑。云端项目 cloud-site/ 复用原 Sites 站点和 D1 数据库。

## 安卓版

安装包：outputs/FocusMatrix-Android.apk，线上同名下载地址位于云端站点的 /downloads/FocusMatrix-Android.apk。支持 Android 8.0 及以上，需要较新的 Android System WebView。

1. 在安卓手机上下载 APK，按手机提示允许浏览器安装应用。
2. 电脑打开“分享” → “连接安卓手机”，复制配对链接；链接 10 分钟有效，只能使用一次。
3. 打开手机 Focus Matrix，输入手机名称并粘贴配对链接，点击“连接电脑”。
4. 四象限和日期备忘录均可编辑；断网时保存到手机，联网后合并同步。版本页面可恢复该手机以前保存的内容，恢复会同步到其他设备。

安卓版采用 Android 官方 WebView 与内置 React 静态资源，无大型原生框架，首屏离线可打开。使用同一 HTTPS 站点访问 API，无明文网络和 JavaScript 原生桥接。Android 33+ 处理系统返回手势，Android 36 处理状态栏、刘海和键盘边距。手机本地内容不上传 Android 系统备份；请保留应用数据，更新 APK 时覆盖安装，不要卸载。WebView 内“导出内容”提供 JSON 文本复制备份，不含手机凭据。

构建工具在项目 .android-tools/：JDK 21、Android platform 36、build-tools 36，来自官方源并校验哈希。运行 scripts/setup-android-tools.ps1 的 jdk/platform/build-tools 三个选项安装，再执行 scripts/build-android.ps1。旧 APK 保留于 outputs/android-versions/；签名密钥和加密密码在 mobile-app/signing/，须保留以便后续更新，禁止上传。云端发布前先重新构建 APK，再构建 cloud-site，使下载文件和页面与源码一致。

检查：npm test（任务、日期、存储和冲突合并）；项目 Rust cargo test（历史与 DPAPI 凭据兼容）；scripts/check-sync-api.mjs（隔离本地 D1 API）；scripts/check-mobile-ui.mjs（Edge 手机布局、离线恢复、重连、标注和弹窗）。还未在真实安卓手机上安装验证；APK 已校验 v2/v3 签名、安装包元数据及对齐。

任务、设置和每日备忘录保存在 Tauri Store 的 `%APPDATA%\com.focusmatrix.desktop\focus-matrix.json`。每日备忘录使用 `dailyMemos` 字段，日期界面状态使用设置中的 `calendarOpen` 字段；旧版数据无需迁移即可读取。窗口位置和大小由 Window State 插件保存在应用配置目录的 `.window-state.json`。Store 文件无法解析时，会先备份为 `focus-matrix.corrupt-<时间戳>.json`，再使用默认值启动。任务、设置与备忘录修改后 400 毫秒自动保存；窗口移动或改变大小后 600 毫秒保存。

## 目录

```text
src/                     React 界面、数据模型、Store 访问和基础测试
src/components/          TitleBar、Quadrant、TaskItem、SettingsModal
src-tauri/src/           Windows 托盘、应用命令及入口
src-tauri/capabilities/  Tauri 权限
src-tauri/icons/         应用和托盘图标
scripts/                 项目内 Rust 工具链启动包装脚本
```

## Android 1.0.1 启动修复

1.0.0 的 Windows aapt2 把 APK 资源条目打包成反斜杠路径，导致 Android AssetManager 读取内置首页时返回不存在。1.0.1 在签名前统一改成正斜杠，并用 Activity 共用的 BundledPage 读取器从实际 APK 检查首页和所有引用的 JS/CSS；资源缺失会中止构建。Activity 使用 loadDataWithBaseURL 直接加载安装包内 HTML，保留原 HTTPS origin 及 IndexedDB 数据。

覆盖安装 1.0.1 即可，包名和原签名保持不变，禁止先卸载。旧 APK 继续保留在 outputs/android-versions/。scripts/check-apk-ui.ps1 直接解包签名 APK，在阻断所有非内置资源请求的浏览器中检查首次打开、离线数据恢复、编辑、重启和长文字布局；此检查不等同于 Android 真机测试。

## Android 1.0.2 链接连接修复

配对输入框现可识别电脑生成的完整配对链接、配对码及分享链接。分享链接显示“打开共享计划”，仅按分享权限访问，不能成为管理手机的凭据。下载地址、缺少 # 连接码、陌生域名和错误格式均显示中文提示；非空链接可点击后查看原因，不再无提示地禁用按钮。内置页面校验固定云端域名，避免依赖 Android WebView 的 location.origin。

使用原包名、签名和 HTTPS 本地存储 origin 覆盖安装 1.0.2，不卸载、不清数据。手机与电脑通过云端同步，需双方能访问云端；电脑打开“分享 → 连接安卓手机 → 复制配对链接”，手机在 10 分钟内连接。旧链接已使用或过期时生成新的链接。旧 APK 保留在 outputs/android-versions/。

请求超时使用 AbortController，兼容缺少 AbortSignal.timeout 的旧 WebView。网络中断、HTTP 非 JSON 响应和配对链接过期会显示中文原因。scripts/check-apk-ui.ps1 检查从实际签名 APK 提取的连接界面，包括分享权限分支、正确配对、过期重试、HTTP 403、旧 WebView 超时能力、离线恢复及文本布局；测试浏览器使用独立资料目录和动态端口，结束后关闭。


## 一键安装到 Android 手机

双击项目根目录 Deploy-Android.cmd，或桌面“Focus Matrix 安卓部署”快捷方式。默认自动选择唯一已授权手机，顺序为构建最新版 APK、连接手机、adb install -r 覆盖安装、核对安装版本、启动 MainActivity。多台手机时需要明确选择，不会同时安装。失败立即停止，禁止自动卸载、清数据、降级或绕过手机授权。

USB：连接能传输数据的数据线，手机开启“开发人员选项 → USB 调试”，解锁后允许该电脑。HDB 或文件传输授权不能替代 USB 调试授权。荣耀手机如 USB 调试自动关闭，可在开发人员选项开启“仅充电模式下允许 ADB 调试”后重试。

无线：Android 11+，电脑与手机处于同一 Wi-Fi，开启“无线调试”。首次在部署窗口选择无线，输入手机“使用配对码配对设备”页面的 IP:配对端口，配对码隐藏输入且不保存；之后输入无线调试主页面的 IP:连接端口，两种端口通常不同。已有配对会尝试 mDNS 自动发现，无需扫描整个网段。手机仍需自行批准首次调试授权，这是 Android 官方保护机制。

命令：
```powershell
# 构建并通过 USB 安装、启动
.\scripts\deploy-android.ps1 -Connection USB
# 无线配对、连接并安装（会提示输入配对码）
.\scripts\deploy-android.ps1 -Connection Wireless -PairAddress 192.168.1.8:37123 -ConnectAddress 192.168.1.8:39861
# 多台设备时指定目标；连接失败后复用已构建 APK
.\scripts\deploy-android.ps1 -Connection USB -Device YOUR_SERIAL -SkipBuild
# 部署保护逻辑测试
.\scripts\test-android-deploy.ps1
```

ADB 为 Google 官方 Platform Tools，安装在 .android-tools/platform-tools/platform-tools/，元数据来自官方 repository2-1.xml 并核对官方包校验值。不需要 Android Studio。签名密钥、包名和手机存储域名继续保留，旧 APK 仍归档。应用安装与 Focus Matrix 云端配对不同：首次同步需在手机 App 内输入电脑软件生成的配对链接。

官方说明：https://developer.android.com/tools/adb

如果 USB 文件传输正常而 ADB 仍未授权，可先运行 `.\scripts\copy-apk-to-phone.ps1 -PhoneName 荣耀Magic7`，将当前 APK 传到手机 Download，然后在手机文件管理中点击覆盖安装。此方式只是传送安装包，不能代替自动安装、启动或手机调试授权；输出会明确说明。手机上的旧 APK 保留，新文件名包含版本、时间及随机后缀。MTP 文件大小必须读取 `System.Size`，普通 Shell FolderItem.Size 在此设备返回 0。安装参数使用项目内 ASCII 相对路径，以避免中文绝对路径的兼容问题。


## Android 1.0.3 长期绑定与链接入口

电脑顶部“分享链接”和“手机连接”分别显示对应链接。首次连接链接仅在 10 分钟内可使用一次；手机领取的设备凭据没有到期时间。链接过期、电脑关机/离线、关闭分享或应用升级均不会自动解除手机绑定。桌面设备记录和首次链接缓存在 DPAPI 加密配置内，离线时显示上次记录，不把网络失败当成取消绑定。

手机独立显示“已绑定电脑 · 长期有效”和网络同步状态。手机可通过“取消连接”主动解绑，先保存本地取消状态，再用 /api/devices/self 仅撤销自己的凭据；离线时保留待确认取消请求，不再上传计划。任务、备忘录、同步基线和本机历史不清空，重新配对使用三方合并保留离线草稿。分享访客无设备管理或自取消接口权限。

保留 com.focusmatrix.mobile、原签名及 HTTPS 存储 origin，用新版 APK 覆盖安装即可。电脑离线时手机仍与云端同步；电脑恢复联网后补齐更新。
