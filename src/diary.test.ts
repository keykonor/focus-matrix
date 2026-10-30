import { describe, expect, it } from 'vitest';
import { changeDiary, parseDiaries } from './diary';

describe('daily diaries', () => {
  it('stores each date independently and removes only the cleared entry', () => {
    const first = changeDiary({}, '2026-10-30', '今天的日记\n第二行');
    expect(first['2026-10-30']).toBe('今天的日记\n第二行');
    const second = changeDiary(first, '2026-10-31', '明天');
    expect(first['2026-10-31']).toBeUndefined();
    expect(parseDiaries(JSON.parse(JSON.stringify(second)))).toEqual(second);
    expect(changeDiary(second, '2026-10-31', '')).toEqual(first);
  });
  it('rejects malformed stored data instead of silently losing it', () => {
    expect(parseDiaries(undefined)).toEqual({});
    expect(() => parseDiaries({ '2026-02-30': 'bad' })).toThrow();
    expect(() => parseDiaries({ '2026-10-30': 5 })).toThrow();
  });
});
