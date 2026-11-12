import { isDateKey } from './calendarModel';
import type { MemoPeriod } from './types';

export interface ChatEntry {
  date: string;
  period: MemoPeriod;
  hour?: number;
  text: string;
}

export interface ChatPreview {
  date?: string;
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

export function confirmChatEntry(preview: ChatPreview): ChatEntry | undefined {
  const { date, period, hour, minute, endTime, deadline, text } = preview;
  const value = text.trim();
  if (!date || !isDateKey(date) || !period || !value) return;
  if (hour === undefined || minute === undefined) return { date, period, text: value };
  const start = chatTimeLabel(hour, minute);
  const time = deadline ? start + ' 前' : endTime ? start + '–' + endTime : start;
  return { date, period, hour, text: value.startsWith(time + ' ') ? value : time + ' ' + value };
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
