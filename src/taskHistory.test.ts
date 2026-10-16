import {describe, expect, it} from 'vitest';
import {groupTaskVersions, restoreTaskContent} from './taskHistory';
import type {HistoryContent, VersionSummary} from './contentHistory';
import type {Task} from './types';

const task = (id: string, completed = false): Task => ({id, text: id, completed, quadrant: 'important-urgent', createdAt: '2026-10-06T00:00:00Z', updatedAt: '2026-10-06T00:00:00Z'});
describe('task-only history restoration', () => {
  it('recovers deleted tasks and their completed states while retaining current memos', () => {
    const current: HistoryContent = {tasks: [task('current')], dailyMemos: {'2026-10-13': {morning: '保留最新备忘录', afternoon: '', evening: '', updatedAt: 'current'}}};
    const saved: HistoryContent = {tasks: [task('deleted'), task('finished', true)], dailyMemos: {'2026-10-06': {morning: '不恢复旧备忘录', afternoon: '', evening: '', updatedAt: 'old'}}};
    const result = restoreTaskContent(current, saved);
    expect(result.tasks).toEqual(saved.tasks);
    expect(result.dailyMemos).toBe(current.dailyMemos);
    expect(current.tasks[0].id).toBe('current');
    expect(saved.dailyMemos['2026-10-06'].morning).toBe('不恢复旧备忘录');
  });
  it('can restore an empty task version without clearing current memos', () => {
    const current: HistoryContent = {tasks: [task('keep')], dailyMemos: {'2026-10-13': {morning: 'memo', afternoon: '', evening: '', updatedAt: ''}}};
    expect(restoreTaskContent(current, {tasks: [], dailyMemos: {}})).toEqual({tasks: [], dailyMemos: current.dailyMemos});
  });
});
describe('history time groups', () => {
  const version = (id: string, createdAt: number): VersionSummary => ({id, createdAt, reason: 'manual', taskCount: 2, pendingCount: 1, completedCount: 1, memoCount: 0});
  it('groups local calendar dates with newest dates and saves first, without changing its input', () => {
    const older = version('older', new Date(2026, 9, 12, 23, 59).getTime());
    const earlier = version('earlier', new Date(2026, 9, 13, 0, 1).getTime());
    const later = version('later', new Date(2026, 9, 13, 15, 0).getTime());
    const input = [older, earlier, later];
    const groups = groupTaskVersions(input);
    expect(groups.map(group => group.date)).toEqual(['2026-10-13', '2026-10-12']);
    expect(groups[0].versions.map(item => item.id)).toEqual(['later', 'earlier']);
    expect(input).toEqual([older, earlier, later]);
    expect(groupTaskVersions([])).toEqual([]);
  });
});
