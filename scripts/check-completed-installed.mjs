import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const directory = join(process.env.APPDATA, 'com.focusmatrix.desktop');
const backups = (await readdir(join(directory, 'backups'), { withFileTypes: true }))
  .filter(entry => entry.isDirectory()).map(entry => entry.name).sort().reverse();
let backup, before;
for (const name of backups) {
  try {
    const path = join(directory, 'backups', name);
    await readFile(join(path, 'manifest.json'));
    before = JSON.parse(await readFile(join(path, 'focus-matrix.json'), 'utf8'));
    backup = path; break;
  } catch { /* Ignore incomplete backups. */ }
}
assert.ok(backup, 'Verified backup required');
let page;
for (let n = 0; n < 120; n++) {
  try { page = (await (await fetch('http://127.0.0.1:9236/json/list')).json()).find(p => p.type === 'page' && p.url.startsWith('http://tauri.localhost')); } catch { /* App starting. */ }
  if (page) break; await delay(100);
}
assert.ok(page, 'Installed WebView not found');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map(), errors = [];
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data), callback = pending.get(message.id);
  if (callback) { pending.delete(message.id); message.error ? callback.reject(Error(message.error.message)) : callback.resolve(message.result); }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const key = ++id; pending.set(key, { resolve, reject }); socket.send(JSON.stringify({ id: key, method, params }));
});
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
  return result.result.value;
};
const wait = async expression => {
  for (let n = 0; n < 100; n++) { if (await evaluate(`Boolean(${expression})`)) return; await delay(100); }
  throw Error('Installed UI not ready: ' + expression);
};
try {
  await send('Runtime.enable');
  await wait("document.querySelector('.completed-button')?.disabled === false");
  await delay(1000);
  assert.equal(await evaluate("Boolean(document.querySelector('.save-error'))"), false);
  const current = JSON.parse(await readFile(join(directory, 'focus-matrix.json'), 'utf8'));
  if (process.argv.includes('--exact')) {
    const currentHash = createHash('sha256').update(await readFile(join(directory, 'focus-matrix.json'))).digest('hex');
    const backupHash = createHash('sha256').update(await readFile(join(backup, 'focus-matrix.json'))).digest('hex');
    assert.equal(currentHash, backupHash, 'The complete saved store changed after update');
    const session = JSON.parse(await readFile(join(directory, '.update-session.json'), 'utf8'));
    const receipt = JSON.parse(await readFile(join(directory, '.update-restored.json'), 'utf8'));
    assert.equal(session.phase, 'verified');
    assert.equal(session.nonce, receipt.nonce);
    assert.equal(receipt.verified, true);
  }
  assert.deepEqual(current.dailyMemos, before.dailyMemos, 'Memos changed');
  assert.deepEqual(current.settings, before.settings, 'Settings changed');
  const currentRecords = current.completedTasks ?? [];
  for (const task of before.tasks) {
    const copy = current.tasks.find(item => item.id === task.id) ?? currentRecords.find(record => record.task.id === task.id)?.task;
    assert.deepEqual(copy, task, 'An original task was lost/changed (text withheld)');
    if (!task.completed) assert.ok(current.tasks.some(item => item.id === task.id), 'Pending task was removed');
  }
  for (const record of before.completedTasks ?? []) assert.ok(currentRecords.some(item => item.id === record.id), 'Previous archive record missing');
  const manifest = JSON.parse((await readFile(join(backup, 'manifest.json'), 'utf8')).replace(/^\uFEFF/, ''));
  let historyCount = 0;
  for (const file of manifest.files.filter(item => item.name.startsWith('history'))) {
    const bytes = await readFile(join(directory, file.name));
    assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(), file.sha256.toUpperCase(), 'An original history version changed');
    historyCount++;
  }
  assert.deepEqual(JSON.parse(await readFile(join(directory, '.window-state.json'), 'utf8')),
    JSON.parse(await readFile(join(backup, '.window-state.json'), 'utf8')), 'Window state changed');
  await evaluate("document.querySelector('.completed-button').click()");
  await wait("document.querySelector('.completed-modal')");
  assert.equal(await evaluate("document.querySelectorAll('.completed-record').length"), Math.min(80, currentRecords.length));
  for (const [width, height] of [[520, 360], [720, 480], [1200, 760]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await delay(150);
    assert.equal(await evaluate(`(() => {
      const modal = document.querySelector('.completed-modal'), bounds = modal.getBoundingClientRect();
      const left = document.querySelector('.title-start').getBoundingClientRect(), right = document.querySelector('.title-actions').getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= innerWidth + 1 && bounds.bottom <= innerHeight + 1 && modal.scrollWidth <= modal.clientWidth + 1 && left.right <= right.left && right.right <= innerWidth;
    })()`), true, 'Installed layout overflow');
  }
  await send('Emulation.clearDeviceMetricsOverride');
  await writeFile('outputs/completed-installed.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await evaluate("document.querySelector('[aria-label=\"关闭已完成仓库\"]').click()");
  const cloud = await evaluate("window.__TAURI_INTERNALS__.invoke('get_cloud_status').then(s => ({configured:s.configured,error:s.error,lastSyncedAt:s.lastSyncedAt}))");
  assert.equal(cloud.configured, true, 'Original cloud configuration unavailable');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', originalTasks: before.tasks.length, activeTasks: current.tasks.length,
    archivedTasks: currentRecords.length, preservedMemoDates: Object.keys(current.dailyMemos ?? {}).length,
    preservedHistoryFiles: historyCount, cloudConfigured: cloud.configured, cloudError: cloud.error, backup }));
} finally { await send('Emulation.clearDeviceMetricsOverride').catch(() => {}); socket.close(); }
