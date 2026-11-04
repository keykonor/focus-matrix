import { useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { taskDocuments, type TaskDocument } from '../taskDocuments';

export function TaskDocuments({ text, onRemove, onFiles, onLink, busy }: {
  text: string; onRemove?: (index: number) => void; onFiles?: (files: File[]) => void;
  onLink?: (url: string) => void; busy?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false), [url, setUrl] = useState(''), [error, setError] = useState('');
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
    {onFiles && <><input ref={input} type="file" multiple hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.rtf,.odt,.ods,.odp" onChange={event => {
      const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) onFiles(files);
    }} /><div className="document-actions"><button type="button" disabled={busy} onMouseDown={event => event.preventDefault()} onClick={() => input.current?.click()}>添加文档</button>
    <button type="button" disabled={busy} onMouseDown={event => event.preventDefault()} onClick={() => setLinkOpen(value => !value)}>文档链接</button></div></>}
    {linkOpen && <div className="document-link-entry"><input type="url" aria-label="文档链接" placeholder="粘贴 https:// 文档链接" value={url} onChange={event => setUrl(event.target.value)} />
      <button type="button" disabled={busy} onClick={() => {
        try { const parsed = new URL(url.trim()); if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw Error();
          onLink?.(parsed.href); setUrl(''); setLinkOpen(false); setError('');
        } catch { setError('请输入有效的 HTTP 或 HTTPS 文档链接。'); }
      }}>添加</button></div>}
    {error && <span role="alert" className="task-link-error">{error}</span>}
  </div>;
}
