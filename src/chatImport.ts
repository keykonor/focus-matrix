import { hasMemo, isDateKey } from './calendarModel';
import type { DailyMemoSchedules, MemoSchedule } from './memoSchedule';
import type { DailyMemos, MemoPeriod } from './types';

export type ChatLayout = MemoSchedule['mode'];
export type ChatLayouts = Record<string, ChatLayout>;

interface ChatLayoutPlan {
  suggested: ChatLayout;
  existing?: ChatLayout;
  conflict: boolean;
}

export interface ChatEntry {
  date: string;
  period: MemoPeriod;
  hour?: number;
  text: string;
}

export interface ChatPreview {
  date?: string;
  timeMode?: ChatLayout;
  period?: MemoPeriod;
  hour?: number;
  minute?: number;
  endTime?: string;
  deadline?: boolean;
  text: string;
}

export function chatTimeLabel(hour: number, minute: number): string {
  return [hour, minute].map(value => String(value).padStart(2, '0')).join(':');
}

export function chatPeriodForHour(hour: number): MemoPeriod {
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
}

export function confirmChatEntry(preview: ChatPreview): ChatEntry | undefined {
  const { date, period, hour, minute, endTime, deadline, text, timeMode } = preview;
  const value = text.trim();
  if (!date || !isDateKey(date) || !value) return;
  if (timeMode === 'periods' || (!timeMode && (hour === undefined || minute === undefined))) {
    return period ? { date, period, text: value } : undefined;
  }
  if (hour === undefined || minute === undefined || !Number.isInteger(hour) || !Number.isInteger(minute) ||
      hour < 0 || hour > 23 || minute < 0 || minute > 59) return;
  const start = chatTimeLabel(hour, minute);
  const time = deadline ? start + ' 前' : endTime ? start + '–' + endTime : start;
  return { date, period: chatPeriodForHour(hour), hour, text: value.startsWith(time + ' ') ? value : time + ' ' + value };
}

export function planChatLayouts(entries: ChatEntry[], schedules: DailyMemoSchedules | undefined, memos: DailyMemos): Record<string, ChatLayoutPlan> {
  const requested = new Map<string, Set<ChatLayout>>();
  for (const { date, hour } of entries) {
    const modes = requested.get(date) ?? new Set<ChatLayout>();
    modes.add(hour === undefined ? 'periods' : 'hourly');
    requested.set(date, modes);
  }
  return Object.fromEntries(Array.from(requested, ([date, modes]) => {
    const existing = schedules?.[date]?.mode ?? (hasMemo(memos[date]) ? 'periods' : undefined);
    const suggested = modes.has('hourly') ? 'hourly' : 'periods';
    return [date, { suggested, ...(existing ? { existing } : {}), conflict: modes.size > 1 || Boolean(existing && existing !== suggested) }];
  }));
}

export function appendChatLine(current: string, line: string): string {
  if (current.split(/\r?\n/).includes(line)) return current;
  return current ? current + (current.endsWith('\n') ? '' : '\n') + line : line;
}

export function removeChatLine(current: string, line: string): string {
  const lines = current.split('\n');
  if (lines.filter(value => value === line).length !== 1) return current;
  return lines.filter(value => value !== line).join('\n');
}
