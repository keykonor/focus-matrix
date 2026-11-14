import { invoke } from '@tauri-apps/api/core';
import { useState, type FormEvent } from 'react';
import { agendaConflicts, agendaForDate, setAgendaCompletion, type AgendaData, type AgendaOccurrence, type CalendarEvent } from '../agenda';
import { isDateKey } from '../calendarModel';
import { findTaskLinks } from '../taskLinks';
import { memoPeriods, type MemoPeriod, type Task } from '../types';
import '../agenda.css';

const periodNames: Record<MemoPeriod, string> = { morning: '早上', afternoon: '下午', evening: '晚上' };
const reminderOptions = [0, 5, 15, 30, 60];
const repeatNames = { none: '不重复', daily: '每天', weekly: '每周' };

interface Props {
  date: string;
  mode: 'periods' | 'hourly';
  agenda: AgendaData;
  tasks: Task[];
  onChange: (next: AgendaData) => void;
  onCreateTask?: (eventId: string) => void;
}

type Draft = Pick<CalendarEvent, 'text' | 'date' | 'period' | 'startTime' | 'endTime' | 'deadline' | 'repeat' | 'remindMinutes'> & { id?: string };

function AgendaText({ text, onLinkError }: { text: string; onLinkError: () => void }) {
  const links = new Set(findTaskLinks(text).map(link => link.url));
  const parts = text.split(/(https?:\/\/[^\s<>"'，。！？；、（）【】]+)/gi);
  return <>{parts.map((part, index) => {
    const url = part.replace(/[.,!?;:]+$/, '');
    return index % 2 && links.has(url) ? <span key={index}>
      <a href={url} onClick={event => { event.preventDefault(); void invoke('open_task_link', { url }).catch(onLinkError); }}>{url}</a>
      {part.slice(url.length)}
    </span> : part;
  })}</>;
}

export function AgendaPanel({ date, mode, agenda, tasks, onChange, onCreateTask }: Props) {
  const [draft, setDraft] = useState<Draft>();
  const [deleteId, setDeleteId] = useState<string>();
  const [linkError, setLinkError] = useState(false);
  const occurrences = agendaForDate(agenda, date);
  const conflicts = agendaConflicts(agenda, date);
  const draftSource = draft?.id ? agenda.events.find(event => event.id === draft.id) : undefined;
  const taskById = new Map(tasks.map(task => [task.id, task]));
  const groups = mode === 'hourly'
    ? [
      { key: 'hourly', label: '具体时间', events: occurrences.filter(event => event.startTime) },
      ...memoPeriods.map(period => ({ key: period, label: periodNames[period], events: occurrences.filter(event => !event.startTime && event.period === period) })),
    ]
    : memoPeriods.map(period => ({ key: period, label: periodNames[period], events: occurrences.filter(event => event.period === period) }));

  const update = (patch: Partial<Draft>) => setDraft(current => current && { ...current, ...patch });
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || !draft.text.trim() || !isDateKey(draft.date) || (draft.id && !draftSource)) return;
    const { id, text, date, period, startTime, endTime, deadline, repeat, remindMinutes } = draft;
    const now = new Date().toISOString();
    const fields = {
      text: text.trim(), date, period, startTime, endTime: startTime && !deadline ? endTime : undefined,
      deadline: startTime ? deadline : undefined, repeat, remindMinutes: startTime ? remindMinutes : undefined,
    };
    if (startTime && fields.endTime === startTime) return;
    const saved = draftSource
      ? { ...draftSource, ...fields, updatedAt: now }
      : { ...fields, id: crypto.randomUUID(), completed: false, createdAt: now, updatedAt: now };
    const events = id ? agenda.events.map(item => item.id === id ? saved : item) : [...agenda.events, saved];
    onChange({ ...agenda, events });
    setDraft(undefined);
  };

  const renderOccurrence = (event: AgendaOccurrence) => {
    const task = event.taskId ? taskById.get(event.taskId) : undefined;
    const timeLabel = event.startTime
      ? event.deadline ? event.startTime + ' 前' : event.endTime
        ? event.startTime + '–' + (event.endTime < event.startTime ? '次日 ' : '') + event.endTime : event.startTime
      : '';
    return <li className="agenda-item" key={event.id}>
      <input type="checkbox" aria-label={`完成日程：${event.text}`} checked={event.isCompleted}
        onChange={change => onChange(setAgendaCompletion(agenda, event.id, date, change.target.checked, new Date().toISOString()))} />
      <div className="agenda-item-body">
        {(timeLabel || (event.repeat && event.repeat !== 'none') || event.remindMinutes !== undefined) && <div className="agenda-item-meta">
          {timeLabel && <strong>{timeLabel}</strong>}
          {event.repeat && event.repeat !== 'none' && <span>{repeatNames[event.repeat]}</span>}
          {event.remindMinutes !== undefined && <span>{event.remindMinutes === 0 ? '准时提醒' : `提前 ${event.remindMinutes} 分钟提醒`}</span>}
        </div>}
        <div className={event.isCompleted ? 'agenda-text is-completed' : 'agenda-text'}><AgendaText text={event.text} onLinkError={() => setLinkError(true)} /></div>
        {event.taskId && <div className="agenda-item-meta">{task ? `关联任务${task.completed ? '已完成' : '待完成'}` : '关联任务已归档或删除'}</div>}
        {event.sourceText && <details className="agenda-source"><summary>聊天原文</summary><p>{event.sourceText}</p></details>}
        {deleteId === event.id && <div className="agenda-delete-confirm" role="group" aria-label="确认删除日程">
          <span>{event.repeat && event.repeat !== 'none' ? '删除这项重复日程及其全部日期？' : '删除这项日程？'}</span>
          <button type="button" onClick={() => setDeleteId(undefined)}>取消</button>
          <button type="button" onClick={() => {
            onChange({ ...agenda, events: agenda.events.filter(item => item.id !== event.id) });
            if (draft?.id === event.id) setDraft(undefined);
            setDeleteId(undefined);
          }}>确认删除</button>
        </div>}
      </div>
      <div className="agenda-item-actions">
        {!event.taskId && onCreateTask && <button type="button" onClick={() => onCreateTask(event.id)}>生成任务</button>}
        <button type="button" onClick={() => setDraft({ ...event })}>编辑</button>
        <button type="button" onClick={() => setDeleteId(event.id)}>删除</button>
      </div>
    </li>;
  };

  return <section className="agenda-panel" aria-label="当日日程">
    <header className="agenda-heading">
      <h3>日程</h3>
      <button type="button" className="memo-schedule-button" onClick={() => setDraft({ text: '', date, period: 'morning', repeat: 'none' })}>新建日程</button>
    </header>
    {conflicts.length > 0 && <p className="agenda-status" role="status">有 {conflicts.length} 组日程时间重叠。</p>}
    {linkError && <p className="agenda-status" role="status">无法打开此网址。</p>}
    {draft && <form className="agenda-editor" aria-label={draft.id ? '编辑日程' : '新建日程'} onSubmit={save}>
      <label className="agenda-title">日程内容<textarea rows={2} required value={draft.text} onChange={event => update({ text: event.target.value })} autoFocus /></label>
      <div className="agenda-fields">
        <label>日期<input type="date" required value={draft.date} onChange={event => update({ date: event.target.value })} /></label>
        <label>时段<select value={draft.period} onChange={event => update({ period: event.target.value as MemoPeriod })}>
          {memoPeriods.map(period => <option value={period} key={period}>{periodNames[period]}</option>)}
        </select></label>
        <label>{draft.deadline ? '截止时间' : '开始时间'}<input type="time" value={draft.startTime ?? ''} onChange={event => update({
          startTime: event.target.value || undefined,
          ...(!event.target.value && { endTime: undefined, deadline: undefined, remindMinutes: undefined }),
        })} /></label>
        <label>结束时间<input type="time" value={draft.endTime ?? ''} disabled={!draft.startTime || draft.deadline}
          onChange={event => update({ endTime: event.target.value || undefined })} /></label>
        <label>重复<select value={draft.repeat ?? 'none'} onChange={event => update({ repeat: event.target.value as CalendarEvent['repeat'] })}>
          {Object.entries(repeatNames).map(([value, name]) => <option value={value} key={value}>{name}</option>)}
        </select></label>
        <label>提醒<select value={draft.remindMinutes ?? ''} disabled={!draft.startTime} onChange={event => update({
          remindMinutes: event.target.value === '' ? undefined : Number(event.target.value),
        })}>
          <option value="">关闭</option>
          {draft.remindMinutes !== undefined && !reminderOptions.includes(draft.remindMinutes) && <option value={draft.remindMinutes}>提前 {draft.remindMinutes} 分钟</option>}
          {reminderOptions.map(minutes => <option value={minutes} key={minutes}>{minutes ? `提前 ${minutes} 分钟` : '准时提醒'}</option>)}
        </select></label>
      </div>
      <label className="agenda-deadline"><input type="checkbox" disabled={!draft.startTime} checked={draft.deadline ?? false}
        onChange={event => update({ deadline: event.target.checked, endTime: undefined })} />标记为截止时间</label>
      {draft.startTime && draft.endTime && draft.endTime < draft.startTime && <p className="agenda-status">此日程将于次日 {draft.endTime} 结束。</p>}
      {draft.startTime && draft.endTime === draft.startTime && <p className="agenda-status">开始和结束时间不能相同。</p>}
      {draftSource?.repeat && draftSource.repeat !== 'none' && <p className="agenda-status">编辑将应用于整项重复日程，包括之后的日期。</p>}
      <div className="agenda-editor-actions">
        <button type="button" className="memo-schedule-button" onClick={() => setDraft(undefined)}>取消</button>
        <button type="submit" className="agenda-save" disabled={!draft.text.trim() || Boolean(draft.startTime && draft.endTime === draft.startTime)}>保存日程</button>
      </div>
    </form>}
    {!occurrences.length && !draft && <p className="agenda-empty">当天暂无日程</p>}
    {groups.filter(group => group.events.length > 0).map(group => <section className="agenda-group" key={group.key} aria-label={group.label}>
      <h4>{group.label}</h4><ul>{group.events.map(renderOccurrence)}</ul>
    </section>)}
  </section>;
}
