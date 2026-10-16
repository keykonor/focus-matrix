import { invoke } from '@tauri-apps/api/core';
import { parseSettings, parseTasks } from './taskModel';
import { isDateKey, parseDailyMemos } from './calendarModel';
import type { AppSettings, DailyMemos, Task } from './types';
import { archiveContent } from './contentHistory';
import { same, type EditMark } from '../cloud-site/lib/syncModel';
import { parseCompletedTasks, type CompletedTaskRecord } from './completedTasks';

export interface AppData { tasks: Task[]; settings: AppSettings; dailyMemos: DailyMemos; syncMarks?: Record<string,EditMark>; completedTasks?: CompletedTaskRecord[]; taskDay?: string; }
export interface LocalDataStore { baseline: AppData | null; }
interface LoadResult { data: Record<string, unknown> | null; guardDate?: string | null; updateNonce?: string | null; }

export function createDataPatch(previous: AppData | null, next: AppData): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of ['tasks', 'syncMarks', 'completedTasks', 'taskDay'] as const) {
    if (next[key] !== undefined && (!previous || !same(previous[key], next[key]))) patch[key] = next[key];
  }
  const settings = Object.fromEntries(Object.entries(next.settings).filter(([key, value]) =>
    !previous || !same(previous.settings[key as keyof AppSettings], value)));
  if (Object.keys(settings).length) patch.settings = settings;
  const memos: Record<string, unknown> = {};
  for (const date of new Set([...Object.keys(previous?.dailyMemos ?? {}), ...Object.keys(next.dailyMemos)])) {
    const before = previous?.dailyMemos[date], after = next.dailyMemos[date];
    if (same(before, after)) continue;
    memos[date] = after ? Object.fromEntries(Object.entries(after).filter(([key, value]) =>
      !before || !same(before[key as keyof typeof before], value))) : null;
  }
  if (Object.keys(memos).length || !previous) patch.dailyMemos = memos;
  return patch;
}

export async function openDataStore(): Promise<{ store: LocalDataStore; data: AppData; guardDate: string | null }> {
  const loaded = await invoke<LoadResult>('read_local_data');
  const raw = loaded.data ?? {};
  if (loaded.data && !Array.isArray(raw.tasks)) throw new Error('原数据缺少任务列表，已停止加载空数据');
  const tasks = parseTasks(raw.tasks);
  if (raw.tasks !== undefined && (!Array.isArray(raw.tasks) || tasks.length !== raw.tasks.length)) {
    throw new Error('存在无法读取的任务，已停止保存，原文件及备份仍保留');
  }
  const dailyMemos = parseDailyMemos(raw.dailyMemos);
  if (raw.dailyMemos !== undefined && (typeof raw.dailyMemos !== 'object' || raw.dailyMemos === null ||
    Array.isArray(raw.dailyMemos) || Object.keys(dailyMemos).length !== Object.keys(raw.dailyMemos).length)) {
    throw new Error('日期备忘录无法完整读取，已停止保存');
  }
  for (const date of Object.keys(dailyMemos)) {
    const original = (raw.dailyMemos as Record<string, Record<string, unknown>>)[date];
    for (const field of ['morning', 'afternoon', 'evening']) {
      if (original[field] !== undefined && typeof original[field] !== 'string') throw new Error('备忘录包含无法读取的内容，停止保存');
    }
  }
  const data: AppData = { tasks, dailyMemos, settings: parseSettings(raw.settings),
    syncMarks: (raw.syncMarks ?? {}) as Record<string, EditMark>,
    completedTasks: parseCompletedTasks(raw.completedTasks),
    taskDay: typeof raw.taskDay === 'string' && isDateKey(raw.taskDay) ? raw.taskDay : undefined };
  // Confirm the exact full update snapshot before allowing UI edits or cloud sync.
  if (loaded.updateNonce) await invoke('ack_update_restore', { nonce: loaded.updateNonce });
  return { store: { baseline: loaded.data ? structuredClone(data) : null }, data,
    guardDate: loaded.guardDate && isDateKey(loaded.guardDate) ? loaded.guardDate : null };
}

export async function saveData(store: LocalDataStore, data: AppData): Promise<void> {
  await archiveContent({ tasks: data.tasks, dailyMemos: data.dailyMemos });
  const patch = createDataPatch(store.baseline, data);
  if (Object.keys(patch).length) await invoke('commit_local_data', { patch });
  // Do not advance this baseline if the atomic write failed.
  store.baseline = structuredClone(data);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('focus-matrix:content-saved'));
}
