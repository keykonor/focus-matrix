import { isDateKey, localDateKey } from './calendarModel';
import { parseTasks } from './taskModel';
import type { Task } from './types';

export interface CompletedTaskRecord {
  id: string;
  task: Task;
  archivedAt: string;
  archivedDate: string;
}

interface TaskDayData {
  tasks: Task[];
  completedTasks?: CompletedTaskRecord[];
  taskDay?: string;
}

export function parseCompletedTasks(value: unknown): CompletedTaskRecord[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('已完成仓库无法读取，原文件已保留');
  return value.map((item: unknown) => {
    if (typeof item !== 'object' || item === null) throw new Error('已完成仓库记录损坏');
    const record = item as Partial<CompletedTaskRecord>;
    const [task] = parseTasks([record.task]);
    if (typeof record.id !== 'string' || !record.id || !task?.completed ||
      typeof record.archivedAt !== 'string' || !Number.isFinite(Date.parse(record.archivedAt)) ||
      typeof record.archivedDate !== 'string' || !isDateKey(record.archivedDate)) {
      throw new Error('已完成仓库记录损坏，停止保存以保护原内容');
    }
    return { ...item, id: record.id, task, archivedAt: record.archivedAt, archivedDate: record.archivedDate };
  });
}

const fingerprint = (task: Task) => JSON.stringify([
  task.id, task.text, task.completed, task.createdAt, task.updatedAt, task.quadrant,
]);

// Plan in memory; the caller saves this entire result before removing UI tasks.
export function rolloverCompletedTasks<T extends TaskDayData>(data: T, today: string, now = new Date()): Omit<T, keyof TaskDayData> & TaskDayData {
  if (!isDateKey(today)) throw new Error('系统日期无效，已停止跨日归档');
  const previousDay = data.taskDay && isDateKey(data.taskDay) ? data.taskDay : undefined;
  if (previousDay && previousDay >= today) return data;
  const completedTasks = [...(data.completedTasks ?? [])];
  const existing = new Set(completedTasks.map(record => fingerprint(record.task)));
  const tasks = data.tasks.filter(task => {
    if (!task.completed) return true;
    const changed = new Date(task.updatedAt);
    // Keep new-day completions. Legacy data first establishes its day without
    // archiving: installing an update is not itself a calendar transition.
    const due = Boolean(previousDay && previousDay < today) && (Number.isFinite(changed.getTime())
      ? localDateKey(changed) < today
      : true);
    if (!due) return true;
    const key = fingerprint(task);
    if (!existing.has(key)) {
      completedTasks.push({ id: crypto.randomUUID(), task: { ...task },
        archivedAt: now.toISOString(), archivedDate: today });
      existing.add(key);
    }
    return false;
  });
  return { ...data, tasks, completedTasks, taskDay: today };
}
