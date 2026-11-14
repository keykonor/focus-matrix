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
  startTime?: string;
  endTime?: string;
  deadline?: boolean;
  description?: string;
  sourceText?: string;
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
  sourceText?: string;
}

export function chatTimeLabel(hour: number, minute: number): string {
  return [hour, minute].map(value => String(value).padStart(2, '0')).join(':');
}

export function chatPeriodForHour(hour: number): MemoPeriod {
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
}

export function confirmChatEntry(preview: ChatPreview): ChatEntry | undefined {
  const { date, period, hour, minute, endTime, deadline, text, timeMode, sourceText } = preview;
  const value = text.trim();
  if (!date || !isDateKey(date) || !value) return;
  const start = hour !== undefined && minute !== undefined && Number.isInteger(hour) && Number.isInteger(minute) &&
    hour >= 0 && hour < 24 && minute >= 0 && minute < 60 ? chatTimeLabel(hour, minute) : undefined;
  const end = start && !deadline && endTime && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(endTime) && endTime > start
    ? endTime : undefined;
  const metadata = { description: value, ...(start && { startTime: start }), ...(end && { endTime: end }),
    ...(deadline && start && { deadline }), ...(sourceText && { sourceText }) };
  if (timeMode === 'periods' || (!timeMode && (hour === undefined || minute === undefined))) {
    return period ? { date, period, text: value, ...metadata } : undefined;
  }
  if (hour === undefined || !start || (endTime && !deadline && !end)) return;
  const time = deadline ? start + ' 前' : end ? start + '–' + end : start;
  const description = value.startsWith(time + ' ') ? value.slice(time.length + 1).trim() : value;
  return description ? { date, period: chatPeriodForHour(hour), hour, text: time + ' ' + description, ...metadata, description } : undefined;
}

export function chatEntryFingerprint(entry: ChatEntry): string {
  const title = (entry.description ?? entry.text).normalize('NFKC').toLowerCase()
    .replace(/\s+/g, '').replace(/[。.!！]+$/, '');
  return JSON.stringify([entry.date, entry.startTime ?? entry.period, entry.endTime ?? '', Boolean(entry.deadline), title]);
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
