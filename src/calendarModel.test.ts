import { describe, expect, it } from 'vitest';
import { changeMemo, dateFromKey, hasMemo, isDateKey, localDateKey, monthDays, parseDailyMemos, shiftMonth } from './calendarModel';
import { parseSettings } from './taskModel';

describe('local calendar dates', () => {
  it('uses the local day even near midnight and validates leap days', () => {
    expect(localDateKey(new Date(2026, 9, 3, 0, 1))).toBe('2026-10-03');
    expect(localDateKey(dateFromKey('2026-10-03'))).toBe('2026-10-03');
    expect(isDateKey('2024-02-29')).toBe(true);
    expect(isDateKey('2026-02-29')).toBe(false);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('__proto__')).toBe(false);
  });
  it('builds a Monday-first calendar and handles year boundaries', () => {
    const days = monthDays('2026-10');
    expect(days).toHaveLength(42);
    expect(days[0]).toBe('2026-09-28');
    expect(days[41]).toBe('2026-11-08');
    expect(monthDays('2024-02')).toContain('2024-02-29');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('daily memo persistence', () => {
  it('keeps different periods and dates independent without mutating saved content', () => {
    const original = changeMemo({}, '2026-10-03', 'morning', '已有安排\n第二行');
    const afternoon = changeMemo(original, '2026-10-03', 'afternoon', '下午安排');
    const tomorrow = changeMemo(afternoon, '2026-10-04', 'evening', '明晚安排');
    expect(original['2026-10-03'].afternoon).toBe('');
    expect(tomorrow['2026-10-03'].morning).toBe('已有安排\n第二行');
    expect(tomorrow['2026-10-03'].afternoon).toBe('下午安排');
    expect(tomorrow['2026-10-04'].evening).toBe('明晚安排');
    expect(parseDailyMemos(JSON.parse(JSON.stringify(tomorrow)))).toEqual(tomorrow);
    expect(hasMemo(tomorrow['2026-10-03'])).toBe(true);
    expect(changeMemo(original, '2026-10-03', 'morning', '')).toEqual({});
  });
  it('loads old installs without notes and isolates malformed note entries', () => {
    expect(parseDailyMemos(undefined)).toEqual({});
    expect(parseDailyMemos([])).toEqual({});
    const notes = parseDailyMemos({ '2026-10-03': { morning: '保留', afternoon: 42 }, '2026-02-29': { morning: '无效日期' } });
    expect(notes['2026-10-03'].morning).toBe('保留');
    expect(notes['2026-10-03'].afternoon).toBe('');
    expect(notes['2026-02-29']).toBeUndefined();
    expect(parseSettings({}).calendarOpen).toBe(false);
    expect(parseSettings({ calendarOpen: true }).calendarOpen).toBe(true);
  });
});
