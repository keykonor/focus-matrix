import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { findTaskLinks } from '../taskLinks';
import type { AppSettings, QuadrantType, Task } from '../types';
import {EditAnnotation} from './EditAnnotation';
import type {EditMark} from '../../cloud-site/lib/syncModel';

interface Props {
  task: Task;
  mark?: EditMark;
  focus: boolean;
  fontSize: AppSettings['fontSize'];
  onChange: (id: string, patch: Partial<Pick<Task, 'text' | 'completed'>>) => void;
  onDelete: (id: string) => void;
  onEnter: (quadrant: QuadrantType, afterId: string) => void;
}

export function TaskItem({ task, mark, focus, fontSize, onChange, onDelete, onEnter }: Props) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [linkError, setLinkError] = useState(false);
  useEffect(() => { if (focus) inputRef.current?.focus(); }, [focus]);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }, [task.text, fontSize]);
  useEffect(() => {
    const input = inputRef.current;
    const row = input?.parentElement;
    if (!input || !row) return;
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth === width) return;
      width = input.clientWidth;
      input.style.height = 'auto';
      input.style.height = `${input.scrollHeight}px`;
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  return <div className={`task-item${task.completed ? ' is-complete' : ''}`} data-task-id={task.id}>
    <span className="drag-handle" draggable title="拖动到其他象限" aria-label="拖动任务"
      onDragStart={(event) => { event.dataTransfer.setData('text/task-id', task.id); event.dataTransfer.effectAllowed = 'move'; event.currentTarget.parentElement?.classList.add('is-dragging'); }}
      onDragEnd={(event) => event.currentTarget.parentElement?.classList.remove('is-dragging')}>⋮⋮</span>
    <input type="checkbox" checked={task.completed} onChange={(event) => onChange(task.id, { completed: event.target.checked })} aria-label={`完成 ${task.text || '任务'}`} />
    <div className="task-content"><textarea ref={inputRef} className="task-text" rows={1} value={task.text} placeholder="输入任务，回车保存…" aria-label="任务内容" title="Enter 保存并新增，Shift+Enter 换行"
      onChange={(event) => onChange(task.id, { text: event.target.value })}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onEnter(task.quadrant, task.id); }
        if (event.key === 'Delete' && !task.text) { event.preventDefault(); onDelete(task.id); }
      }}
      onBlur={() => { if (!task.text.trim()) onDelete(task.id); }} />
      {findTaskLinks(task.text).map(({url}) => <button key={url} type="button" className="task-link" title={url}
        onClick={() => { setLinkError(false); void invoke('open_task_link', {url}).catch(() => setLinkError(true)); }}>打开链接：{url}</button>)}
      {linkError && <span className="task-link-error" role="alert">无法打开链接，请检查默认浏览器设置。</span>}
      <EditAnnotation mark={mark}/></div>
    <button type="button" className="delete-button" onClick={() => onDelete(task.id)} aria-label="删除任务" title="删除任务">×</button>
  </div>;
}
