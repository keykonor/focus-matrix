// Browser-only acceptance harness. It never opens the user's Tauri data files.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import '../src/styles.css';

const saved = sessionStorage.getItem('calendar-check-data');
const store: Record<string, unknown> = saved ? JSON.parse(saved) : {
  tasks: [{ id: 'existing-task', text: '更新前已有的任务', completed: false, quadrant: 'important-urgent', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }],
  settings: { autostart: false, desktopMode: false, opacity: 90, fontSize: 'medium', showCompleted: true, closeBehavior: 'tray' },
};
const versions: import('../src/contentHistory').ContentVersion[] = JSON.parse(sessionStorage.getItem('content-check-history') ?? '[]');
let lastFingerprint: string | null = null;
const record = (content: import('../src/contentHistory').HistoryContent, reason: import('../src/contentHistory').HistoryReason, force = false) => {
  const fingerprint = JSON.stringify(content);
  if (!force && fingerprint === lastFingerprint) return null;
  const version = { schemaVersion: 1, id: `version-test-${versions.length}.json`, createdAt: Date.now(), reason, content: structuredClone(content) };
  versions.push(version);
  lastFingerprint = fingerprint;
  sessionStorage.setItem('content-check-history', JSON.stringify(versions));
  return version;
};
mockWindows('main');
mockIPC((command, payload) => {
  if(command==='ack_cloud_applied'){sessionStorage.removeItem('cloud-check-delivery');sessionStorage.setItem('cloud-check-ack','1');}
  if (['get_cloud_status', 'sync_cloud', 'set_cloud_sharing', 'rotate_cloud_link','set_share_editing','ack_cloud_applied'].includes(command)) return {
    delivery:JSON.parse(sessionStorage.getItem('cloud-check-delivery')??'null'),editingEnabled:true,configured: true, enabled: command === 'set_cloud_sharing' ? Boolean(payload?.enabled) : false,
    shareUrl: 'https://example.invalid/#test', lastSyncedAt: Date.now(), error: null,
  };
  if (command === 'list_mobile_devices') return {devices:[]};
  if (command === 'create_mobile_pairing') return {pairingUrl:'https://example.invalid/mobile/index.html#pair=test',expiresAt:Date.now()+600000};
  if (command === 'get_cloud_changes') return {items:[]};
  if (command === 'save_content_version') {
    if (sessionStorage.getItem('history-check-fail') === '1') throw new Error('Simulated history write failure');
    const persisted = sessionStorage.getItem('calendar-check-data');
    if (persisted) {
      const previous = JSON.parse(persisted);
      record({ tasks: previous.tasks, dailyMemos: previous.dailyMemos ?? {} }, lastFingerprint === null ? 'initial' : 'automatic');
    }
    const reason = payload?.reason as import('../src/contentHistory').HistoryReason;
    const version = record(payload?.content as import('../src/contentHistory').HistoryContent, reason, reason !== 'automatic');
    if (reason === 'before-restore' && sessionStorage.getItem('history-check-restore-fail') === '1') {
      sessionStorage.removeItem('history-check-restore-fail');
      sessionStorage.setItem('history-check-store-fail', '1');
    }
    return version;
  }
  if (command === 'list_content_versions') return { versions: [...versions].reverse().map((version) => ({ ...version,
    taskCount: version.content.tasks.length,
    memoCount: Object.values(version.content.dailyMemos).filter((memo) => memo.morning.trim() || memo.afternoon.trim() || memo.evening.trim()).length,
    content: undefined,
  })), unreadableCount: 0 };
  if (command === 'get_content_version') {
    const version = versions.find((item) => item.id === payload?.id);
    if (!version) throw new Error('Version not found');
    return structuredClone(version);
  }
  if (command === 'plugin:store|load') return 1;
  if (command === 'plugin:store|get') { const key = String(payload?.key); return [store[key], key in store]; }
  if (command === 'plugin:store|set') { store[String(payload?.key)] = payload?.value; return; }
  if (command === 'plugin:store|save') {
    if (sessionStorage.getItem('history-check-store-fail') === '1') { sessionStorage.removeItem('history-check-store-fail'); throw new Error('Simulated current data write failure'); }
    sessionStorage.setItem('calendar-check-data', JSON.stringify(store)); return;
  }
}, { shouldMockEvents: true });
// App obtains the current native window at module initialization.
const { default: App } = await import('../src/App');
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

