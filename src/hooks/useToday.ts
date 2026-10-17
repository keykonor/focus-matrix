import { useEffect, useState } from 'react';
import { localDateKey } from '../calendarModel';
import { startLocalDayClock } from '../localDayClock';

export function useToday(): string {
  const [today, setToday] = useState(() => localDateKey());
  useEffect(() => {
    const { sync, dispose } = startLocalDayClock(setToday);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      dispose();
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);
  return today;
}
