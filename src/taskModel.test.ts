import { describe, expect, it } from 'vitest';
import { changeTask, newTask, parseSettings, parseTasks } from './taskModel';
import { defaultSettings } from './types';

describe('task data', () => {
  it('creates a complete task record and updates its quadrant', () => {
    const task = newTask('important-not-urgent');
    expect(task.id).toBeTruthy();
    expect(task.completed).toBe(false);
    const moved = changeTask(task, { quadrant: 'important-urgent', text: '完成报告' });
    expect(moved.quadrant).toBe('important-urgent');
    expect(moved.text).toBe('完成报告');
    expect(moved.id).toBe(task.id);
  });

  it('drops invalid records and clamps saved settings', () => {
    const valid = newTask('urgent-not-important');
    expect(parseTasks([valid, { id: 'bad', text: 5 }])).toEqual([valid]);
    expect(parseTasks('damaged')).toEqual([]);
    expect(parseSettings({ opacity: 2, showCompleted: false })).toEqual({ ...defaultSettings, opacity: 80, showCompleted: false });
    expect(parseSettings({ alwaysOnTop: true, opacity: 100 })).toEqual({ ...defaultSettings, alwaysOnTop: true, desktopMode: false, opacity: 90 });
    expect(parseSettings({ desktopMode: false, opacity: 100 }).opacity).toBe(100);
  });
});
