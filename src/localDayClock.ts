import { localDateKey } from './calendarModel';

export function millisecondsUntilNextLocalDay(now = new Date()): number {
  const midnight = new Date(now);
  // Use the next local midnight, including daylight-saving/time-zone offsets.
  midnight.setHours(24, 0, 0, 0);
  return Math.max(1, midnight.getTime() - now.getTime());
}

export function startLocalDayClock(onDate: (day: string) => void) {
  let day = '';
  let midnight: ReturnType<typeof setTimeout>;
  const sync = () => {
    const now = new Date();
    const current = localDateKey(now);
    if (current !== day) { day = current; onDate(day); }
    clearTimeout(midnight);
    midnight = setTimeout(sync, millisecondsUntilNextLocalDay(now));
  };
  sync();
  // Recover from manual clock changes and delayed timers after sleep.
  const fallback = setInterval(sync, 30_000);
  return { sync, dispose: () => { clearTimeout(midnight); clearInterval(fallback); } };
}
