import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { taskDocuments, type TaskDocument } from '../taskDocuments';

export function TaskDocuments({ text, onRemove, busy }: {
  text: string; onRemove?: (index: number) => void; busy?: boolean;
}) {
  const [error, setError] = useState('');
  const open = async (doc: TaskDocument) => {
    setError('');
    try { await invoke('open_task_document', { id: doc.id }); }
    catch (cause) { setError(typeof cause === 'string' ? cause : '无法打开文档，请检查文件及默认应用。'); }
  };
  return <div className="task-documents">
    {taskDocuments(text).map((doc,index) => <div className="document-row" key={`${doc.id}-${index}`}>
      <button type="button" className="document-open" title={`打开只读副本：${doc.name}`} onClick={() => void open(doc)}>{doc.name}</button>
      {onRemove && <button type="button" className="subtask-delete" disabled={busy} aria-label="移除文档" onClick={() => onRemove(index)}>×</button>}
    </div>)}
    {error && <span role="alert" className="task-link-error">{error}</span>}
  </div>;
}
