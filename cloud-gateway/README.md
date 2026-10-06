# Focus Matrix 免费公网入口

这个目录部署在腾讯 EdgeOne Makers 免费账号中，云函数直接访问现有 Sites/D1 后端。它不依赖电脑开机，不更换原数据库，不包含或保管电脑写入密钥。所有设备与分享请求仍使用原设备/分享权限，手机历史和 IndexedDB origin 不变。

原 chatgpt.site 地址已在普通网络复现 Cloudflare HTML 403。电脑系统代理访问成功不能作为手机普通网络可用的验收依据。云端入口的实际访问情况必须再验证，不保证仅更换主机即可消除上游拦截。

正式部署步骤：

1. 用已安装的 `.cloud-tools/edgeone/node_modules/.bin/edgeone.cmd login --site china --local` 完成官方登录。看到控制台不代表 CLI 授权完成；`whoami` 必须成功。
2. 如果已经临时部署，先在本目录完成官方认领，执行 `edgeone makers claim` 确认归属。后续更新同一个项目，不要反复新建。
3. `node --test test.mjs` 检查转发限制、原权限、旧 Android origin 的 CORS、链接令牌保留、非 JSON 拦截和回源健康。
4. 正式部署选择可访问的加速区域，检查默认域名和对应云函数地域。若普通网络仍被限制，不安装客户端、不声称问题已修复。
5. 取得不带 eo_token、不依赖预览时效的正式域名，用普通网络访问首页、分享入口和 `/api/health`。只有 upstreamReachable 为 true 才执行根目录 `node scripts/configure-public-cloud.mjs https://实际正式域名`。
6. 构建手机 APK 和正式 Tauri custom-protocol exe。保留包名、原签名和原 HTTPS IndexedDB origin。使用 `scripts/install-local.ps1` 先备份再更新；APK 只覆盖安装。
7. 验证手机配对、原分享编辑权限、撤销权限、用户内容不变；关闭电脑后另一网络仍能读取云端，重启电脑后补齐同步。无法启动的设备只能在重新启动/联网后接收更新。

临时预览不用于正式配对或分享，不能写入 publicCloudConfig.json。托管账号凭据位于官方 CLI 的 `.edgeone/` 配置中，禁止提交或上传。源代码中只有公开地址，没有用户计划或写入凭据。

官方说明：https://pages.edgeone.ai/document/edgeone-cli 、 https://pages.edgeone.ai/document/quick-launch-via-login-free-deployment-in-workbuddy
