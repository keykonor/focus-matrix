import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { flushSync } from 'react-dom';
import { findTaskLinks } from '../taskLinks';
import { beginImageSave, endImageSave, imageIds, visibleTaskText, withTaskImages } from '../taskImages';
import { TaskImage } from './TaskImage';
import { TaskDocuments } from './TaskDocuments';
import { taskDocuments, withDocuments, type TaskDocument } from '../taskDocuments';
import { SubtasksEditor } from './SubtasksEditor';
import { newSubtask } from '../subtasks';
import type { AppSettings, QuadrantType, Task } from '../types';
import {EditAnnotation} from './EditAnnotation';
import type {EditMark} from '../../cloud-site/lib/syncModel';

interface Props {
  task: Task;
  mark?: EditMark;
  focus: boolean;
  fontSize: AppSettings['fontSize'];
  onChange: (id: string, patch: Partial<Pick<Task, 'text' | 'completed' | 'subtasks'>>, commit?: boolean) => void;
  onDelete: (id: string) => void;
  onEnter: (quadrant: QuadrantType, afterId: string) => void;
}

export function TaskItem({ task, mark, focus, fontSize, onChange, onDelete, onEnter }: Props) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const taskRef = useRef(task); taskRef.current = task;
  const imagePending = useRef(false);
  const [linkError, setLinkError] = useState(false);
  const [imageError, setImageError] = useState('');
  const [addingImage, setAddingImage] = useState(false);
  const [subtaskFocus, setSubtaskFocus] = useState<string | null>(null);
  const text = visibleTaskText(task.text);
  const ids = imageIds(task.text);
  const updateText = (value: string, images = imageIds(taskRef.current.text), documents = taskDocuments(taskRef.current.text), commit = false) => {
    const next = withDocuments(withTaskImages(value, images), documents);
    taskRef.current = { ...taskRef.current, text: next };
    onChange(task.id, { text: next }, commit);
  };
  const addImages = async (files: File[]) => {
    if (imagePending.current) { setImageError('附件正在保存，请稍候再添加。'); return; }
    imagePending.current = true; beginImageSave(); setAddingImage(true); setImageError('');
    try {
      for (const file of files) {
        const image = file.type.startsWith('image/');
        if (file.size > (image ? 10 : 20) * 1024 * 1024) throw Error('附件超过大小限制（图片 10 MB，文档 20 MB）。');
        const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
        const id = await invoke<string>(image ? 'save_task_image' : 'save_task_document', { bytes, name: file.name });
        const current = taskRef.current.text;
        flushSync(() => image ? updateText(visibleTaskText(current), [...imageIds(current), id]) :
          updateText(visibleTaskText(current), imageIds(current), [...taskDocuments(current), { id, name: file.name }], true));
      }
    } catch (error) { setImageError(typeof error === 'string' ? error : error instanceof Error ? error.message : '附件保存失败，请重试。'); }
    finally { imagePending.current = false; endImageSave(); setAddingImage(false); }
  };
  const pasteDocuments = async () => {
    if (imagePending.current) return;
    imagePending.current = true; beginImageSave(); setAddingImage(true); setImageError('');
    try {
      const documents = await invoke<TaskDocument[]>('paste_task_documents');
      if (documents.length) { const current=taskRef.current.text;
        flushSync(() => updateText(visibleTaskText(current),imageIds(current),[...taskDocuments(current),...documents],true)); }
    } catch (cause) { setImageError(typeof cause==='string'?cause:'文档粘贴失败，请重试。'); }
    finally { imagePending.current=false;endImageSave();setAddingImage(false); }
  };
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
    <div className="task-content" onDragOver={event => { if (!event.dataTransfer.types.includes('text/task-id')) event.preventDefault(); }}
      onDrop={event => {
        if (event.dataTransfer.types.includes('text/task-id')) return;
        event.preventDefault(); event.stopPropagation();
        const files = Array.from(event.dataTransfer.files);
        if (files.length) { void addImages(files); return; }
        const value = event.dataTransfer.getData('text/uri-list').split(/\r?\n/).find(line => /^https?:\/\//i.test(line)) || event.dataTransfer.getData('text/plain');
        if (value) updateText(`${visibleTaskText(taskRef.current.text)}${visibleTaskText(taskRef.current.text) ? '\n' : ''}${value}`);
      }}><textarea ref={inputRef} className="task-text" rows={1} value={text} placeholder="输入任务，回车保存…" aria-label="任务内容" title="Enter 保存并新增，Shift+Enter 换行；可粘贴或拖入文档、图片和链接"
      onChange={(event) => updateText(event.target.value)}
      onPaste={event => { const files = Array.from(event.clipboardData.files);
        if (files.length) { event.preventDefault(); void addImages(files); }
        else if (!event.clipboardData.getData('text/plain') && !event.clipboardData.getData('text/html')) { event.preventDefault(); void pasteDocuments(); }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!imagePending.current) onEnter(task.quadrant, task.id); }
        if (event.key === 'Delete' && !task.text && !task.subtasks?.length && !imagePending.current) { event.preventDefault(); onDelete(task.id); }
      }}
      onBlur={event => {
        if (event.relatedTarget instanceof Node && event.currentTarget.closest('.task-item')?.contains(event.relatedTarget)) return;
        if (!taskRef.current.text.trim() && !taskRef.current.subtasks?.length && !imagePending.current) onDelete(task.id);
      }} />
      {addingImage && <span role="status" className="task-image-message">正在保存附件…</span>}
      {imageError && <span role="alert" className="task-image-message">{imageError}</span>}
      {ids.map((id, index) => <TaskImage key={`${id}-${index}`} id={id} onRemove={() => updateText(visibleTaskText(taskRef.current.text), imageIds(taskRef.current.text).filter((_, i) => i !== index))} />)}
      {findTaskLinks(text).map(({url}) => <button key={url} type="button" className="task-link" title={url}
        onClick={() => { setLinkError(false); void invoke('open_task_link', {url}).catch(() => setLinkError(true)); }}>打开链接：{url}</button>)}
      {linkError && <span className="task-link-error" role="alert">无法打开链接，请检查默认浏览器设置。</span>}
      <TaskDocuments text={task.text} busy={addingImage}
        onRemove={index => updateText(text, ids, taskDocuments(task.text).filter((_, i) => i !== index), true)} />
      <SubtasksEditor focusId={subtaskFocus} items={task.subtasks ?? []} onChange={(subtasks, commit) => {
        taskRef.current = { ...taskRef.current, subtasks }; onChange(task.id, { subtasks }, commit);
      }} />
      <EditAnnotation mark={mark}/></div>
    <button type="button" className="subtask-add-icon" aria-label="添加子任务" title="添加子任务" onMouseDown={event => event.preventDefault()} onClick={() => {
      const item = newSubtask(); const subtasks = [...(taskRef.current.subtasks ?? []), item];
      taskRef.current = { ...taskRef.current, subtasks }; onChange(task.id, { subtasks }); setSubtaskFocus(item.id);
    }}>＋</button>
    <button type="button" className="delete-button" disabled={addingImage} onClick={() => onDelete(task.id)} aria-label="删除任务" title="删除任务">×</button>
  </div>;
}
