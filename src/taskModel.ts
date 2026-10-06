import { defaultSettings, quadrants, type AppSettings, type QuadrantType, type Task } from './types';

export function newTask(quadrant: QuadrantType): Task {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), text: '', completed: false, createdAt: now, updatedAt: now, quadrant };
}

export function changeTask(task: Task, patch: Partial<Pick<Task, 'text' | 'completed' | 'quadrant'>>): Task {
  return { ...task, ...patch, updatedAt: new Date().toISOString() };
}

export function parseTasks(value: unknown): Task[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Task =>
    typeof item === 'object' && item !== null &&
    typeof item.id === 'string' && typeof item.text === 'string' &&
    typeof item.completed === 'boolean' && typeof item.createdAt === 'string' &&
    typeof item.updatedAt === 'string' && quadrants.includes(item.quadrant),
  );
}

export function parseSettings(value: unknown): AppSettings {
  if (typeof value !== 'object' || value === null) return defaultSettings;
  const input = value as Partial<AppSettings>;
  return {
    autostart: typeof input.autostart === 'boolean' ? input.autostart : defaultSettings.autostart,
    alwaysOnTop: typeof input.alwaysOnTop === 'boolean' ? input.alwaysOnTop : defaultSettings.alwaysOnTop,
    desktopMode: input.alwaysOnTop === true ? false : (typeof input.desktopMode === 'boolean' ? input.desktopMode : defaultSettings.desktopMode),
    closeBehavior: input.closeBehavior === 'quit' ? 'quit' : 'tray',
    fontSize: input.fontSize === 'small' || input.fontSize === 'large' ? input.fontSize : 'medium',
    opacity: typeof input.opacity === 'number' && Number.isFinite(input.opacity)
      ? (input.desktopMode === undefined && input.opacity === 100 ? 90 : Math.max(80, Math.min(100, input.opacity)))
      : defaultSettings.opacity,
    showCompleted: typeof input.showCompleted === 'boolean' ? input.showCompleted : defaultSettings.showCompleted,
    calendarOpen: typeof input.calendarOpen === 'boolean' ? input.calendarOpen : defaultSettings.calendarOpen,
  };
}
