import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const browser = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
  '--remote-debugging-port=9239', `--user-data-dir=${join(process.cwd(), '.edge-calendar-check')}`, 'about:blank',
], { stdio: 'ignore', windowsHide: true });
let socket;
const pending = new Map();
let nextId = 0;
const errors = [];
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
const waitFor = async (expression, label) => {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await delay(100);
  }
  throw new Error(`Timed out: ${label}; browser errors: ${JSON.stringify(errors)}; page: ${await evaluate('document.body.innerText')}`);
};
const saved = () => evaluate("JSON.parse(sessionStorage.getItem('calendar-check-data'))");
const typeMemo = async (period, text) => {
  await evaluate(`(() => {
    const field = document.querySelector('[data-period="${period}"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(field, ${JSON.stringify(text)});
    field.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await delay(600);
};
try {
  let page;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { page = (await (await fetch('http://127.0.0.1:9239/json/list')).json()).find((target) => target.type === 'page'); } catch { /* Launching. */ }
    if (page) break;
    await delay(100);
  }
  if (!page) throw new Error('Test browser did not start');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const callback = pending.get(message.id);
    if (callback) { pending.delete(message.id); message.error ? callback.reject(new Error(message.error.message)) : callback.resolve(message.result); }
  });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
  });
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 480, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:1420/calendar-preview.html' });
  await waitFor("document.querySelector('.calendar-button')?.disabled === false && document.querySelector('.task-text')", 'initial load');
  await delay(600);
  const originalTasks = (await saved()).tasks;
  assert.equal(originalTasks.length, 1);
  await evaluate("document.querySelector('.calendar-button').click()");
  await waitFor("document.querySelectorAll('.memo-text').length === 3", 'calendar view');
  const today = await evaluate("document.querySelector('[aria-current=\"date\"]').dataset.date");
  assert.equal(await evaluate("document.querySelector('.daily-memos').dataset.selectedDate"), today);
  for (const [period, text] of Object.entries({ morning: '早上安排\n完整显示第二行', afternoon: '下午安排', evening: '晚上安排' })) await typeMemo(period, text);
  let data = await saved();
  assert.equal(data.dailyMemos[today].morning, '早上安排\n完整显示第二行');
  assert.equal(data.dailyMemos[today].afternoon, '下午安排');
  assert.equal(data.dailyMemos[today].evening, '晚上安排');
  assert.deepEqual(data.tasks, originalTasks);
  assert.equal(data.settings.calendarOpen, true);
  await send('Page.reload');
  await waitFor("document.querySelector('[data-period=\"morning\"]')?.value === '早上安排\\n完整显示第二行'", 'restore notes and open state');
  console.log('today, all three periods, autosave and reload: ok');
  const anotherDate = await evaluate(`(() => { const day = [...document.querySelectorAll('.calendar-day')].find((day) => day.dataset.date !== ${JSON.stringify(today)} && !day.classList.contains('outside-month')); day.click(); return day.dataset.date; })()`);
  await waitFor(`document.querySelector('.daily-memos').dataset.selectedDate === ${JSON.stringify(anotherDate)}`, 'date selection');
  assert.equal(await evaluate("document.querySelector('[data-period=\"morning\"]').value"), '');
  await typeMemo('morning', '另一天的备忘录');
  data = await saved();
  assert.equal(data.dailyMemos[anotherDate].morning, '另一天的备忘录');
  assert.equal(data.dailyMemos[today].evening, '晚上安排');
  await evaluate("document.querySelector('.today-button').click()");
  await waitFor(`document.querySelector('.daily-memos').dataset.selectedDate === ${JSON.stringify(today)}`, 'today button');
  const originalMonth = await evaluate("document.querySelector('.calendar-month-header h2').textContent");
  await evaluate("document.querySelector('[aria-label=\"下个月\"]').click()");
  await delay(100);
  assert.notEqual(await evaluate("document.querySelector('.calendar-month-header h2').textContent"), originalMonth);
  await evaluate("document.querySelector('.today-button').click()");
  await delay(100);
  console.log('date isolation and month navigation: ok');

  // Simulate passing midnight and waking the computer while this page stays open.
  await evaluate(`(() => {
    const OriginalDate = Date;
    const next = new OriginalDate(${JSON.stringify(today + 'T12:00:00')}); next.setDate(next.getDate() + 1);
    window.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : [next.getTime()])); } static now() { return next.getTime(); } };
    window.dispatchEvent(new Event('focus'));
  })()`);
  await waitFor(`document.querySelector('.daily-memos').dataset.selectedDate !== ${JSON.stringify(today)}`, 'midnight synchronization');
  const newToday = await evaluate("document.querySelector('.daily-memos').dataset.selectedDate");
  assert.equal(await evaluate("document.querySelector('[aria-current=\"date\"]').dataset.date"), newToday);
  await evaluate(`document.querySelector('[data-date="${anotherDate}"]').click()`);
  await delay(100);
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await delay(100);
  assert.equal(await evaluate("document.querySelector('.daily-memos').dataset.selectedDate"), anotherDate);
  const historicalMonth = await evaluate("document.querySelector('.calendar-month-header h2').textContent");
  await evaluate(`(() => {
    const OriginalDate = Date;
    const day = new OriginalDate(${JSON.stringify(newToday + 'T12:00:00')});
    const nextMonth = new OriginalDate(day.getFullYear(), day.getMonth() + 1, 1, 12);
    window.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : [nextMonth.getTime()])); } static now() { return nextMonth.getTime(); } };
    window.dispatchEvent(new Event('focus'));
  })()`);
  await delay(150);
  assert.equal(await evaluate("document.querySelector('.daily-memos').dataset.selectedDate"), anotherDate);
  assert.equal(await evaluate("document.querySelector('.calendar-month-header h2').textContent"), historicalMonth);
  console.log('midnight sync preserves deliberately selected historical dates: ok');

  await typeMemo('morning', '长备忘录自动换行，完整显示所有内容。'.repeat(50) + '\n第二段\n第三段');
  for (const [width, height] of [[1200, 760], [720, 480], [520, 360], [620, 360]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await delay(200);
    const issues = await evaluate(`(() => {
      const issues = [];
      const panel = document.querySelector('.calendar-panel');
      if (document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1) issues.push('page overflow');
      if (panel.scrollWidth > panel.clientWidth + 1) issues.push('calendar horizontal overflow');
      for (const field of document.querySelectorAll('.memo-text')) {
        if (field.scrollHeight > field.clientHeight + 2) issues.push('memo text clipped');
        if (field.scrollWidth > field.clientWidth + 2) issues.push('memo horizontal overflow');
      }
      for (const el of document.querySelectorAll('.title-start, .title-actions, .memo-heading h2')) {
        const rect = el.getBoundingClientRect(); if (rect.left < 0 || rect.right > innerWidth) issues.push('heading clipped');
      }
      return issues;
    })()`);
    assert.deepEqual(issues, [], `layout ${width}x${height}`);
    console.log(`calendar layout ${width}x${height}: ok`);
  }
  await send('Page.reload');
  await waitFor("document.querySelector('.today-button')", 'restore actual date');
  await evaluate("document.querySelector('.today-button').click()");
  await delay(100);
  await typeMemo('morning', '整理本周计划\n先处理最重要的一件事');
  await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 480, deviceScaleFactor: 1, mobile: false });
  await delay(150);
  const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(join(process.cwd(), 'calendar-ui-check.png'), Buffer.from(capture.data, 'base64'));

  await evaluate("document.querySelector('.calendar-close').click()");
  await waitFor("document.querySelectorAll('.quadrant').length === 4", 'return to matrix');
  await delay(600);
  assert.equal((await saved()).settings.calendarOpen, false);
  await send('Page.reload');
  await waitFor("document.querySelectorAll('.quadrant').length === 4", 'restore closed state');
  assert.deepEqual((await saved()).tasks, originalTasks);
  assert.deepEqual(errors, [], 'browser errors');
  console.log('closed state and existing tasks preserved: ok');

  const baseline = await saved();
  const openHistory = async () => {
    await evaluate("document.querySelector('.history-button').click()");
    await waitFor("document.querySelector('.history-version')", 'history list');
    await waitFor("document.querySelector('.history-preview-section')", 'history preview');
  };
  const selectVersion = async (id) => {
    await evaluate(`document.querySelector('[data-version-id="${id}"]').click()`);
    await waitFor(`document.querySelector('[data-version-id="${id}"]').getAttribute('aria-pressed') === 'true' && !document.querySelector('.history-restore').disabled`, 'version preview');
  };
  const restoreSelected = async () => {
    await evaluate("document.querySelector('.history-restore').click()");
    await waitFor("document.querySelector('.history-confirm-button')", 'restore confirmation');
    await evaluate("document.querySelector('.history-confirm-button').click()");
    await waitFor("document.querySelector('.history-message')?.textContent.includes('已恢复')", 'successful restore');
  };
  await openHistory();
  await evaluate("document.querySelector('.history-save').click()");
  await waitFor("document.querySelector('.history-message')?.textContent.includes('新版本')", 'manual snapshot');
  const manualId = await evaluate("JSON.parse(sessionStorage.getItem('content-check-history')).filter(v => v.reason === 'manual').at(-1).id");
  await evaluate("document.querySelector('.history-close').click()");
  await evaluate(`(() => {
    const field = document.querySelector('.task-text');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, '修改后的任务文字');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await delay(600);
  assert.equal((await saved()).tasks[0].text, '修改后的任务文字');
  await evaluate("document.querySelector('.delete-button').click()");
  await delay(600);
  assert.equal((await saved()).tasks.length, 0);
  await evaluate("document.querySelector('.calendar-button').click()");
  await waitFor("document.querySelector('.memo-text')", 'memo edit');
  await typeMemo('morning', '修改后的早上备忘录');
  await evaluate("document.querySelector('.calendar-close').click()");
  await delay(600);
  const changed = await saved();
  await openHistory();
  await selectVersion(manualId);
  assert.equal(await evaluate("document.querySelector('.history-task').textContent.includes('更新前已有的任务')"), true);
  await evaluate("document.querySelector('.history-restore').click()");
  await waitFor("document.querySelector('.history-cancel')", 'confirmation');
  await evaluate("document.querySelector('.history-cancel').click()");
  assert.deepEqual(await saved(), changed);
  await restoreSelected();
  let restored = await saved();
  assert.deepEqual(restored.tasks, baseline.tasks);
  assert.deepEqual(restored.dailyMemos, baseline.dailyMemos);
  assert.deepEqual(restored.settings, changed.settings);
  const beforeRestore = await evaluate("JSON.parse(sessionStorage.getItem('content-check-history')).filter(v => v.reason === 'before-restore').at(-1)");
  assert.deepEqual(beforeRestore.content.tasks, changed.tasks);
  assert.deepEqual(beforeRestore.content.dailyMemos, changed.dailyMemos);
  await waitFor(`document.querySelector('[data-version-id="${beforeRestore.id}"]')`, 'before-restore record');
  await selectVersion(beforeRestore.id);
  await restoreSelected();
  restored = await saved();
  assert.deepEqual(restored.tasks, changed.tasks);
  assert.deepEqual(restored.dailyMemos, changed.dailyMemos);
  await selectVersion(manualId);
  await restoreSelected();
  await evaluate("document.querySelector('.history-close').click()");
  await send('Page.reload');
  await waitFor("document.querySelector('.task-text')?.value === '更新前已有的任务'", 'restored task after restart');
  assert.deepEqual((await saved()).dailyMemos, baseline.dailyMemos);
  assert.equal('history' in (await saved()), false);
  console.log('manual versions, deleted task recovery, memo recovery, cancel and undo restoration, restart: ok');
  await openHistory();
  await selectVersion(manualId);
  for (const [width, height] of [[720, 480], [520, 360], [1200, 760]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await delay(150);
    const issues = await evaluate(`(() => {
      const issues = []; const dialog = document.querySelector('.history-modal'); const bounds = dialog.getBoundingClientRect();
      if (bounds.left < 0 || bounds.right > innerWidth || bounds.top < 0 || bounds.bottom > innerHeight) issues.push('history modal clipped');
      if (dialog.scrollWidth > dialog.clientWidth + 1 || dialog.scrollHeight > dialog.clientHeight + 1) issues.push('modal overflow');
      for (const el of document.querySelectorAll('.history-list, .history-preview')) if (el.scrollWidth > el.clientWidth + 1) issues.push('horizontal overflow');
      return issues;
    })()`);
    assert.deepEqual(issues, [], `history layout ${width}x${height}`);
    console.log(`history layout ${width}x${height}: ok`);
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 480, deviceScaleFactor: 1, mobile: false });
  await delay(100);
  const historyCapture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(join(process.cwd(), 'history-ui-check.png'), Buffer.from(historyCapture.data, 'base64'));
  assert.deepEqual(errors, [], 'history browser errors');

  // If the active store fails during restore, retain the UI and the previous disk content.
  await evaluate("document.querySelector('.history-close').click()");
  await evaluate(`(() => {
    const field = document.querySelector('.task-text');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, '失败恢复前保留的内容');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await delay(600);
  const beforeFailure = await saved();
  await openHistory();
  await selectVersion(manualId);
  await evaluate("sessionStorage.setItem('history-check-restore-fail', '1'); document.querySelector('.history-restore').click()");
  await waitFor("document.querySelector('.history-confirm-button')", 'failure test confirmation');
  await evaluate("document.querySelector('.history-confirm-button').click()");
  await waitFor("document.querySelector('.history-error')", 'failed restore surfaced');
  assert.deepEqual((await saved()).tasks, beforeFailure.tasks);
  assert.deepEqual((await saved()).dailyMemos, beforeFailure.dailyMemos);
  assert.equal(await evaluate("document.querySelector('.task-text').value"), '失败恢复前保留的内容');
  await evaluate("document.querySelector('.history-confirm-button').click()");
  await waitFor("document.querySelector('.history-message')?.textContent.includes('已恢复')", 'restore retry');
  assert.deepEqual((await saved()).tasks, baseline.tasks);
  console.log('failed restore retains current content and can retry: ok');
} finally {
  if (socket?.readyState === WebSocket.OPEN) { await send('Browser.close').catch(() => {}); socket.close(); }
  browser.kill();
}
