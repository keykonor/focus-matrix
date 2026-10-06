import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

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
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
};

let failed = false;
try {
  console.log('desktop layer command', await evaluate("window.__TAURI_INTERNALS__.invoke('set_desktop_layer', { enabled: true }).then(() => 'ok')"));
  await evaluate("document.querySelector('.modal-header button')?.click()");
  for (const { name, width, height, modal } of [
    { name: 'widget', width: 720, height: 480, modal: false },
    { name: 'minimum widget', width: 520, height: 360, modal: false },
    { name: 'minimum settings', width: 520, height: 360, modal: true },
  ]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await evaluate(`document.querySelector('.settings-button')?.${modal ? 'click' : 'blur'}()`);
    await delay(250);
    const metrics = await evaluate(`(() => {
      const sections = [...document.querySelectorAll('.quadrant')];
      const issues = [];
      if (sections.length !== 4) issues.push('missing quadrants');
      if (document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1) issues.push('page overflow');
      for (const section of sections) {
        if (section.scrollWidth > section.clientWidth + 1) issues.push('quadrant horizontal overflow');
        const title = section.querySelector('h2')?.getBoundingClientRect();
        const bounds = section.getBoundingClientRect();
        if (!title || title.left < bounds.left - 1 || title.right > bounds.right + 1) issues.push('title clipped');
      }
      const dialog = document.querySelector('.settings-modal');
      if (${modal} && (!dialog || dialog.getBoundingClientRect().right > innerWidth || dialog.getBoundingClientRect().bottom > innerHeight)) issues.push('settings clipped');
      return { viewport: [innerWidth, innerHeight], quadrants: sections.length, opacity: getComputedStyle(document.querySelector('.app')).getPropertyValue('--surface-alpha').trim(), issues };
    })()`);
    console.log(name, JSON.stringify(metrics));
    if (metrics.issues.length) failed = true;
    if (name === 'widget') {
      const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(join(process.cwd(), 'widget-installed.png'), Buffer.from(capture.data, 'base64'));
    }
  }
  await evaluate("document.querySelector('.modal-header button')?.click()");
  await send('Emulation.clearDeviceMetricsOverride');
  await evaluate("window.__TAURI_INTERNALS__.invoke('set_desktop_layer', { enabled: true }).then(() => 'ok')");
} finally {
  socket.close();
}
if (failed) process.exitCode = 1;
