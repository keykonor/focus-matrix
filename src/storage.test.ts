import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Store } from '@tauri-apps/plugin-store';
import { saveData } from './storage';
import { defaultSettings } from './types';
import { rolloverCompletedTasks } from './completedTasks';

const { archive } = vi.hoisted(() => ({ archive: vi.fn() }));
vi.mock('./contentHistory', () => ({ archiveContent: archive }));
describe('content history guards the current data', () => {
  beforeEach(() => { archive.mockReset(); });
  it('does not replace current content if version writing fails', async () => {
    const set = vi.fn(), save = vi.fn();
    archive.mockRejectedValue(new Error('Disk full'));
    await expect(saveData({ set, save } as unknown as Store, { tasks: [], dailyMemos: {}, settings: defaultSettings })).rejects.toThrow('Disk full');
    expect(set).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it('writes a recoverable content version before touching the active store', async () => {
    const sequence: string[] = [];
    archive.mockImplementation(async () => { sequence.push('archive'); return null; });
    const set = vi.fn(async (key: string) => { sequence.push(key); });
    const save = vi.fn(async () => { sequence.push('save'); });
    await saveData({ set, save } as unknown as Store, { tasks: [], dailyMemos: {}, settings: defaultSettings });
    expect(sequence).toEqual(['archive', 'tasks', 'settings', 'dailyMemos', 'save']);
    expect(archive).toHaveBeenCalledWith({ tasks: [], dailyMemos: {} });
  });
  it('persists the repository and remaining tasks together and keeps the original plan on failure', async () => {
    const original = { tasks: [{ id: 'done', text: '保留完整内容', completed: true, quadrant: 'important-urgent' as const,
      createdAt: '2026-10-10T12:00:00Z', updatedAt: '2026-10-10T12:00:00Z' }],
      settings: defaultSettings, dailyMemos: {}, taskDay: '2026-10-10' };
    const next = rolloverCompletedTasks(original, '2026-10-16');
    const writes: Record<string, unknown> = {};
    const save = vi.fn().mockRejectedValueOnce(new Error('Disk full')).mockResolvedValue(undefined);
    const store = { set: vi.fn(async (key: string, value: unknown) => { writes[key] = value; }), save } as unknown as Store;
    await expect(saveData(store, next)).rejects.toThrow('Disk full');
    expect(original.tasks).toHaveLength(1);
    await saveData(store, next);
    expect(writes.tasks).toEqual([]);
    expect(writes.completedTasks).toEqual(next.completedTasks);
    expect(writes.taskDay).toBe('2026-10-16');
    expect(writes.settings).toEqual(defaultSettings);
  });
});
