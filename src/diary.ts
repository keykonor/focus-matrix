import { isDateKey } from './calendarModel';
export function changeDiary(value: Record<string, string>, date: string, text: string): Record<string, string> {
  const next = { ...value };
  if (text) next[date] = text; else delete next[date];
  return next;
}
export function parseDiaries(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw Error('日记数据无法读取，已停止保存');
  for (const [date, text] of Object.entries(value)) if (!isDateKey(date) || typeof text !== 'string') throw Error('日记数据无法读取，已停止保存');
  return { ...value } as Record<string, string>;
}
