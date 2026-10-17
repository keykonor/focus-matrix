import { afterEach, describe, expect, it, vi } from 'vitest';
import { millisecondsUntilNextLocalDay, startLocalDayClock } from './localDayClock';

afterEach(() => { vi.useRealTimers(); });

describe('local midnight clock', () => {
  it('advances the date at midnight without focus, visibility or a restart', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 17, 23, 59, 59, 900));
    const changes: string[] = [];
    const clock = startLocalDayClock(day => changes.push(day));
    expect(changes).toEqual(['2026-10-17']);
    vi.advanceTimersByTime(99);
    expect(changes).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual(['2026-10-17', '2026-10-18']);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(changes.at(-1)).toBe('2026-10-19');
    clock.dispose();
  });
  it('uses the next calendar midnight and cancels all timers on cleanup', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 59, 500));
    expect(millisecondsUntilNextLocalDay()).toBe(500);
    const changed = vi.fn();
    const clock = startLocalDayClock(changed);
    clock.dispose();
    vi.advanceTimersByTime(1000);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('reschedules when the system clock is changed before its old deadline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 17, 10));
    const changed = vi.fn();
    const clock = startLocalDayClock(changed);
    vi.setSystemTime(new Date(2026, 9, 18, 9));
    vi.advanceTimersByTime(30_000);
    expect(changed).toHaveBeenLastCalledWith('2026-10-18');
    clock.dispose();
  });
});
