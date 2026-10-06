import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const dataDirectory = join(process.env.APPDATA, 'com.focusmatrix.desktop');
const backupRoot = join(dataDirectory, 'backups');
const backups = (await readdir(backupRoot)).sort().reverse();
let backup;
let backupDirectory;
for (const directory of backups) {
  try {
    await readFile(join(backupRoot, directory, 'manifest.json'), 'utf8');
    backupDirectory = join(backupRoot, directory);
    backup = JSON.parse(await readFile(join(backupDirectory, 'focus-matrix.json'), 'utf8'));
    break;
  } catch { /* Ignore incomplete backup directories. */ }
}
if (!backup) throw new Error('No verified backup found');
const readData = async () => JSON.parse(await readFile(join(dataDirectory, 'focus-matrix.json'), 'utf8'));
let page;
for (let attempt = 0; attempt < 60; attempt++) {
  try { page = (await (await fetch('http://127.0.0.1:9236/json/list')).json()).find((target) => target.type === 'page' && target.url.startsWith('http://tauri.localhost')); } catch { /* App starting. */ }
  if (page) break;
  await delay(200);
}
if (!page) throw new Error('Installed app WebView not found');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let nextId = 0;
const pending = new Map();
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  const callback = pending.get(message.id);
  if (callback) { pending.delete(message.id); message.error ? callback.reject(new Error(message.error.message)) : callback.resolve(message.result); }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
};
const waitFor = async (expression) => {
  for (let attempt = 0; attempt < 40; attempt++) { if (await evaluate(`Boolean(${expression})`)) return; await delay(100); }
  throw new Error(`UI did not become ready: ${expression}`);
};
try {
  await waitFor("document.querySelector('.calendar-button')?.disabled === false");
  if (!await evaluate("document.querySelector('.calendar-panel')" + ' !== null')) await evaluate("document.querySelector('.calendar-button').click()");
  await waitFor("document.querySelectorAll('.memo-text').length === 3");
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  assert.equal(await evaluate("document.querySelector('.daily-memos').dataset.selectedDate"), todayKey);
  assert.equal(await evaluate("document.querySelector('[aria-current=\"date\"]').dataset.date"), todayKey);
  assert.equal(await evaluate("Boolean(document.querySelector('.save-error'))"), false);
  console.log('installed calendar, three periods and system date: ok');
  // No task or memo text is edited by this native acceptance check.
  if (!backup.settings.calendarOpen) {
    await evaluate("document.querySelector('.calendar-close').click()");
    await waitFor("document.querySelectorAll('.quadrant').length === 4");
  }
  await delay(700);
  if (process.argv.includes('--history')) {
    await evaluate("document.querySelector('.history-button').click()");
    await waitFor("document.querySelector('.history-version')");
    await evaluate("document.querySelector('.history-save').click()");
    await waitFor("document.querySelector('.history-message')?.textContent.includes('新版本')");
    const versions = await evaluate("window.__TAURI_INTERNALS__.invoke('list_content_versions')");
    const manual = versions.versions.find((version) => version.reason === 'manual');
    assert.ok(manual, 'manual version missing');
    const archived = await evaluate(`window.__TAURI_INTERNALS__.invoke('get_content_version', { id: ${JSON.stringify(manual.id)} })`);
    assert.deepEqual(archived.content.tasks, backup.tasks);
    assert.deepEqual(archived.content.dailyMemos, backup.dailyMemos ?? {});
    assert.ok(versions.versions.some((version) => version.reason === 'update-backup'), 'old update backups missing from history');
    await waitFor(`document.querySelector('[data-version-id="${manual.id}"]')`);
    await evaluate(`document.querySelector('[data-version-id="${manual.id}"]').click()`);
    await waitFor("document.querySelector('.history-restore')?.disabled === false");
    // Exercise native restoration using an exact copy of the current content.
    await evaluate("document.querySelector('.history-restore').click()");
    await waitFor("document.querySelector('.history-confirm-button')");
    await evaluate("document.querySelector('.history-confirm-button').click()");
    await waitFor("document.querySelector('.history-message')?.textContent.includes('已恢复')");
    const after = await evaluate("window.__TAURI_INTERNALS__.invoke('list_content_versions')");
    const protectedVersion = after.versions.find((version) => version.reason === 'before-restore');
    assert.ok(protectedVersion, 'before-restore version missing');
    const protectedContent = await evaluate(`window.__TAURI_INTERNALS__.invoke('get_content_version', { id: ${JSON.stringify(protectedVersion.id)} })`);
    assert.deepEqual(protectedContent.content.tasks, backup.tasks);
    assert.deepEqual(protectedContent.content.dailyMemos, backup.dailyMemos ?? {});
    await evaluate("document.querySelector('.history-close').click()");
    console.log('native version files, old backups, manual saving and protected restoration: ok');
  }
  const current = await readData();
  assert.deepEqual(current.tasks, backup.tasks, 'existing task content changed');
  for (const [key, value] of Object.entries(backup.settings)) assert.deepEqual(current.settings[key], value, `setting changed: ${key}`);
  assert.deepEqual(current.dailyMemos, backup.dailyMemos ?? {}, 'existing memo content changed');
  const savedWindow = JSON.parse(await readFile(join(backupDirectory, '.window-state.json'), 'utf8'));
  const liveWindow = JSON.parse(await readFile(join(dataDirectory, '.window-state.json'), 'utf8'));
  assert.deepEqual(liveWindow, savedWindow, 'window geometry changed');
  console.log(`existing content preserved: ${current.tasks.length} tasks, all previous settings and window state`);
  if (process.argv.includes('--finish-debug')) {
    await evaluate("window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'focus-matrix://quit-requested', payload: null })");
  }
} finally { socket.close(); }
