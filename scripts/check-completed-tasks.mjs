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
    window.setTestDay = (value, notify = true, ticking = false) => {
      sessionStorage.setItem('repository-clock', value);
      const time = RealDate.parse(value);
      const started = performance.now();
      const clock = () => time + (ticking ? performance.now() - started : 0);
      window.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [clock()])); } static now() { return clock(); } };
      if (notify) window.dispatchEvent(new Event('focus'));
    };
    window.setTestDay(sessionStorage.getItem('repository-clock') || '2026-10-16T23:58:00+08:00', false,
      sessionStorage.getItem('repository-clock-ticking') === '1');
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
  // Updating an application must restore exactly, even when its stored day is old.
  const updateSnapshot = { ...(await data()), taskDay: '2026-10-20',
    tasks: [task('更新前已完成', true), task('更新前待办', false)],
    futureState: { untouched: 'keep future state' } };
  updateSnapshot.settings.futureSetting = 'keep unknown setting';
  updateSnapshot.dailyMemos['2026-10-16'].futureMemo = 'keep unknown memo field';
  await evaluate(`sessionStorage.setItem('calendar-check-data', ${JSON.stringify(JSON.stringify(updateSnapshot))});
    sessionStorage.setItem('update-check-guard', '2026-10-21'); sessionStorage.setItem('update-check-nonce', 'test-update-nonce');`);
  await send('Page.reload');
  await wait("document.querySelector('.completed-button')?.disabled === false && sessionStorage.getItem('update-check-verified') === '1'");
  await delay(600);
  assert.deepEqual(await data(), updateSnapshot, 'Updating unexpectedly changed the saved full snapshot');
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await delay(100);
  assert.deepEqual(await data(), updateSnapshot, 'Wake after update unexpectedly archived tasks');
  await evaluate("window.setTestDay('2026-10-22T00:01:00+08:00')");
  await wait("JSON.parse(sessionStorage.getItem('calendar-check-data')).tasks.length === 1");
  const nextDay = await data();
  assert.deepEqual(nextDay.settings, updateSnapshot.settings);
  assert.deepEqual(nextDay.dailyMemos, updateSnapshot.dailyMemos);
  assert.deepEqual(nextDay.futureState, updateSnapshot.futureState);
  assert.deepEqual(nextDay.tasks, [updateSnapshot.tasks[1]]);
  console.log('update restores exact full snapshot without rollover; next-day archive changes only its task: OK');

  // Let the isolated clock really cross midnight. Do not emit focus, visibility
  // or reload events to trigger the rollover after the page is ready.
  const midnightSeed = { ...seed, taskDay: '2026-10-24', tasks: seed.tasks.map(task => ({
    ...task, createdAt: '2026-10-24T08:00:00+08:00', updatedAt: '2026-10-24T20:00:00+08:00',
  })) };
  await evaluate(`sessionStorage.setItem('calendar-check-data', ${JSON.stringify(JSON.stringify(midnightSeed))});
    sessionStorage.setItem('repository-clock', '2026-10-24T23:59:58+08:00');
    sessionStorage.setItem('repository-clock-ticking', '1');
    sessionStorage.removeItem('update-check-guard'); sessionStorage.removeItem('update-check-nonce');`);
  await send('Page.reload');
  await wait("document.querySelector('.completed-button')?.disabled === false");
  assert.equal((await data()).tasks.length, 3);
  await evaluate(`window.midnightEvents = 0;
    window.addEventListener('focus', () => window.midnightEvents++);
    document.addEventListener('visibilitychange', () => window.midnightEvents++);`);
  const started = Date.now();
  await wait("JSON.parse(sessionStorage.getItem('calendar-check-data')).tasks.length === 1");
  assert.ok(Date.now() - started < 5000, 'Midnight rollover waited for the 30-second polling fallback');
  assert.equal(await evaluate('window.midnightEvents'), 0);
  const midnightResult = await data();
  assert.deepEqual(midnightResult.tasks, [midnightSeed.tasks[1]]);
  assert.equal(midnightResult.completedTasks.length, 3);
  assert.deepEqual(midnightResult.completedTasks.slice(1).map(record => record.task),
    [midnightSeed.tasks[0], midnightSeed.tasks[2]]);
  assert.deepEqual(midnightResult.dailyMemos, midnightSeed.dailyMemos);
  assert.deepEqual(midnightResult.settings, midnightSeed.settings);
  assert.deepEqual(errors, []);
  console.log('automatic midnight archive with no click, focus, visibility change or reopening: OK');

  // Real React components with only the native IPC boundary paused. These data
  // live in this browser profile, never the installed application's data path.
  const interactionFailures = [];
  const reloadInteraction = async (gates = [], settings = {}) => {
    await evaluate(`sessionStorage.setItem('calendar-check-data', ${JSON.stringify(JSON.stringify({ ...seed, settings: { ...seed.settings, ...settings } }))});
      sessionStorage.setItem('interaction-check-gates', ${JSON.stringify(JSON.stringify(gates))});
      sessionStorage.setItem('repository-clock', '2026-10-16T12:00:00+08:00');
      sessionStorage.removeItem('repository-clock-ticking'); sessionStorage.removeItem('cloud-check-delivery');
      sessionStorage.removeItem('update-check-quit'); sessionStorage.removeItem('update-check-guard');`);
    await send('Page.reload');
    await wait('window.interactionCheck');
    if (!gates.includes('read_local_data')) await wait("document.querySelector('.calendar-button')?.disabled === false");
  };
  const click = async selector => {
    const point = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  };
  const attemptInput = async (selector, text) => {
    await evaluate(`document.activeElement?.blur(); document.querySelector(${JSON.stringify(selector)})?.focus()`);
    await send('Input.insertText', { text });
  };
  const regression = async (name, run) => {
    try { await run(); console.log(`${name}: OK`); }
    catch (error) { interactionFailures.push(new Error(`${name}: ${error.message}`)); console.error(`${name}: FAILED: ${error.message}`); }
  };
  await regression('initial read protects edits, including failed loading', async () => {
    await reloadInteraction(['read_local_data']);
    await wait("window.interactionCheck.pending('read_local_data') > 0");
    await click('.add-task');
    assert.equal(await evaluate("document.querySelectorAll('.task-item').length"), 0, 'Startup accepted a task that loading would overwrite');
    // Synthetic events also exercise the synchronous callback guard.
    await evaluate("document.querySelector('.add-task').click()");
    assert.equal(await evaluate("document.querySelectorAll('.task-item').length"), 0);
    await evaluate("window.interactionCheck.release('read_local_data', true)");
    await wait("document.querySelector('.save-error')");
    await click('.add-task');
    assert.equal(await evaluate("document.querySelectorAll('.task-item').length"), 0, 'Read failure exposed edits that cannot be saved');
    await reloadInteraction(['read_local_data']);
    await wait("window.interactionCheck.pending('read_local_data') > 0");
    await evaluate("window.interactionCheck.release('read_local_data')");
    await wait("document.querySelector('.calendar-button')?.disabled === false");
    assert.deepEqual((await data()).tasks, seed.tasks);
  });
  await regression('cloud apply protects task input and unlocks after success/failure', async () => {
    for (const fail of [false, true]) {
      await reloadInteraction(); await delay(1800);
      const delivery = { requestId: 'isolated-delivery', sentContent: { tasks: seed.tasks, dailyMemos: seed.dailyMemos }, conflicts: 0,
        snapshot: { revision: 1, updatedAt: Date.now(), marks: {}, content: { tasks: seed.tasks.map(task => task.id === '未完成' ? { ...task, text: '云端合成修改' } : task), dailyMemos: seed.dailyMemos } } };
      await evaluate(`sessionStorage.setItem('cloud-check-delivery', ${JSON.stringify(JSON.stringify(delivery))}); window.interactionCheck.pause('commit_local_data'); document.querySelector('.cloud-button').click()`);
      await wait("Array.from(document.querySelectorAll('.cloud-buttons button')).some(button => button.textContent === '立即同步' && !button.disabled)");
      await evaluate("Array.from(document.querySelectorAll('.cloud-buttons button')).find(button => button.textContent === '立即同步').click()");
      await wait("window.interactionCheck.pending('commit_local_data') > 0");
      const field = '.task-item[data-task-id="未完成"] textarea';
      await attemptInput(field, '不应被接收然后丢弃的输入');
      assert.equal(await evaluate(`document.activeElement === document.querySelector(${JSON.stringify(field)})`), false, 'Cloud apply left task input editable');
      await evaluate(`window.interactionCheck.release('commit_local_data', ${fail})`);
      await wait("document.querySelector('.calendar-button')?.disabled === false");
      await evaluate("document.querySelector('[aria-label=\"关闭云端分享设置\"]').click()");
      await attemptInput(field, '事务后编辑');
      await wait("JSON.parse(sessionStorage.getItem('calendar-check-data')).tasks.some(task => task.text.includes('事务后编辑'))");
      assert.equal((await data()).tasks.find(task => task.id === '未完成').text.includes('不应被接收'), false);
    }
  });
  await regression('quit locks pending edits and repeated close events exit once', async () => {
    await reloadInteraction([], { closeBehavior: 'quit' }); await delay(1800);
    await evaluate("window.interactionCheck.pause('commit_local_data')");
    const field = '.task-item[data-task-id="未完成"] textarea';
    await attemptInput(field, '退出前已接受');
    await evaluate("window.interactionCheck.emit('tauri://close-requested'); window.interactionCheck.emit('focus-matrix://quit-requested')");
    await wait("window.interactionCheck.pending('commit_local_data') > 0");
    await attemptInput(field, '退出过程中不应接收');
    assert.equal(await evaluate(`document.activeElement === document.querySelector(${JSON.stringify(field)})`), false, 'Quit left task input editable while saving an older snapshot');
    assert.equal(await evaluate('window.interactionCheck.quitCalls'), 0);
    await evaluate("window.interactionCheck.release('commit_local_data')");
    await wait('window.interactionCheck.quitCalls > 0'); await delay(100);
    assert.equal(await evaluate('window.interactionCheck.quitCalls'), 1, 'Repeated close requests caused multiple exits');
    assert.equal((await data()).tasks.find(task => task.id === '未完成').text.includes('退出前已接受'), true);
    assert.equal((await data()).tasks.find(task => task.id === '未完成').text.includes('退出过程中'), false);
  });
  await regression('ordinary autosave continues accepting and persists newer input', async () => {
    await reloadInteraction(); await delay(1800);
    const field = '.task-item[data-task-id="未完成"] textarea';
    await evaluate("window.interactionCheck.pause('commit_local_data')");
    await attemptInput(field, '普通保存第一段');
    await wait("window.interactionCheck.pending('commit_local_data') > 0");
    await attemptInput(field, '普通保存第二段');
    assert.equal(await evaluate(`document.activeElement === document.querySelector(${JSON.stringify(field)})`), true);
    await evaluate("window.interactionCheck.release('commit_local_data')");
    await wait("JSON.parse(sessionStorage.getItem('calendar-check-data')).tasks.some(task => task.text.includes('普通保存第一段') && task.text.includes('普通保存第二段'))");
  });
  await regression('midnight transaction locks memos, settings and drag/drop; failure unlocks', async () => {
    for (const surface of ['tasks', 'memos', 'settings']) for (const fail of [false, true]) {
      await reloadInteraction([], { calendarOpen: surface === 'memos' }); await delay(600);
      if (surface === 'settings') await click('.settings-button');
      const before = await data();
      // Focus-triggered rollover starts synchronously. Dispatching the attempts
      // in this same JS turn covers the gap before React commits a lock render.
      const during = await evaluate(`(() => {
        window.interactionCheck.pause('commit_local_data');
        window.setTestDay('2026-10-17T00:02:00+08:00');
        document.querySelector('.add-task')?.click();
        const item = document.querySelector('.task-item[data-task-id="未完成"] textarea');
        const memo = document.querySelector('.memo-text');
        const field = ${JSON.stringify(surface)} === 'memos' ? memo : item;
        field?.focus();
        document.querySelector('.settings-list input[type=checkbox]')?.click();
        const quadrant = document.querySelector('.quadrant-important-not-urgent');
        const transfer = new DataTransfer(); transfer.setData('text/task-id', '未完成');
        quadrant?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
        return { focused: !!field && document.activeElement === field, busy: document.querySelector('.app').getAttribute('aria-busy') };
      })()`);
      assert.equal(during.focused, false, `${surface}: synchronous lock left input focusable`);
      await wait("window.interactionCheck.pending('commit_local_data') > 0");
      assert.equal(await evaluate("document.querySelector('.app').getAttribute('aria-busy')"), 'true');
      const field = surface === 'memos' ? '.memo-text' : '.task-item[data-task-id="未完成"] textarea';
      await attemptInput(field, '独占事务期间不能接收');
      assert.equal(await evaluate(`document.activeElement === document.querySelector(${JSON.stringify(field)})`), false);
      assert.deepEqual(await data(), before, 'An input or drop altered persisted content before the transaction committed');
      await evaluate(`window.interactionCheck.release('commit_local_data', ${fail})`);
      await wait("document.querySelector('.calendar-button')?.disabled === false");
      const after = await data();
      assert.deepEqual(after.settings, before.settings, 'Settings changed while locked');
      assert.deepEqual(after.dailyMemos, before.dailyMemos, 'Memo changed while locked');
      assert.equal(after.tasks.find(task => task.id === '未完成').quadrant, 'important-urgent');
      if (surface === 'settings') await click('[aria-label="关闭设置"]');
      await attemptInput(field, '独占事务后可继续');
      await wait("JSON.stringify(JSON.parse(sessionStorage.getItem('calendar-check-data'))).includes('独占事务后可继续')");
    }
  });
  await regression('failed quit retains edits and unlocks for retry', async () => {
    await reloadInteraction([], { closeBehavior: 'quit' }); await delay(600);
    const field = '.task-item[data-task-id="未完成"] textarea';
    await evaluate("window.interactionCheck.pause('commit_local_data')");
    await attemptInput(field, '退出失败也保留');
    await evaluate("window.interactionCheck.emit('focus-matrix://quit-requested')");
    await wait("window.interactionCheck.pending('commit_local_data') > 0");
    await evaluate("window.interactionCheck.release('commit_local_data', true)");
    await wait("document.querySelector('.calendar-button')?.disabled === false && document.querySelector('.save-error')");
    assert.equal(await evaluate('window.interactionCheck.quitCalls'), 0);
    await attemptInput(field, '失败后继续编辑');
    await wait("JSON.parse(sessionStorage.getItem('calendar-check-data')).tasks.some(task => task.text.includes('退出失败也保留') && task.text.includes('失败后继续编辑'))");
    await evaluate("window.interactionCheck.emit('focus-matrix://quit-requested')");
    await wait('window.interactionCheck.quitCalls === 1');
  });
  await regression('history restore locks pending writes and preserves current memos', async () => {
    for (const fail of [false, true]) {
      await reloadInteraction(); await delay(600);
      await attemptInput('.task-item[data-task-id="未完成"] textarea', '恢复前新内容');
      await wait("JSON.parse(sessionStorage.getItem('calendar-check-data')).tasks.some(task => task.text.includes('恢复前新内容'))");
      const before = await data();
      await click('[aria-label="打开历史记录"]');
      await wait("document.querySelector('.history-version:not(:disabled)') && document.querySelector('.history-restore:not(:disabled)')");
      // Pick an actual saved version with the original task, rather than
      // asserting anything about the fake IPC/history implementation.
      const oldVersion = await evaluate("JSON.parse(sessionStorage.getItem('content-check-history')).reverse().find(version => version.content.tasks.some(task => task.id === '未完成' && !task.text.includes('恢复前新内容')))" );
      assert.ok(oldVersion, 'No pre-edit history version');
      await evaluate(`document.querySelector('[data-version-id="${oldVersion.id}"]').click()`);
      await wait("document.querySelector('.history-restore:not(:disabled)') && !document.querySelector('.history-preview [aria-busy=true]')");
      await evaluate("document.querySelector('.history-restore').click(); window.interactionCheck.pause('commit_local_data')");
      await wait("document.querySelector('.history-confirm-button:not(:disabled)')");
      await evaluate("document.querySelector('.history-confirm-button').click()");
      await wait("window.interactionCheck.pending('commit_local_data') > 0");
      await attemptInput('.task-item[data-task-id="未完成"] textarea', '恢复中不能输入');
      assert.equal(await evaluate("document.activeElement?.matches('.task-text')"), false);
      await evaluate(`window.interactionCheck.release('commit_local_data', ${fail})`);
      await wait("document.querySelector('.calendar-button')?.disabled === false");
      assert.deepEqual((await data()).dailyMemos, before.dailyMemos);
      assert.deepEqual((await data()).tasks, fail ? before.tasks : oldVersion.content.tasks);
      await click('.history-close');
      await attemptInput('.task-item[data-task-id="未完成"] textarea', '恢复结束后继续');
      await wait("JSON.parse(sessionStorage.getItem('calendar-check-data')).tasks.some(task => task.text.includes('恢复结束后继续'))");
    }
  });
  await regression('update exit preserves the nonce protocol and locks before the read returns', async () => {
    await reloadInteraction(); await delay(600);
    await attemptInput('.task-item[data-task-id="未完成"] textarea', '更新前内容');
    const count = await evaluate("document.querySelectorAll('.task-item').length");
    await evaluate("sessionStorage.setItem('update-check-request', 'isolated-update-nonce'); window.interactionCheck.pause('read_update_request'); window.interactionCheck.emit('tauri://close-requested'); document.querySelector('.add-task').click()");
    await wait("window.interactionCheck.pending('read_update_request') > 0");
    assert.equal(await evaluate("document.querySelectorAll('.task-item').length"), count, 'Close accepted edits before the update-request read finished');
    assert.equal(await evaluate("document.querySelector('.app [inert]') !== null"), true);
    await evaluate("window.interactionCheck.release('read_update_request')");
    await wait('window.interactionCheck.quitCalls === 1');
    assert.equal(await evaluate("sessionStorage.getItem('update-check-ready')"), 'isolated-update-nonce');
    assert.equal((await data()).tasks.some(task => task.text.includes('更新前内容')), true);
    await evaluate("sessionStorage.removeItem('update-check-request'); sessionStorage.removeItem('update-check-ready')");
  });
  assert.deepEqual(errors, [], 'Browser exceptions or network failures');
  if (interactionFailures.length) throw new AggregateError(interactionFailures, 'Interaction preservation regressions failed');
} finally {
  if (socket?.readyState === WebSocket.OPEN) { await send('Browser.close').catch(() => {}); socket.close(); }
  browser.kill(); await new Promise(resolve => server.close(resolve));
}
