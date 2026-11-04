import type { Subtask, Task } from './types';

export function validSubtasks(value: unknown): value is Subtask[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
      typeof item.id !== 'string' || !item.id || ids.has(item.id) ||
      typeof item.text !== 'string' || typeof item.completed !== 'boolean' ||
      typeof item.createdAt !== 'string' || typeof item.updatedAt !== 'string' || 'subtasks' in item) return false;
    ids.add(item.id); return true;
  });
}

export function newSubtask(): Subtask {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), text: '', completed: false, createdAt: now, updatedAt: now };
}

export function changeSubtask(items: Subtask[], id: string, patch: Partial<Pick<Subtask, 'text' | 'completed'>>): Subtask[] {
  return items.map(item => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item);
}

// Existing deployed clients and services only understand parent task fields.
export function cloudTasks(tasks: Task[]): Task[] {
  return tasks.map(({ subtasks: _local, ...task }) => task);
}

export function retainLocalSubtasks(local: Task[], merged: Task[]): Task[] {
  const previous = new Map(local.map(task => [task.id, task]));
  return merged.map(task => {
    const saved = previous.get(task.id);
    if (!saved || saved.subtasks === undefined) return task;
    // Child-only edits also determine whether a completed task is old enough
    // to archive. An old cloud timestamp must not undo that local edit time.
    const left = Date.parse(saved.updatedAt), right = Date.parse(task.updatedAt);
    const updatedAt = Number.isFinite(left) && (!Number.isFinite(right) || left > right) ? saved.updatedAt : task.updatedAt;
    return { ...task, subtasks: saved.subtasks, updatedAt };
  });
}
