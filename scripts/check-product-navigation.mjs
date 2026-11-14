// Isolated browser acceptance: no installed app, real user files or cloud writes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { extname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'vite';

const port = async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return value;
};
const webPort = await port(), debugPort = await port();
const origin = `http://127.0.0.1:${webPort}`;
await mkdir('outputs', { recursive: true });
const profile = await mkdtemp(join(process.cwd(), 'outputs', 'product-browser-'));
const site = join(profile, 'site');
await build({ configFile: 'vite.config.ts', build: { outDir: site, emptyOutDir: true,
  rollupOptions: { input: 'calendar-preview.html' } } });
const server = createHttpServer(async (request, response) => {
  const name = new URL(request.url, origin).pathname;
  if (name === '/favicon.ico') { response.writeHead(204).end(); return; }
  const path = resolve(site, `.${decodeURIComponent(name === '/' ? '/calendar-preview.html' : name)}`);
  if (!path.startsWith(site + '\\')) { response.writeHead(403).end(); return; }
  try {
    const content = await readFile(path);
    response.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(path)] ?? 'application/octet-stream' });
    response.end(content);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(webPort, '127.0.0.1', resolve));
const browser = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', '--no-proxy-server',
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore', windowsHide: true });
let socket, id = 0;
const pending = new Map(), errors = [];
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const key = ++id; pending.set(key, { resolve, reject });
  socket.send(JSON.stringify({ id: key, method, params }));
});
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
};
const wait = async expression => {
  for (let n = 0; n < 300; n++) { if (await evaluate(`Boolean(${expression})`)) return; await delay(100); }
  throw Error(`Timed out: ${expression}; ${JSON.stringify(errors)}; fixture page: ${await evaluate('document.body.innerText')}`);
};
try {
  let page;
  for (let n = 0; n < 100; n++) {
    try {
      await fetch(origin);
      page = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(p => p.type === 'page');
    } catch { /* Starting. */ }
    if (page) break; await delay(100);
  }
  assert.ok(page, 'Browser/server did not start');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data), callback = pending.get(message.id);
    if (callback) { pending.delete(message.id); message.error ? callback.reject(Error(message.error.message)) : callback.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(arg => arg.value ?? arg.description).join(' '));
    if (message.method === 'Network.loadingFailed') errors.push(message.params.errorText);
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) errors.push(`${message.params.response.status} ${message.params.response.url}`);
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  const click = async selector => {
    await wait(`document.querySelector(${JSON.stringify(selector)})?.disabled === false`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const key = async (name, code, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: code, modifiers });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: code, modifiers });
  };
  const choose = async (label, value) => evaluate(`(() => {
    const control = [...document.querySelectorAll('.setting-row')].find(row => row.querySelector('strong')?.textContent === ${JSON.stringify(label)}).querySelector('select');
    control.value = ${JSON.stringify(value)};
    control.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const shot = async name => writeFile(`outputs/product-navigation-${name}.png`, Buffer.from((await send('Page.captureScreenshot')).data, 'base64'));
  const size = (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const fits = selector => evaluate(`(() => {
    const root = document.querySelector(${JSON.stringify(selector)});
    const bounds = root.getBoundingClientRect();
    return bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth + 1 &&
      bounds.bottom <= innerHeight + 1 && root.scrollWidth <= root.clientWidth + 1 &&
      document.documentElement.scrollWidth <= innerWidth + 1 &&
      [...root.querySelectorAll('button')].every(button => {
        const box = button.getBoundingClientRect();
        return box.left >= bounds.left && box.right <= bounds.right + 1;
      });
  })()`);

  await size(720, 480);
  const navigation = await send('Page.navigate', { url: `${origin}/calendar-preview.html` });
  assert.equal(navigation.errorText, undefined);
  await wait("document.querySelector('.import-button')?.disabled === false");
  const actionLabels = () => evaluate("[...document.querySelectorAll('.title-actions button')].map(button => button.textContent.trim())");
  assert.deepEqual(await actionLabels(), ['导入信息', '保存', '历史与仓库', '同步与分享', '⚙']);
  await wait("/本地.*(云端|已同步|本机使用)/.test(document.querySelector('.title-status').textContent)");

  await click('.calendar-button');
  await wait("document.querySelector('.calendar-panel')");
  assert.deepEqual(await actionLabels(), ['导入信息', '保存', '历史与仓库', '同步与分享', '⚙']);
  await click('.import-button');
  await wait("document.querySelector('.chat-import')");
  await click('.chat-back');
  await wait("!document.querySelector('.chat-import')");
  if (await evaluate("Boolean(document.querySelector('.calendar-panel'))")) await click('.calendar-button');
  await wait("document.querySelector('.matrix')");
  await click('.import-button');
  await wait("document.querySelector('.chat-import')");
  await click('.chat-back');
  await wait("!document.querySelector('.chat-import')");

  await click('.records-button');
  await wait("document.querySelector('.history-modal .records-tabs button[aria-pressed=true]')?.textContent === '待办历史'");
  await click('.records-tabs button:nth-child(2)');
  await wait("document.querySelector('.completed-modal input[type=search]')");
  await click('.records-tabs button:first-child');
  await wait("document.querySelector('.history-modal .history-restore')");
  await key('Escape', 27);
  await wait("!document.querySelector('.history-modal')");
  await click('.cloud-button');
  await wait("document.querySelector('.cloud-description')?.textContent.includes('小时备忘录、日记、子任务、归档和附件')");
  await click('.cloud-tabs button:nth-child(2)');
  await wait("document.querySelector('.cloud-tabs button:nth-child(2)').getAttribute('aria-pressed') === 'true'");
  await key('Escape', 27);
  await wait("!document.querySelector('.cloud-modal')");

  await evaluate("document.querySelector('.settings-button').focus()");
  await click('.settings-button');
  await wait("document.querySelector('.settings-modal')");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.settings-group-title')].map(item => item.textContent)"),
    ['窗口与启动', '外观与排版', '数据与记录', '同步与分享', '智能识别与提醒']);
  await key('Tab', 9, 8);
  assert.equal(await evaluate("document.activeElement.textContent"), '完成');
  await key('Tab', 9);
  assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"), '关闭设置');
  await choose('主题', 'warm-gray');
  await choose('间距', 'compact');
  await wait("document.querySelector('.theme-warm-gray.density-compact') && JSON.parse(sessionStorage.getItem('calendar-check-data')).settings.density === 'compact'");
  await key('Escape', 27);
  await wait("!document.querySelector('.settings-modal')");
  assert.equal(await evaluate("document.activeElement.className"), 'settings-button');

  await send('Page.reload');
  await wait("document.querySelector('.theme-warm-gray.density-compact') && document.querySelector('.settings-button')?.disabled === false");
  for (const [width, height] of [[520, 360], [720, 480], [1200, 760]]) {
    await size(width, height);
    assert.ok(await fits('.title-bar'), `toolbar width ${width}`);
    await shot(String(width));
  }

  // 720 × 480 physical pixels at 200% scaling yields 360 × 240 CSS pixels.
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 240, deviceScaleFactor: 2, mobile: false });
  assert.equal(await evaluate('devicePixelRatio'), 2);
  assert.ok(await fits('.title-bar'), 'toolbar at zoom');
  await click('.settings-button');
  await wait("document.querySelector('.settings-modal')");
  assert.ok(await fits('.settings-modal'), 'settings at zoom');
  await choose('主题', 'light');
  await wait("document.querySelector('.theme-light.density-compact')");
  await shot('zoom-200');
  await key('Escape', 27);
  await wait("!document.querySelector('.settings-modal')");
  assert.deepEqual(errors, []);
  console.log('Product navigation, local and cloud status, grouped settings, theme/density reload, keyboard focus, and responsive layout: OK');
} finally {
  socket?.close();
  browser.kill();
  await new Promise(resolve => server.close(resolve));
}
