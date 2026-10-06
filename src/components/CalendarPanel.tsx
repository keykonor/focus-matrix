import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dateFromKey, hasMemo, monthDays, shiftMonth } from '../calendarModel';
import { memoPeriods, type DailyMemos, type MemoPeriod } from '../types';
import {EditAnnotation} from './EditAnnotation';
import type {EditMark} from '../../cloud-site/lib/syncModel';

const periodNames: Record<MemoPeriod, string> = { morning: '早上', afternoon: '下午', evening: '晚上' };
const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
const dateFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

interface Props {
  today: string;
  memos: DailyMemos;
  marks?:Record<string,EditMark>;
  onChange: (date: string, period: MemoPeriod, text: string) => void;
  onClose: () => void;
}

function MemoField({ period, text, onChange }: { period: MemoPeriod; text: string; onChange: (text: string) => void }) {
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const input = field.current;
    if (!input) return;
    const resize = () => { input.style.height = 'auto'; input.style.height = `${input.scrollHeight}px`; };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(input);
    return () => observer.disconnect();
  }, [text]);
  return <label className={`memo-section memo-${period}`}>
    <span className="memo-label">{periodNames[period]}</span>
    <textarea ref={field} className="memo-text" data-period={period} rows={2} value={text}
      aria-label={`${periodNames[period]}备忘录`} placeholder={`写下${periodNames[period]}的安排…`}
      onChange={(event) => onChange(event.target.value)} />
  </label>;
}

export function CalendarPanel({ today, memos, marks, onChange, onClose }: Props) {
  const [selectedDate, setSelectedDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const previousToday = useRef(today);
  useEffect(() => {
    const previous = previousToday.current;
    if (previous !== today) {
      if (selectedDate === previous) {
        setSelectedDate(today);
        setMonth((value) => value === previous.slice(0, 7) ? today.slice(0, 7) : value);
      }
      previousToday.current = today;
    }
  }, [today, selectedDate]);
  const selectDate = (date: string) => { setSelectedDate(date); setMonth(date.slice(0, 7)); };
  const selected = dateFromKey(selectedDate);
  return <main className="calendar-panel" aria-label="日期与每日备忘录">
    <aside className="calendar-sidebar" aria-label="月历">
      <div className="calendar-month-header">
        <h2>{Number(month.slice(0, 4))}年{Number(month.slice(5))}月</h2>
        <div className="month-navigation">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="上个月">‹</button>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="下个月">›</button>
        </div>
      </div>
      <div className="calendar-weekdays" aria-hidden="true">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-days" aria-label="选择日期">
        {monthDays(month).map((date) => <button key={date} type="button" data-date={date}
          className={`calendar-day${date.startsWith(month) ? '' : ' outside-month'}${date === today ? ' is-today' : ''}${date === selectedDate ? ' is-selected' : ''}`}
          aria-label={`${date}${hasMemo(memos[date]) ? '，有备忘录' : ''}`}
          aria-pressed={date === selectedDate} aria-current={date === today ? 'date' : undefined}
          onClick={() => selectDate(date)}>
          <span>{Number(date.slice(8))}</span>{hasMemo(memos[date]) && <i className="memo-dot" aria-hidden="true" />}
        </button>)}
      </div>
      <button type="button" className="today-button" onClick={() => selectDate(today)}>回到今天</button>
      <p className="calendar-hint">选择日期，记录当天的安排<br />有圆点的日期已写下备忘录</p>
    </aside>
    <section className="daily-memos" aria-labelledby="memo-date-heading" data-selected-date={selectedDate}>
      <div className="memo-heading">
        <div><p className="memo-eyebrow">{selected.getFullYear()} · 每日备忘录</p><h2 id="memo-date-heading">{dateFormatter.format(selected)}</h2></div>
        <button type="button" className="calendar-close" onClick={onClose}>返回矩阵</button>
      </div>
      <p className="memo-save-hint">自动保存 · 可保持此页面打开</p>
      {memoPeriods.map((period) => <div key={`${selectedDate}-${period}`}><MemoField period={period}
        text={memos[selectedDate]?.[period] ?? ''} onChange={(text) => onChange(selectedDate, period, text)} /><EditAnnotation mark={marks?.[`memo:${selectedDate}:${period}`]}/></div>)}
    </section>
  </main>;
}
