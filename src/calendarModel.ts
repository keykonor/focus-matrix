import type { DailyMemo, DailyMemos, MemoPeriod } from './types';

// Local calendar dates must not be derived from UTC ISO timestamps.
export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function isDateKey(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && localDateKey(dateFromKey(key)) === key;
}

export function monthDays(month: string): string[] {
  const first = dateFromKey(`${month}-01`);
  const mondayOffset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) =>
    localDateKey(new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset + index, 12)),
  );
}

export function shiftMonth(month: string, offset: number): string {
  const first = dateFromKey(`${month}-01`);
  return localDateKey(new Date(first.getFullYear(), first.getMonth() + offset, 1, 12)).slice(0, 7);
}

export function hasMemo(memo?: DailyMemo): boolean {
  return Boolean(memo && (memo.morning.trim() || memo.afternoon.trim() || memo.evening.trim()));
}

export function changeMemo(memos: DailyMemos, date: string, period: MemoPeriod, text: string): DailyMemos {
  const next = { ...memos };
  const previous = memos[date] ?? { morning: '', afternoon: '', evening: '', updatedAt: '' };
  const memo = { ...previous, [period]: text, updatedAt: new Date().toISOString() };
  if (!memo.morning && !memo.afternoon && !memo.evening) delete next[date];
  else next[date] = memo;
  return next;
}

export function parseDailyMemos(value: unknown): DailyMemos {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const entries: [string, DailyMemo][] = [];
  for (const [date, raw] of Object.entries(value)) {
    if (!isDateKey(date) || typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue;
    const input = raw as Partial<DailyMemo>;
    entries.push([date, {
      morning: typeof input.morning === 'string' ? input.morning : '',
      afternoon: typeof input.afternoon === 'string' ? input.afternoon : '',
      evening: typeof input.evening === 'string' ? input.evening : '',
      updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : '',
    }]);
  }
  return Object.fromEntries(entries);
}
