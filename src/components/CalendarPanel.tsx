import { useEffect, useRef, useState } from 'react';
import { dateFromKey, hasMemo, monthDays, shiftMonth } from '../calendarModel';
import { memoPeriods, type DailyMemos, type MemoPeriod } from '../types';
import { defaultMemoSchedule, hourLabel, memoHours, type DailyMemoSchedules, type MemoSchedule } from '../memoSchedule';
import { MemoField } from './MemoField';
import { ChatImportPanel } from './ChatImportPanel';
import type { ComponentProps } from 'react';

const periodNames: Record<MemoPeriod, string> = { morning: '早上', afternoon: '下午', evening: '晚上' };
const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
const dateFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

interface Props {
  today: string;
  memos: DailyMemos;
  diaries: Record<string,string>;
  schedules?: DailyMemoSchedules;
  onChange: (date: string, period: MemoPeriod, text: string) => void;
  onDiaryChange: (date: string, text: string) => void;
  onScheduleChange: (date: string, update: (current: MemoSchedule) => MemoSchedule) => void;
  onChatImport: ComponentProps<typeof ChatImportPanel>['onImport'];
  onChatUndo?: () => number;
}

export function CalendarPanel({ today, memos, diaries, schedules, onDiaryChange, onChange, onScheduleChange, onChatImport, onChatUndo }: Props) {
  const [selectedDate, setSelectedDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [importOpen, setImportOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<{ date: string; mode: MemoSchedule['mode']; hours: number[] }>();
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
  const schedule = schedules?.[selectedDate] ?? defaultMemoSchedule;
  const draft = editingSchedule?.date === selectedDate ? editingSchedule : undefined;
  const hasRecords = (date: string) => hasMemo(memos[date]) || Boolean(diaries[date]) ||
    Object.values(schedules?.[date]?.notes ?? {}).some(text => text.trim()) ||
    Object.values(schedules?.[date]?.attachments ?? {}).some(Boolean);
  const hasPeriodRecords = hasMemo(memos[selectedDate]) || memoPeriods.some(period => schedule.attachments?.[period]);
  const updateAttachments = (period: string, update: (current: string) => string) => onScheduleChange(selectedDate, current => {
    const attachments = { ...current.attachments };
    const next = update(attachments[period] ?? '');
    if (next) attachments[period] = next;
    else delete attachments[period];
    return { ...current, attachments };
  });
  if (importOpen) return <ChatImportPanel date={today} memos={memos} schedules={schedules}
    onImport={onChatImport} onUndo={onChatUndo} onBack={() => setImportOpen(false)} />;
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
          aria-label={`${date}${hasRecords(date) ? '，有记录' : ''}`}
          aria-pressed={date === selectedDate} aria-current={date === today ? 'date' : undefined}
          onClick={() => selectDate(date)}>
          <span>{Number(date.slice(8))}</span>{hasRecords(date) && <i className="memo-dot" aria-hidden="true" />}
        </button>)}
      </div>
      <label className="diary-section"><span className="diary-heading">
        <span className="diary-label">当日日记</span>
        <span className="diary-date">{dateFormatter.format(selected)}</span></span>
        <textarea className="diary-text" aria-label="当日日记" placeholder="写下这一天…" value={diaries[selectedDate] ?? ''}
          onChange={event => onDiaryChange(selectedDate, event.target.value)} />
      </label>
    </aside>
    <section className="daily-memos" aria-labelledby="memo-date-heading" data-selected-date={selectedDate}>
      <div className="memo-heading">
        <div><p className="memo-eyebrow">{selected.getFullYear()} · 每日备忘录</p><h2 id="memo-date-heading">{dateFormatter.format(selected)}</h2></div>
        <div className="memo-heading-actions"><button type="button" className="memo-schedule-button" onClick={() => setImportOpen(true)}>从聊天导入</button>
        <button type="button" className="memo-schedule-button" aria-expanded={Boolean(draft)} aria-controls="memo-schedule-editor"
          onClick={() => setEditingSchedule(draft ? undefined : { date: selectedDate, mode: schedule.mode, hours: schedule.hours })}>
          编辑时间段
        </button></div>
      </div>
      <div className="memo-save-hint"><span>自动保存</span><button type="button" className="today-button" onClick={() => selectDate(today)}>回到今天</button></div>
      {draft && <section className="memo-schedule-editor" id="memo-schedule-editor" aria-label="当日时间段设置">
        <div className="memo-mode-picker" role="group" aria-label="排列方式">
          <span aria-hidden="true">排列方式</span>
          <button type="button" aria-pressed={draft.mode === 'hourly'}
            onClick={() => setEditingSchedule({ ...draft, mode: 'hourly' })}>24 小时</button>
          <button type="button" aria-pressed={draft.mode === 'periods'}
            onClick={() => setEditingSchedule({ ...draft, mode: 'periods' })}>早上／下午／晚上</button>
        </div>
        {draft.mode === 'hourly' && <fieldset aria-label="选择显示的小时">
          <div className="memo-hour-heading">
            <span>选择显示的小时</span>
            <div className="memo-hour-tools">
              <button type="button" onClick={() => setEditingSchedule({ ...draft, hours: memoHours })}>全选</button>
              <button type="button" onClick={() => setEditingSchedule({ ...draft, hours: [] })}>清除选择</button>
            </div>
          </div>
          <div className="memo-hour-options">{memoHours.map(hour => <button key={hour} type="button"
            aria-pressed={draft.hours.includes(hour)} onClick={() => {
              const hours = draft.hours.includes(hour) ? draft.hours.filter(value => value !== hour) :
                [...draft.hours, hour].sort((a, b) => a - b);
              setEditingSchedule({ ...draft, hours });
            }}>{hourLabel(hour)}</button>)}</div>
        </fieldset>}
        <div className="memo-schedule-actions">
          <button type="button" onClick={() => setEditingSchedule(undefined)}>取消</button>
          <button type="button" className="memo-schedule-apply" disabled={draft.mode === 'hourly' && !draft.hours.length} onClick={() => {
            onScheduleChange(selectedDate, current => ({ ...current, mode: draft.mode, hours: draft.hours.length ? draft.hours : current.hours }));
            setEditingSchedule(undefined);
          }}>应用</button>
        </div>
      </section>}
      {schedule.mode === 'hourly' && schedule.hours.map(hour => <MemoField key={`${selectedDate}-hour-${hour}`}
        period={`hour-${hour}`} label={hourLabel(hour)} text={schedule.notes[hour] ?? ''}
        attachments={schedule.attachments?.[`hour-${hour}`] ?? ''}
        onAttachmentsChange={update => updateAttachments(`hour-${hour}`, update)}
        onChange={text => onScheduleChange(selectedDate, current => ({ ...current, notes: { ...current.notes, [hour]: text } }))} />)}
      {schedule.mode === 'hourly' && hasPeriodRecords && <p className="memo-save-hint">早上／下午／晚上备忘录</p>}
      {(schedule.mode === 'periods' || hasPeriodRecords) && memoPeriods.map(period => <div key={`${selectedDate}-${period}`}>
        <MemoField period={period} label={periodNames[period]} text={memos[selectedDate]?.[period] ?? ''}
          attachments={schedule.attachments?.[period] ?? ''}
          onAttachmentsChange={update => updateAttachments(period, update)}
          onChange={text => onChange(selectedDate, period, text)} />
      </div>)}
    </section>
  </main>;
}
