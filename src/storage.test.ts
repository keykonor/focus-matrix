import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Store } from '@tauri-apps/plugin-store';
import { saveData } from './storage';
import { defaultSettings } from './types';

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
});
