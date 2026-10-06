import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const dataFile = join(process.env.APPDATA, 'com.focusmatrix.desktop', 'focus-matrix.json');
const targets = await (await fetch('http://127.0.0.1:9236/json/list')).json();
const page = targets.find((target) => target.type === 'page' && target.url.startsWith('http://tauri.localhost/'));
if (!page) throw new Error('Installed app WebView not found');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const readData = async () => JSON.parse(await readFile(dataFile, 'utf8'));
const waitFor = async (predicate, message) => {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await predicate()) return;
    await delay(200);
  }
  throw new Error(message);
};

const label = `Focus Matrix 安装验收 ${Date.now()}\n这是一条需要完整显示的多行任务说明，窗口变窄时也应自动换行。`;
let id;
try {
  const quadrantCount = await evaluate("document.querySelectorAll('.quadrant').length");
  if (quadrantCount !== 4) throw new Error(`Expected 4 quadrants, found ${quadrantCount}`);
  const autostart = await evaluate("window.__TAURI_INTERNALS__.invoke('plugin:autostart|is_enabled')");
  console.log('windows', quadrantCount, 'autostart', autostart);

  await evaluate("document.querySelector('.quadrant-important-not-urgent .add-task').click()");
  await delay(200);
  id = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.quadrant-important-not-urgent .task-item')].at(-1);
    const input = row.querySelector('.task-text');
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(label)});
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(label)} }));
    return row.dataset.taskId;
  })()`);
  await waitFor(async () => (await readData()).tasks.some((task) => task.id === id && task.text === label), 'Task was not saved');
  const textFits = await evaluate(`(() => { const field = document.querySelector('[data-task-id="${id}"] .task-text'); return field.scrollHeight <= field.clientHeight + 2; })()`);
  if (!textFits) throw new Error('Multiline task text was clipped');
  console.log('create and autosave', 'ok');

  await evaluate(`document.querySelector('[data-task-id="${id}"] input[type="checkbox"]').click()`);
  await waitFor(async () => (await readData()).tasks.some((task) => task.id === id && task.completed), 'Completion was not saved');
  console.log('completion', 'ok');

  await evaluate(`(() => {
    const handle = document.querySelector('[data-task-id="${id}"] .drag-handle');
    const target = document.querySelector('.quadrant-important-urgent');
    const transfer = new DataTransfer();
    handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: transfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
  })()`);
  await waitFor(async () => (await readData()).tasks.some((task) => task.id === id && task.quadrant === 'important-urgent'), 'Quadrant move was not saved');
  console.log('quadrant drag', 'ok');

  await send('Page.reload');
  await waitFor(async () => await evaluate(`Boolean(document.querySelector('.quadrant-important-urgent [data-task-id="${id}"]'))`), 'Saved task did not return after reload');
  console.log('restore after reload', 'ok');

  await evaluate(`document.querySelector('[data-task-id="${id}"] .delete-button').click()`);
  await waitFor(async () => !(await readData()).tasks.some((task) => task.id === id), 'Task deletion was not saved');
  id = undefined;
  console.log('delete and autosave', 'ok');

  await evaluate("document.querySelector('.settings-button').click()");
  const settingsRows = await evaluate("document.querySelectorAll('.setting-row').length");
  if (settingsRows !== 7) throw new Error(`Expected 7 settings rows, found ${settingsRows}`);
  console.log('settings modal', 'ok');
} finally {
  if (id) {
    try { await evaluate(`document.querySelector('[data-task-id="${id}"] .delete-button')?.click()`); } catch { /* Reported above. */ }
  }
  socket.close();
}
