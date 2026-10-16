import { useEffect, useMemo, useRef, useState } from 'react';
import type { CompletedTaskRecord } from '../completedTasks';
import { quadrantNames } from '../types';

interface Props { records: CompletedTaskRecord[]; onClose: () => void; }

export function CompletedTasksModal({ records, onClose }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('');
  const [limit, setLimit] = useState(80);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const items = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input');
      if (!items?.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
        event.preventDefault(); first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const filtered = useMemo(() => records.filter(record => (!date || record.archivedDate === date) &&
    record.task.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt)), [records, query, date]);
  const groups = new Map<string, CompletedTaskRecord[]>();
  for (const record of filtered.slice(0, limit)) {
    const group = groups.get(record.archivedDate) ?? [];
    group.push(record); groups.set(record.archivedDate, group);
  }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="completed-modal" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="completed-title">
      <header className="history-header"><div><h2 id="completed-title">已完成仓库</h2>
        <p>跨日自动收起已勾选任务 · 共 {records.length} 项</p></div>
        <button className="history-close" type="button" aria-label="关闭已完成仓库" onClick={onClose}>×</button>
      </header>
      <div className="completed-filters">
        <input type="search" aria-label="搜索已完成任务" placeholder="搜索已完成任务" value={query}
          onChange={event => { setQuery(event.target.value); setLimit(80); }} />
        <label>归档日期<input type="date" aria-label="筛选归档日期" value={date}
          onChange={event => { setDate(event.target.value); setLimit(80); }} /></label>
        {date && <button type="button" className="history-cancel" onClick={() => setDate('')}>全部日期</button>}
      </div>
      <div className="completed-list" aria-label="已完成任务记录">
        {records.length === 0 ? <p className="history-empty">还没有归档任务。已勾选的任务会在日期变化后自动移到这里，关机过夜后也会补做归档。</p>
          : filtered.length === 0 ? <p className="history-empty">没有符合条件的已完成任务。</p>
          : [...groups].map(([day, items]) => <section className="completed-group" key={day}>
            <h3><time dateTime={day}>{day}</time> 归档</h3>
            {items.map(record => <article className="completed-record" key={record.id} data-archive-id={record.id}>
              <span aria-hidden="true" className="completed-check">✓</span><div>
                <p>{record.task.text || '（空白任务）'}</p><small>{quadrantNames[record.task.quadrant]}</small>
              </div>
            </article>)}
          </section>)}
        {filtered.length > limit && <button className="history-more" type="button" onClick={() => setLimit(current => current + 80)}>显示更多记录</button>}
      </div>
      <footer className="completed-footnote">记录保存在本机，不自动删除。原有待办版本仍可在“历史”中查看和恢复。</footer>
    </div>
  </div>;
}
