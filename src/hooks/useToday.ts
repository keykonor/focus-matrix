import { useEffect, useState } from 'react';
import { localDateKey } from '../calendarModel';

export function useToday(): string {
  const [today, setToday] = useState(() => localDateKey());
  useEffect(() => {
    const sync = () => setToday(localDateKey());
    const timer = window.setInterval(sync, 30_000);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);
  return today;
}
