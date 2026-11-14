export const quadrants = ['important-not-urgent', 'important-urgent', 'not-important-not-urgent', 'urgent-not-important'] as const;
export type QuadrantType = typeof quadrants[number];

export interface Subtask {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  quadrant: QuadrantType;
  subtasks?: Subtask[];
}

export interface AppSettings {
  autostart: boolean;
  alwaysOnTop: boolean;
  desktopMode: boolean;
  closeBehavior: 'tray' | 'quit';
  fontSize: 'small' | 'medium' | 'large';
  opacity: number;
  showCompleted: boolean;
  calendarOpen: boolean;
  theme?: 'classic' | 'warm-gray' | 'light';
  density?: 'comfortable' | 'compact';
}

export const memoPeriods = ['morning', 'afternoon', 'evening'] as const;
export type MemoPeriod = typeof memoPeriods[number];
export interface DailyMemo {
  morning: string;
  afternoon: string;
  evening: string;
  updatedAt: string;
}
export type DailyMemos = Record<string, DailyMemo>;

export const defaultSettings: AppSettings = {
  autostart: true,
  alwaysOnTop: false,
  desktopMode: true,
  closeBehavior: 'tray',
  fontSize: 'medium',
  opacity: 90,
  showCompleted: true,
  calendarOpen: false,
  theme: 'classic',
  density: 'comfortable',
};

export const quadrantNames: Record<QuadrantType, string> = {
  'important-not-urgent': '重要不紧急',
  'important-urgent': '重要紧急',
  'not-important-not-urgent': '不重要不紧急',
  'urgent-not-important': '紧急不重要',
};
