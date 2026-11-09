import { isDateKey } from './calendarModel';

export interface MemoSchedule {
  mode: 'periods' | 'hourly';
  hours: number[];
  notes: Record<string, string>;
}

export type DailyMemoSchedules = Record<string, MemoSchedule>;
export const memoHours = Array.from({ length: 24 }, (_, hour) => hour);
export const defaultMemoSchedule: MemoSchedule = { mode: 'periods', hours: memoHours, notes: {} };

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function parseMemoSchedules(value: unknown): DailyMemoSchedules {
  const error = '备忘录时间段无法读取，已停止保存';
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw Error(error);
  const entries: [string, MemoSchedule][] = [];
  for (const [date, schedule] of Object.entries(value)) {
    if (!isDateKey(date) || !schedule || typeof schedule !== 'object') throw Error(error);
    const { mode, hours, notes } = schedule as Partial<MemoSchedule>;
    if ((mode !== 'periods' && mode !== 'hourly') || !Array.isArray(hours) || !hours.length ||
        hours.some((hour, index) => !memoHours.includes(hour) || (index > 0 && hour <= hours[index - 1])) ||
        !notes || typeof notes !== 'object' || Array.isArray(notes) ||
        Object.entries(notes).some(([hour, text]) => !memoHours.some(value => String(value) === hour) || typeof text !== 'string')) {
      throw Error(error);
    }
    entries.push([date, { mode, hours, notes }]);
  }
  return Object.fromEntries(entries);
}
