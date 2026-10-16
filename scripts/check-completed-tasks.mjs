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
const profile = await mkdtemp(join(process.cwd(), 'outputs', 'completed-browser-'));
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
const data = () => evaluate("JSON.parse(sessionStorage.getItem('calendar-check-data'))");
const task = (id, completed) => ({ id, text: `${id} 的完整内容\n第二行 ` + '超长任务自动换行。'.repeat(30), completed,
  quadrant: 'important-urgent', createdAt: '2026-10-16T08:00:00+08:00', updatedAt: '2026-10-16T20:00:00+08:00' });
const seed = { tasks: [task('已完成甲', true), task('未完成', false), task('已完成乙', true)],
  settings: { autostart: false, alwaysOnTop: false, desktopMode: false, opacity: 90, fontSize: 'large', showCompleted: true, closeBehavior: 'tray', calendarOpen: false },
  dailyMemos: { '2026-10-16': { morning: '必须保留的备忘录', afternoon: '', evening: '', updatedAt: '2026-10-16T08:00:00+08:00' } },
  taskDay: '2026-10-16', completedTasks: [{ id: 'previous-archive', task: task('原有仓库记录', true), archivedAt: '2026-10-15T08:00:00+08:00', archivedDate: '2026-10-15' }] };
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
  await send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Shanghai' });
  await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 480, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `if (location.origin === ${JSON.stringify(origin)}) {
    if (!sessionStorage.getItem('calendar-check-data')) sessionStorage.setItem('calendar-check-data', ${JSON.stringify(JSON.stringify(seed))});
    const RealDate = Date;
    window.setTestDay = value => {
      sessionStorage.setItem('repository-clock', value);
      const time = RealDate.parse(value);
      window.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [time])); } static now() { return time; } };
      window.dispatchEvent(new Event('focus'));
    };
    window.setTestDay(sessionStorage.getItem('repository-clock') || '2026-10-16T23:58:00+08:00');
  }` });
  const navigation = await send('Page.navigate', { url: `${origin}/calendar-preview.html` });
  assert.equal(navigation.errorText, undefined, 'Fixture navigation failed');
  await wait("document.querySelectorAll('.task-item').length === 3 && document.querySelector('.calendar-button')?.disabled === false");
  await delay(600);
  assert.equal((await data()).completedTasks.length, 1);
  console.log('same-day completions remain visible: OK');

  await evaluate("sessionStorage.setItem('history-check-store-fail', '1'); window.setTestDay('2026-10-17T00:02:00+08:00')");
  await wait("document.querySelector('.save-error')");
  assert.equal(await evaluate("document.querySelectorAll('.task-item').length"), 3);
  assert.equal((await data()).tasks.length, 3);
  assert.equal((await data()).completedTasks.length, 1);
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await wait("JSON.parse(sessionStorage.getItem('calendar-check-data')).completedTasks.length === 3 && document.querySelectorAll('.task-item').length === 1");
  const archived = await data();
  assert.deepEqual(archived.tasks, [seed.tasks[1]]);
  assert.deepEqual(archived.completedTasks.slice(1).map(r => r.task), [seed.tasks[0], seed.tasks[2]]);
  assert.deepEqual(archived.dailyMemos, seed.dailyMemos);
  assert.deepEqual(archived.settings, seed.settings);
  assert.equal(await evaluate("document.querySelector('.save-error') === null"), true);
  console.log('midnight rollover, failed save keeps UI/data, retry preserves full records: OK');

  await send('Page.reload');
  await wait("document.querySelectorAll('.task-item').length === 1 && document.querySelector('.calendar-button')?.disabled === false");
  assert.deepEqual((await data()).completedTasks, archived.completedTasks);
  await evaluate("document.querySelector('.task-item input[type=checkbox]').click()");
  await delay(600);
  assert.equal((await data()).tasks[0].completed, true);
  assert.equal((await data()).completedTasks.length, 3);
  await evaluate("window.setTestDay('2026-10-18T00:01:00+08:00')");
  await wait("JSON.parse(sessionStorage.getItem('calendar-check-data')).completedTasks.length === 4 && document.querySelectorAll('.task-item').length === 0");
  console.log('restart without duplicates; newly checked task remains until its next day: OK');

  // Simulate a closed application across several days using isolated fixture data.
  await evaluate(`(() => { const data = JSON.parse(sessionStorage.getItem('calendar-check-data'));
    data.tasks = ${JSON.stringify([task('关机前已完成', true), task('关机前未完成', false)])};
    data.taskDay = '2026-10-18'; sessionStorage.setItem('calendar-check-data', JSON.stringify(data));
    sessionStorage.setItem('repository-clock', '2026-10-21T09:00:00+08:00'); })()`);
  await send('Page.reload');
  await wait("JSON.parse(sessionStorage.getItem('calendar-check-data')).completedTasks.length === 5 && document.querySelectorAll('.task-item').length === 1");
  assert.equal((await data()).tasks[0].id, '关机前未完成');
  await evaluate("document.querySelector('.completed-button').click()");
  await wait("document.querySelectorAll('.completed-record').length === 5");
  const typeSearch = async value => evaluate(`(() => { const field = document.querySelector('[aria-label="搜索已完成任务"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await typeSearch('已完成甲');
  await wait("document.querySelectorAll('.completed-record').length === 1");
  assert.equal(await evaluate("document.querySelector('.completed-record p').textContent"), seed.tasks[0].text);
  await typeSearch('');
  await wait("document.querySelectorAll('.completed-record').length === 5");
  await evaluate(`(() => { const field = document.querySelector('[type=date]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, '2026-10-17');
    field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await wait("document.querySelectorAll('.completed-record').length === 2");
  await evaluate("document.querySelector('.completed-filters button').click()");
  await wait("document.querySelectorAll('.completed-record').length === 5");
  console.log('closed-day catch-up, local repository reload, search and date filter: OK');

  for (const [width, height] of [[520, 360], [720, 480], [1200, 760]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await delay(150);
    const issues = await evaluate(`(() => {
      const issues = [];
      if (document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1) issues.push('page overflow');
      const start = document.querySelector('.title-start').getBoundingClientRect(), actions = document.querySelector('.title-actions').getBoundingClientRect();
      if (start.right > actions.left || actions.right > innerWidth) issues.push('toolbar overlap');
      for (const selector of ['.completed-modal', '.completed-list', '.completed-filters', '.completed-record p']) {
        for (const element of document.querySelectorAll(selector)) {
          const rect = element.getBoundingClientRect();
          if (element.scrollWidth > element.clientWidth + 1 || rect.left < 0 || rect.right > innerWidth + 1) issues.push(selector + ' overflow');
        }
      }
      return issues;
    })()`);
    assert.deepEqual(issues, [], `${width}x${height}`);
  }
  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile('outputs/completed-tasks-check.png', Buffer.from(screenshot.data, 'base64'));
  assert.deepEqual(errors, []);
  console.log('large font, multiline content and 520/720/1200 layouts: OK');
} finally {
  if (socket?.readyState === WebSocket.OPEN) { await send('Browser.close').catch(() => {}); socket.close(); }
  browser.kill(); await new Promise(resolve => server.close(resolve));
}
