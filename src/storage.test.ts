import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataPatch, openDataStore, saveData, type AppData, type LocalDataStore } from './storage';
import { defaultSettings } from './types';
import { rolloverCompletedTasks } from './completedTasks';

const { archive, invoke } = vi.hoisted(() => ({ archive: vi.fn(), invoke: vi.fn() }));
vi.mock('./contentHistory', () => ({ archiveContent: archive }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
describe('content history guards the current data', () => {
  beforeEach(() => { archive.mockReset(); invoke.mockReset(); });
  it('does not replace current content if version writing fails', async () => {
    const store: LocalDataStore = { baseline: null };
    archive.mockRejectedValue(new Error('Disk full'));
    await expect(saveData(store, { tasks: [], dailyMemos: {}, settings: defaultSettings })).rejects.toThrow('Disk full');
    expect(invoke).not.toHaveBeenCalled();
    expect(store.baseline).toBeNull();
  });
  it('writes a recoverable content version before touching the active store', async () => {
    const sequence: string[] = [];
    archive.mockImplementation(async () => { sequence.push('archive'); return null; });
    invoke.mockImplementation(async () => { sequence.push('commit'); });
    await saveData({ baseline: null }, { tasks: [], dailyMemos: {}, settings: defaultSettings });
    expect(sequence).toEqual(['archive', 'commit']);
    expect(archive).toHaveBeenCalledWith({ tasks: [], dailyMemos: {} });
  });
  it('persists the repository and remaining tasks together and keeps the original plan on failure', async () => {
    const original = { tasks: [{ id: 'done', text: '保留完整内容', completed: true, quadrant: 'important-urgent' as const,
      createdAt: '2026-10-10T12:00:00Z', updatedAt: '2026-10-10T12:00:00Z' }],
      settings: defaultSettings, dailyMemos: {}, taskDay: '2026-10-10' };
    const next = rolloverCompletedTasks(original, '2026-10-16');
    invoke.mockRejectedValueOnce(new Error('Disk full')).mockResolvedValue(undefined);
    const store = { baseline: structuredClone(original) };
    await expect(saveData(store, next)).rejects.toThrow('Disk full');
    expect(original.tasks).toHaveLength(1);
    expect(store.baseline).toEqual(original);
    await saveData(store, next);
    const patch = invoke.mock.calls[1][1].patch;
    expect(patch.tasks).toEqual([]);
    expect(patch.completedTasks).toEqual(next.completedTasks);
    expect(patch.taskDay).toBe('2026-10-16');
    expect(patch.settings).toBeUndefined();
    expect(patch.dailyMemos).toBeUndefined();
  });
  it('does not rewrite unrelated settings, dates or fields', () => {
    const original: AppData = { tasks: [], settings: defaultSettings, dailyMemos: {
      '2026-10-16': { morning: 'keep', afternoon: 'keep', evening: 'keep', updatedAt: 'old' } } };
    expect(createDataPatch(original, original)).toEqual({});
    expect(createDataPatch(original, { ...original, dailyMemos: {
      ...original.dailyMemos, '2026-10-16': { ...original.dailyMemos['2026-10-16'], evening: 'new' } } }))
      .toEqual({ dailyMemos: { '2026-10-16': { evening: 'new' } } });
  });
  it('a load failure never renames the store or initializes blank data', async () => {
    invoke.mockRejectedValue(new Error('Invalid JSON'));
    await expect(openDataStore()).rejects.toThrow('Invalid JSON');
    expect(invoke.mock.calls.map(call => call[0])).toEqual(['read_local_data']);
  });
  it('confirms update restoration before returning editable state and keeps its date guard', async () => {
    const data = { tasks: [], dailyMemos: {}, settings: defaultSettings, completedTasks: [], taskDay: '2026-10-15', syncMarks: {} };
    invoke.mockResolvedValueOnce({ data, updateNonce: 'nonce', guardDate: '2026-10-16' }).mockResolvedValueOnce(undefined);
    const loaded = await openDataStore();
    expect(invoke.mock.calls.map(call => call[0])).toEqual(['read_local_data', 'ack_update_restore']);
    expect(loaded.guardDate).toBe('2026-10-16');
    expect(loaded.data).toEqual(data);
  });
  it('does not silently discard an unreadable task or memo', async () => {
    invoke.mockResolvedValueOnce({ data: {} });
    await expect(openDataStore()).rejects.toThrow('缺少任务列表');
    invoke.mockResolvedValueOnce({ data: { tasks: [{ broken: true }] } });
    await expect(openDataStore()).rejects.toThrow('无法读取的任务');
    invoke.mockResolvedValueOnce({ data: { tasks: [], dailyMemos: { '2026-10-16': { morning: 123 } } } });
    await expect(openDataStore()).rejects.toThrow('无法读取的内容');
  });
});
