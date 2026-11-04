import { useLayoutEffect, useRef, useState } from 'react';
import type { Subtask } from '../types';
import { changeSubtask, newSubtask } from '../subtasks';

function SubtaskRow({ item, focus, onChange, onEnter, onDelete }: {
  item: Subtask; focus: boolean;
  onChange: (patch: Partial<Pick<Subtask, 'text' | 'completed'>>) => void;
  onEnter: () => void; onDelete: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { if (focus) input.current?.focus(); }, [focus]);
  useLayoutEffect(() => {
    const field = input.current;
    if (!field) return;
    const resize = () => { field.style.height = 'auto'; field.style.height = `${field.scrollHeight}px`; };
    resize(); const observer = new ResizeObserver(resize); observer.observe(field);
    return () => observer.disconnect();
  }, [item.text]);
  return <div className={`subtask-row${item.completed ? ' subtask-complete' : ''}`} data-subtask-id={item.id}>
    <input type="checkbox" checked={item.completed} aria-label={`完成子任务 ${item.text || '未命名'}`}
      onChange={event => onChange({ completed: event.target.checked })} />
    <textarea ref={input} rows={1} className="subtask-text" aria-label="子任务内容" placeholder="输入子任务，回车保存…"
      title="Enter 保存并新增子任务，Shift+Enter 换行" value={item.text} onChange={event => onChange({ text: event.target.value })}
      onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onEnter(); }
      }} />
    <button type="button" className="subtask-delete" aria-label="删除子任务" title="删除子任务" onClick={onDelete}>×</button>
  </div>;
}

export function SubtasksEditor({ taskId, items, onChange }: {
  taskId: string; items: Subtask[]; onChange: (items: Subtask[], commit: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [focusId, setFocusId] = useState<string | null>(null);
  const listId = `subtasks-${taskId}`;
  const add = (afterId?: string, commit = false) => {
    const item = newSubtask(), next = [...items];
    const index = afterId ? items.findIndex(item => item.id === afterId) : -1;
    next.splice(index < 0 ? next.length : index + 1, 0, item);
    onChange(next, commit); setExpanded(true); setFocusId(item.id);
  };
  return <div className="subtasks-editor">
    <div className="subtasks-toolbar">
      {items.length > 0 && <button type="button" className="subtasks-toggle" aria-expanded={expanded} aria-controls={listId}
        onClick={() => setExpanded(value => !value)}>{expanded ? '收起' : '展开'}子任务 · {items.filter(item => item.completed).length}/{items.length}</button>}
      <button type="button" className="subtask-add" onMouseDown={event => event.preventDefault()} onClick={() => add()}>＋ 添加子任务</button>
    </div>
    {expanded && items.length > 0 && <div id={listId} className="subtasks-list">
      {items.map(item => <SubtaskRow key={item.id} item={item} focus={focusId === item.id}
        onChange={patch => onChange(changeSubtask(items, item.id, patch), patch.completed !== undefined)}
        onEnter={() => add(item.id, true)} onDelete={() => onChange(items.filter(other => other.id !== item.id), true)} />)}
      <small className="subtasks-note">子任务保存在本机 · 父任务需手动完成</small>
    </div>}
  </div>;
}

export function SubtasksPreview({ items }: { items?: Subtask[] }) {
  if (!items?.length) return null;
  return <ul className="subtasks-preview" aria-label="子任务记录">{items.map(item => <li key={item.id}
    className={item.completed ? 'subtask-complete' : ''}><span aria-label={item.completed ? '已完成' : '未完成'}>{item.completed ? '✓' : '○'}</span><span>{item.text || '（空白子任务）'}</span></li>)}</ul>;
}
