import { describe, expect, it } from 'vitest';
import { parseTasks, changeTask } from './taskModel';
import { rolloverCompletedTasks } from './completedTasks';
import { restoreTaskContent } from './taskHistory';
import { changeSubtask, cloudTasks, newSubtask, retainLocalSubtasks } from './subtasks';
import { mergeContent } from '../cloud-site/lib/syncModel';

const child = { id: 'child', text: '准备材料', completed: false, createdAt: 'old', updatedAt: 'old' };
const parent = { id: 'parent', text: '准备汇报', completed: false, quadrant: 'important-urgent' as const, createdAt: 'old', updatedAt: 'old' };

describe('one-level subtasks compatibility', () => {
  it('creates independent identifiers and edits children immutably', () => {
    expect(newSubtask().id).not.toBe(newSubtask().id);
    const items = [child, { ...child, id: 'second' }];
    const next = changeSubtask(items, 'child', { completed: true });
    expect(next[0].completed).toBe(true); expect(next[1]).toBe(items[1]);
    expect(items[0].completed).toBe(false);
    expect(parent.completed).toBe(false);
  });
  it('accepts legacy tasks without rewriting them and preserves valid children', () => {
    expect(parseTasks([parent])).toEqual([parent]);
    const task = { ...parent, subtasks: [child] };
    expect(parseTasks([task])).toEqual([task]);
  });
  it('rejects unreadable child lists instead of silently keeping corrupt data', () => {
    for (const subtasks of [null, 'broken', [{ ...child, completed: 'yes' }], [{ ...child, text: 5 }], [{ ...child, subtasks: [] }]]) {
      expect(parseTasks([{ ...parent, subtasks }])).toEqual([]);
    }
  });
  it('rejects duplicate child identifiers', () => {
    expect(parseTasks([{ ...parent, subtasks: [child, { ...child, text: '其他材料' }] }])).toEqual([]);
  });
  it('keeps child completion independent and retains children when moving the parent', () => {
    const task = { ...parent, subtasks: [child] };
    expect(changeTask(task, { completed: true }).subtasks).toEqual([child]);
    expect(changeTask(task, { quadrant: 'important-not-urgent' }).subtasks).toEqual([child]);
  });
  it('archives and restores the complete child list without changing memos or diaries', () => {
    const task = { ...parent, completed: true, subtasks: [child] };
    const current = { tasks: [task], dailyMemos: {}, dailyDiaries: { '2026-11-03': '保留日记' }, taskDay: '2026-11-03' };
    const rolled = rolloverCompletedTasks(current, '2026-11-04');
    expect(rolled.completedTasks?.[0].task).toEqual(task);
    expect(restoreTaskContent({ ...current, tasks: [] }, current).tasks).toEqual([task]);
    expect(rolled.dailyDiaries).toEqual(current.dailyDiaries);
  });
  it('does not deduplicate different child snapshots with equal parent fields', () => {
    const task = { ...parent, completed: true, subtasks: [child] };
    const old = { ...task, subtasks: [{ ...child, text: '旧材料' }] };
    const rolled = rolloverCompletedTasks({ tasks: [task], taskDay: '2026-11-03', completedTasks: [
      { id: 'archive', task: old, archivedAt: '2026-11-03T12:00:00Z', archivedDate: '2026-11-03' },
    ] }, '2026-11-04');
    expect(rolled.completedTasks).toHaveLength(2);
  });
  it('sends only parent fields to old cloud clients and retains local children and timestamps', () => {
    const task = { ...parent, completed: true, updatedAt: new Date(2026, 10, 4, 8).toISOString(), subtasks: [child] };
    const remote = { ...parent, completed: true, updatedAt: new Date(2026, 10, 3, 8).toISOString() };
    expect(cloudTasks([task])[0]).not.toHaveProperty('subtasks');
    const result = retainLocalSubtasks([task], [{ ...remote, text: '远端修改父任务' }]);
    expect(result[0]).toMatchObject({ text: '远端修改父任务', subtasks: [child], updatedAt: task.updatedAt });
    expect(rolloverCompletedTasks({ tasks: result, taskDay: '2026-11-03' }, '2026-11-04').tasks).toHaveLength(1);
  });
  it('preserves child lists in both copies of a parent conflict and respects remote deletion', () => {
    const base = { tasks: [parent], dailyMemos: {} };
    const local = { tasks: [{ ...parent, text: '本地修改', subtasks: [child] }], dailyMemos: {} };
    const remote = { tasks: [{ ...parent, text: '远端修改' }], dailyMemos: {} };
    const merged = mergeContent(base, local, remote);
    const tasks = retainLocalSubtasks(local.tasks, merged.content.tasks);
    expect(tasks).toHaveLength(2);
    expect(tasks.every(task => task.subtasks?.[0].text === child.text)).toBe(true);
    expect(retainLocalSubtasks(local.tasks, [])).toEqual([]);
  });
});
