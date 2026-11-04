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
  return <div className="subtask-row" data-subtask-id={item.id}>
    <textarea ref={input} rows={1} className="subtask-text" aria-label="子任务内容" placeholder="输入子任务，回车保存…"
      title="Enter 保存并新增子任务，Shift+Enter 换行" value={item.text} onChange={event => onChange({ text: event.target.value })}
      onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onEnter(); }
      }} />
    <button type="button" className="subtask-delete" aria-label="删除子任务" title="删除子任务" onClick={onDelete}>×</button>
  </div>;
}

export function SubtasksEditor({ items, focusId, onChange }: {
  items: Subtask[]; focusId: string | null; onChange: (items: Subtask[], commit: boolean) => void;
}) {
  const [nextFocusId, setNextFocusId] = useState<string | null>(null);
  const add = (afterId?: string, commit = false) => {
    const item = newSubtask(), next = [...items];
    const index = afterId ? items.findIndex(item => item.id === afterId) : -1;
    next.splice(index < 0 ? next.length : index + 1, 0, item);
    onChange(next, commit); setNextFocusId(item.id);
  };
  return <div className="subtasks-editor">
    {items.length > 0 && <div className="subtasks-list">
      {items.map(item => <SubtaskRow key={item.id} item={item} focus={focusId === item.id || nextFocusId === item.id}
        onChange={patch => onChange(changeSubtask(items, item.id, patch), patch.completed !== undefined)}
        onEnter={() => add(item.id, true)} onDelete={() => onChange(items.filter(other => other.id !== item.id), true)} />)}
    </div>}
  </div>;
}

export function SubtasksPreview({ items }: { items?: Subtask[] }) {
  if (!items?.length) return null;
  return <ul className="subtasks-preview" aria-label="子任务记录">{items.map(item => <li key={item.id}><span>{item.text || '（空白子任务）'}</span></li>)}</ul>;
}
