import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';

const root = process.cwd();
const browser = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
  '--remote-debugging-port=9235', `--user-data-dir=${join(root, '.edge-cdp-check')}`,
  '--window-size=1200,760', 'http://127.0.0.1:1420/ui-preview.html',
], { stdio: 'ignore' });

let page;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch('http://127.0.0.1:9235/json/list');
    const targets = await response.json();
    page = targets.find((item) => item.type === 'page' && item.url.includes('ui-preview.html'));
    if (page) break;
  } catch { /* Edge is still starting. */ }
  await delay(100);
}
if (!page) throw new Error('Edge DevTools did not start');

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

const checks = [
  { name: 'default widget', width: 720, height: 480, query: '' },
  { name: 'minimum widget', width: 520, height: 360, query: '' },
  { name: 'dense widget', width: 720, height: 480, query: '?dense' },
  { name: 'long text widget', width: 720, height: 480, query: '?long' },
  { name: 'long text minimum', width: 520, height: 360, query: '?long' },
  { name: 'settings minimum', width: 520, height: 360, query: '?settings' },
];
let failed = false;
for (const check of checks) {
  await send('Emulation.setDeviceMetricsOverride', { width: check.width, height: check.height, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:1420/ui-preview.html${check.query}` });
  for (let attempt = 0; attempt < 30; attempt++) {
    const ready = await send('Runtime.evaluate', { expression: "document.querySelectorAll('.quadrant').length", returnByValue: true });
    if (ready.result.value === 4) break;
    await delay(100);
  }
  await delay(100);
  const result = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
    const root = document.documentElement;
    const sections = [...document.querySelectorAll('.quadrant')];
    const headings = [...document.querySelectorAll('.quadrant-heading')];
    const modal = document.querySelector('.settings-modal');
    const issues = [];
    if (root.scrollWidth > innerWidth + 1 || root.scrollHeight > innerHeight + 1) issues.push('page overflow');
    if (sections.length !== 4) issues.push('missing quadrants');
    for (const section of sections) {
      if (section.scrollWidth > section.clientWidth + 1) issues.push('horizontal quadrant overflow');
      const rect = section.getBoundingClientRect();
      for (const task of section.querySelectorAll('.task-item')) {
        const row = task.getBoundingClientRect();
        if (row.left < rect.left - 1 || row.right > rect.right + 1) issues.push('task row outside quadrant');
        const text = task.querySelector('.task-text');
        if (text && text.scrollHeight > text.clientHeight + 2) issues.push('task text clipped vertically');
        if (text && text.scrollWidth > text.clientWidth + 2) issues.push('task text overflow horizontally');
      }
    }
    headings.forEach((heading, index) => {
      const title = heading.getBoundingClientRect();
      const section = sections[index].getBoundingClientRect();
      if (title.left < section.left - 1 || title.right > section.right + 1 || title.top < section.top - 1) issues.push('title outside quadrant');
    });
    if (${JSON.stringify(check.query)} === '?settings') {
      if (!modal) issues.push('missing modal');
      else { const rect = modal.getBoundingClientRect(); if (rect.left < 0 || rect.right > innerWidth || rect.top < 0 || rect.bottom > innerHeight) issues.push('modal outside viewport'); }
    }
    return { viewport: [innerWidth, innerHeight], issues };
  })()` });
  const metrics = result.result.value;
  console.log(check.name, JSON.stringify(metrics));
  if (metrics.issues.length) failed = true;
  if (check.name === 'long text minimum') {
    const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(join(root, 'long-text-check.png'), Buffer.from(capture.data, 'base64'));
  }
}
await send('Browser.close').catch(() => {});
socket.close();
browser.kill();
if (failed) process.exitCode = 1;
