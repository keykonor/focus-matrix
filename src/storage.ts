import { invoke } from '@tauri-apps/api/core';
import { load, type Store } from '@tauri-apps/plugin-store';
import { parseSettings, parseTasks } from './taskModel';
import { parseDailyMemos } from './calendarModel';
import type { AppSettings, DailyMemos, Task } from './types';
import { archiveContent } from './contentHistory';
import type { EditMark } from '../cloud-site/lib/syncModel';

const STORE_NAME = 'focus-matrix.json';

export interface AppData { tasks: Task[]; settings: AppSettings; dailyMemos: DailyMemos; syncMarks?: Record<string,EditMark>; }

export async function openDataStore(): Promise<{ store: Store; data: AppData }> {
  let store: Store;
  try {
    store = await load(STORE_NAME, { autoSave: false });
  } catch (error) {
    if (import.meta.env.DEV) console.error('数据文件无法读取，正在备份并恢复默认数据', error);
    await invoke('backup_corrupt_store');
    store = await load(STORE_NAME, { autoSave: false });
  }
  return { store, data: {
    tasks: parseTasks(await store.get<unknown>('tasks')),
    settings: parseSettings(await store.get<unknown>('settings')),
    dailyMemos: parseDailyMemos(await store.get<unknown>('dailyMemos')),
    syncMarks: await store.get<Record<string,EditMark>>('syncMarks') ?? {},
  } };
}

export async function saveData(store: Store, data: AppData): Promise<void> {
  // Archive both the previous on-disk content and this revision before replacing it.
  // A failed history write stops the save so the previous content stays recoverable.
  await archiveContent({ tasks: data.tasks, dailyMemos: data.dailyMemos });
  await store.set('tasks', data.tasks);
  await store.set('settings', data.settings);
  await store.set('dailyMemos', data.dailyMemos);
  if(data.syncMarks) await store.set('syncMarks', data.syncMarks);
  await store.save();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('focus-matrix:content-saved'));
}
