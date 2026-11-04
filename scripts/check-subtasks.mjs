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
const profile = await mkdtemp(join(process.cwd(), 'outputs', 'subtasks-browser-'));
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
const root = '.task-item[data-task-id="parent"]';
const child = { id: 'first', text: '准备资料', completed: false, createdAt: '2026-11-04T08:00:00+08:00', updatedAt: '2026-11-04T08:00:00+08:00' };
const task = (id, text) => ({ id, text, completed: false, quadrant: 'important-urgent', createdAt: child.createdAt, updatedAt: child.updatedAt });
const seed = { tasks: [{ ...task('parent', '准备本周汇报'), subtasks: [child, { ...child, id: 'second', text: '核对数字', completed: true }] }, task('empty', ''), task('keyboard', '')],
  settings: { autostart: false, desktopMode: false, alwaysOnTop: false, fontSize: 'medium', opacity: 90, showCompleted: true, calendarOpen: false, closeBehavior: 'tray' },
  dailyMemos: { '2026-11-04': { morning: '原有备忘录', afternoon: '', evening: '', updatedAt: child.createdAt } },
  dailyDiaries: { '2026-11-04': '原有日记' }, taskDay: '2026-11-04', completedTasks: [] };
const edit = (selector, text) => evaluate('(() => { const field=document.querySelector(' + JSON.stringify(selector) + '); field.focus(); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(field,' + JSON.stringify(text) + '); field.dispatchEvent(new Event("input",{bubbles:true})); })()');
const click = selector => evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()');
const press = async (key, options = {}) => {
  const event = { key, code: key, windowsVirtualKeyCode: key === 'Enter' ? 13 : 46, ...options };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...(key === 'Enter' ? { text: '\r' } : {}), ...event });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
};
const screenshot = async name => {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join('outputs', 'subtasks-20261104', name + '.png'), Buffer.from(shot.data, 'base64'));
};
try {
  let page;
  for (let n = 0; n < 100; n++) {
    try { page = (await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json()).find(p => p.type === 'page'); } catch {}
    if (page) break; await delay(100);
  }
  assert.ok(page, 'Browser did not start');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data), callback = pending.get(message.id);
    if (callback) { pending.delete(message.id); message.error ? callback.reject(Error(message.error.message)) : callback.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Shanghai' });
  await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 480, deviceScaleFactor: 1.5, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source:
    'if(location.origin===' + JSON.stringify(origin) + '){' +
    'if(!sessionStorage.getItem("calendar-check-data"))sessionStorage.setItem("calendar-check-data",' + JSON.stringify(JSON.stringify(seed)) + ');' +
    'const RealDate=Date; const clock=()=>RealDate.parse(sessionStorage.getItem("subtasks-clock")||"2026-11-04T10:00:00+08:00");' +
    'window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[clock()]));}static now(){return clock();}};' +
    'window.advanceDay=value=>{sessionStorage.setItem("subtasks-clock",value);window.dispatchEvent(new Event("focus"));};}' });
  await mkdir(join('outputs', 'subtasks-20261104'), { recursive: true });
  await send('Page.navigate', { url: origin + '/calendar-preview.html' });
  await wait("document.querySelectorAll('.subtask-row').length===2 && document.querySelector('.calendar-button')?.disabled===false");
  await evaluate('(() => {const input=document.querySelector(' + JSON.stringify(root + ' input[type=file]') + ');const dt=new DataTransfer();dt.items.add(new File(["synthetic document"],"测试报告.pdf",{type:"application/pdf"}));input.files=dt.files;input.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await wait("document.querySelector('.document-open')?.textContent==='测试报告.pdf'");
  await click(root + ' .document-open');
  assert.equal(await evaluate('window.interactionCheck.documentOpens.length'),1);
  await wait("JSON.parse(sessionStorage.getItem('calendar-check-data')).tasks[0].text.includes('FocusMatrix文档:')");
  assert.equal(await evaluate('document.querySelector(' + JSON.stringify(root + ' .task-text') + ').value'),'准备本周汇报');
  assert.equal(await evaluate("document.querySelectorAll('.subtask-row input[type=checkbox], .subtasks-toolbar').length"), 0);
  await click(root + ' .subtask-add-icon');
  await wait("document.querySelectorAll('.subtask-row').length===3");
  const added = root + ' .subtask-row:last-of-type textarea';
  const before = await data();
  await edit(added, '整理结论');
  await delay(700); assert.deepEqual(await data(), before, 'Child text saved before Enter');
  await press('Enter', { modifiers: 8 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 8 });
  await send('Input.insertText', { text: '补充说明' });
  await evaluate('document.querySelector(' + JSON.stringify(added) + ').dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",isComposing:true,bubbles:true}))');
  await delay(600); assert.deepEqual(await data(), before, 'Shift+Enter or IME saved child draft');
  const submitted = await evaluate('document.querySelector(' + JSON.stringify(added) + ').value');
  await evaluate('document.querySelector(' + JSON.stringify(added) + ').focus()');
  await press('Enter');
  await wait("JSON.parse(sessionStorage.getItem('calendar-check-data')).tasks[0].subtasks?.length===4");
  assert.equal((await data()).tasks[0].subtasks[2].text, submitted);
  assert.equal((await data()).tasks.length, 3, 'Child Enter added a parent');
  await click(root + ' .subtask-row:last-of-type .subtask-delete');
  await wait("JSON.parse(sessionStorage.getItem('calendar-check-data')).tasks[0].subtasks.length===3");
  assert.equal((await data()).tasks[0].subtasks[0].completed, false);
  assert.equal((await data()).tasks[0].subtasks[1].completed, true);
  assert.equal((await data()).tasks[0].completed, false);
  console.log('child CRUD, Enter submission, newline/IME and preserved completion data: OK');
  for (const [width,height] of [[720,480],[520,360],[1200,760]]) {
    await send('Emulation.setDeviceMetricsOverride', { width,height,deviceScaleFactor:1.5,mobile:false });
    await delay(150);
    assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1 && [...document.querySelectorAll('.quadrant,.subtask-text')].every(e=>e.scrollWidth<=e.clientWidth+2)"), true, 'Subtask layout overflow');
    if(width!==1200)await screenshot('matrix-' + width);
  }
  await click(root + ' > input[type="checkbox"]');
  await wait("JSON.parse(sessionStorage.getItem('calendar-check-data')).tasks[0].completed");
  assert.equal((await data()).tasks[0].subtasks[2].completed, false, 'Parent completion checked children');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(' + JSON.stringify(root + ' .subtask-row:nth-child(3) textarea') + ')).textDecorationLine.includes("line-through")'), false);
  await evaluate('(() => { const d=new DataTransfer();d.setData("text/task-id","parent");document.querySelector(".quadrant-important-not-urgent").dispatchEvent(new DragEvent("drop",{dataTransfer:d,bubbles:true,cancelable:true}));})()');
  await wait("JSON.parse(sessionStorage.getItem('calendar-check-data')).tasks[0].quadrant==='important-not-urgent'");
  const saved = await data();
  await send('Page.reload');
  await wait("document.querySelectorAll('.subtask-row').length===3");
  assert.deepEqual((await data()).tasks[0], saved.tasks[0]);
  await click('.save-version-button');
  await wait("JSON.parse(sessionStorage.getItem('content-check-history')).some(v=>v.reason==='manual')");
  const manualId = await evaluate("JSON.parse(sessionStorage.getItem('content-check-history')).findLast(v=>v.reason==='manual').id");
  await edit(root + ' .subtask-row:nth-child(3) textarea', '稍后恢复前的内容');
  await click('.save-version-button');
  await wait("JSON.parse(sessionStorage.getItem('calendar-check-data')).tasks[0].subtasks[2].text==='稍后恢复前的内容'");
  await click('[aria-label="打开历史记录"]');
  await wait("document.querySelector('.history-version')");
  await click('.history-version[data-version-id="' + manualId + '"]');
  await wait("document.querySelector('.history-preview .subtasks-preview')");
  assert.ok((await evaluate("document.querySelector('.history-preview').innerText")).includes('整理结论'));
  await click('.history-restore'); await click('.history-confirm-button');
  await wait("JSON.parse(sessionStorage.getItem('calendar-check-data')).tasks[0].subtasks[2].text!=='稍后恢复前的内容'");
  await click('[aria-label="关闭历史记录"]');
  assert.deepEqual((await data()).dailyMemos, seed.dailyMemos);
  assert.deepEqual((await data()).dailyDiaries, seed.dailyDiaries);
  console.log('parent move/reload, independent visual state and history preview/restore: OK');

  const keyboardRoot = '.task-item[data-task-id="keyboard"]';
  await evaluate('document.querySelector(' + JSON.stringify(keyboardRoot + ' > .task-content > textarea') + ').focus()');
  for (let n=0;n<2;n++) {
    await send('Input.dispatchKeyEvent', { type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9 });
    await send('Input.dispatchKeyEvent', { type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9 });
  }
  await send('Input.dispatchKeyEvent', { type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9 });
  await send('Input.dispatchKeyEvent', { type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9 });
  await delay(100);
  assert.equal(await evaluate('Boolean(document.querySelector(' + JSON.stringify(keyboardRoot) + '))'),true,'Tab to Add deleted an empty parent');
  assert.equal(await evaluate('document.activeElement.classList.contains("subtask-add-icon")'),true);
  await press('Enter');
  await wait("document.querySelector('.task-item[data-task-id=\"keyboard\"] .subtask-row')");
  await edit(keyboardRoot + ' .subtask-text', '键盘添加的步骤');
  await click('.save-version-button');
  await wait("JSON.parse(sessionStorage.getItem('calendar-check-data')).tasks.some(t=>t.id==='keyboard'&&t.subtasks?.[0].text==='键盘添加的步骤')");
  const emptyRoot = '.task-item[data-task-id="empty"]';
  await evaluate('document.querySelector(' + JSON.stringify(emptyRoot + ' > .task-content > textarea') + ').focus()');
  const rect = await evaluate('(() => {const r=document.querySelector(' + JSON.stringify(emptyRoot + ' .subtask-add-icon') + ').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button:'left',clickCount:1,...rect });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button:'left',clickCount:1,...rect });
  await wait("document.querySelector('.task-item[data-task-id=\"empty\"] .subtask-row')");
  await edit(emptyRoot + ' .subtask-text', '无标题父任务也要保留');
  await click('.save-version-button');
  await wait("JSON.parse(sessionStorage.getItem('calendar-check-data')).tasks.some(t=>t.id==='empty'&&t.subtasks?.[0].text==='无标题父任务也要保留')");
  await evaluate('document.querySelector(' + JSON.stringify(emptyRoot + ' > .task-content > textarea') + ').focus()');
  await press('Delete');
  await click('.save-version-button');
  assert.ok((await data()).tasks.some(t=>t.id==='empty'), 'Empty parent with children was deleted');
  const beforeCloud=await data();
  const sent={tasks:beforeCloud.tasks.map(({subtasks,...task})=>task),dailyMemos:beforeCloud.dailyMemos};
  const snapshot={content:structuredClone(sent),revision:2,updatedAt:Date.now(),marks:{}};
  snapshot.content.tasks[0].text='云端更新父任务';
  await evaluate('sessionStorage.setItem("cloud-check-delivery",' + JSON.stringify(JSON.stringify({requestId:'subtasks-cloud',sentContent:sent,snapshot,conflicts:0})) + ');window.dispatchEvent(new Event("online"))');
  await wait("sessionStorage.getItem('cloud-check-ack')==='1'");
  const afterCloud=await data();
  assert.equal(afterCloud.tasks[0].text,'云端更新父任务');
  assert.deepEqual(afterCloud.tasks[0].subtasks,beforeCloud.tasks[0].subtasks);
  assert.equal(await evaluate("window.interactionCheck.syncContents.some(c=>c.tasks.some(t=>'subtasks' in t))"),false);
  console.log('empty parent blur/Delete protection and old-cloud round-trip without child loss: OK');

  await evaluate('window.advanceDay("2026-11-05T00:01:00+08:00")');
  await wait("JSON.parse(sessionStorage.getItem('calendar-check-data')).completedTasks.length===1");
  const archive=await data();
  assert.deepEqual(archive.completedTasks[0].task.subtasks,beforeCloud.tasks[0].subtasks);
  await click('.completed-button');
  await wait("document.querySelector('.completed-modal .subtasks-preview')");
  const search='.completed-filters input[type="search"]';
  await evaluate('(() => {const f=document.querySelector(' + JSON.stringify(search) + ');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(f,"整理结论");f.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await wait("document.querySelectorAll('.completed-record').length===1");
  await screenshot('archive');
  await send('Page.reload');
  await wait("document.querySelector('.calendar-button')?.disabled===false");
  assert.deepEqual((await data()).completedTasks,archive.completedTasks);
  assert.deepEqual(errors,[], 'Browser exceptions');
  console.log('midnight archive, child search/preview and archive reload: OK');
} finally {
  if (socket?.readyState === WebSocket.OPEN) { await send('Browser.close').catch(() => {}); socket.close(); }
  browser.kill(); await new Promise(resolve => server.close(resolve));
}

