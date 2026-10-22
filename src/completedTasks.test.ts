import { describe, expect, it } from 'vitest';
import { parseCompletedTasks, rolloverCompletedTasks } from './completedTasks';
import type { Task } from './types';

// These fixtures describe local calendar days, regardless of the runner's zone.
const task = (id: string, completed = true, date = new Date(2026, 9, 15, 15, 59).toISOString()): Task => ({
  id, text: `${id} 的完整内容\n第二行`, completed, quadrant: 'important-urgent', createdAt: date, updatedAt: date,
});
const now = new Date(2026, 9, 16, 0, 1);

describe('completed task repository', () => {
  it('moves yesterday completions on a new day and keeps pending/new-day tasks, memos and settings', () => {
    const data = { tasks: [task('done'), task('pending', false), task('new-day', true, new Date(2026, 9, 16).toISOString())],
      taskDay: '2026-10-15', completedTasks: [], dailyMemos: { keep: 'memo' }, settings: { keep: true } };
    const result = rolloverCompletedTasks(data, '2026-10-16', now);
    expect(result.tasks.map(item => item.id)).toEqual(['pending', 'new-day']);
    expect(result.completedTasks).toHaveLength(1);
    expect(result.completedTasks![0].task).toEqual(data.tasks[0]);
    expect(result.completedTasks![0].archivedDate).toBe('2026-10-16');
    expect(result.dailyMemos).toBe(data.dailyMemos);
    expect(result.settings).toBe(data.settings);
    expect(data.tasks).toHaveLength(3);
    expect(data.completedTasks).toEqual([]);
  });
  it('does not clear tasks during the same day or when the clock moves backwards', () => {
    const data = { tasks: [task('done')], taskDay: '2026-10-16' };
    expect(rolloverCompletedTasks(data, '2026-10-16', now)).toBe(data);
    expect(rolloverCompletedTasks(data, '2026-10-14', now)).toBe(data);
  });
  it('catches up after several closed days and does not duplicate already archived content', () => {
    const original = { tasks: [task('done'), task('pending', false)], taskDay: '2026-10-10' };
    const first = rolloverCompletedTasks(original, '2026-10-16', now);
    const repeated = rolloverCompletedTasks({ ...first, taskDay: '2026-10-15', tasks: original.tasks }, '2026-10-16', now);
    expect(repeated.completedTasks).toHaveLength(1);
    expect(repeated.tasks.map(item => item.id)).toEqual(['pending']);
    expect(rolloverCompletedTasks(first, '2026-10-16', now)).toBe(first);
  });
  it('initializes legacy data without treating an upgrade as a date change', () => {
    const result = rolloverCompletedTasks({ tasks: [task('old'), task('today', true, new Date(2026, 9, 16, 1).toISOString()), task('unknown', true, '')] }, '2026-10-16', now);
    expect(result.tasks.map(item => item.id)).toEqual(['old', 'today', 'unknown']);
    expect(result.completedTasks).toEqual([]);
  });
  it('keeps exact task text and can read the saved archive after restart', () => {
    const result = rolloverCompletedTasks({ tasks: [task('多行长内容')], taskDay: '2026-10-15' }, '2026-10-16', now);
    expect(parseCompletedTasks(JSON.parse(JSON.stringify(result.completedTasks)))).toEqual(result.completedTasks);
    expect(parseCompletedTasks(undefined)).toEqual([]);
    expect(() => parseCompletedTasks({ broken: true })).toThrow();
    expect(() => parseCompletedTasks([{ id: 'bad', task: task('bad') }])).toThrow();
  });
});
