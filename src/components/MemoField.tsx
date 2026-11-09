import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { beginImageSave, endImageSave, imageIds, withTaskImages } from '../taskImages';
import { taskDocuments, withDocuments, type TaskDocument } from '../taskDocuments';
import { findTaskLinks } from '../taskLinks';
import { TaskImage } from './TaskImage';
import { TaskDocuments } from './TaskDocuments';

interface Props {
  period: string;
  label: string;
  text: string;
  attachments: string;
  onChange: (text: string) => void;
  onAttachmentsChange: (update: (current: string) => string) => void;
}

type ImportedFile = TaskDocument & { kind?: string };
type NativeDrop = { id?: string; text?: string };
const fileTypes = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.rtf,.odt,.ods,.odp,.png,.jpg,.jpeg,.gif,.webp';

export function MemoField({ period, label, text, attachments, onChange, onAttachmentsChange }: Props) {
  const row = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const images = imageIds(attachments);
  const documents = taskDocuments(attachments);

  const importFiles = async (load: () => Promise<ImportedFile[]>) => {
    if (pending.current) { setError('附件正在保存，请稍候再添加。'); return; }
    pending.current = true;
    beginImageSave();
    setBusy(true);
    setError('');
    try {
      const added = await load();
      if (added.length) flushSync(() => onAttachmentsChange(current => withDocuments(
        withTaskImages('', [...imageIds(current), ...added.filter(file => file.kind === 'image').map(file => file.id)]),
        [...taskDocuments(current), ...added.filter(file => file.kind !== 'image')],
      )));
    } catch (cause) {
      setError(typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : '附件保存失败，请重试。');
    } finally {
      pending.current = false;
      endImageSave();
      setBusy(false);
    }
  };

  const addFiles = (files: File[]) => importFiles(async () => {
    if (files.length > 64) throw Error('每次最多添加 64 个文件。');
    const selection = files.map(file => ({ file, image: /\.(png|jpe?g|gif|webp)$/i.test(file.name) || file.type.startsWith('image/') }));
    if (selection.some(({ file, image }) => file.size > (image ? 10 : 20) * 1024 * 1024)) {
      throw Error('附件超过大小限制（图片 10 MB，文档 20 MB）。');
    }
    const imported: ImportedFile[] = [];
    for (const { file, image } of selection) {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      const id = await invoke<string>(image ? 'save_task_image' : 'save_task_document', { bytes, name: file.name });
      imported.push({ id, name: file.name, kind: image ? 'image' : 'document' });
    }
    return imported;
  });

  const appendText = (value: string) => { if (value) onChange(text ? `${text}\n${value}` : value); };
  const nativeDrop = useRef<(drop: NativeDrop) => void>(() => {});
  nativeDrop.current = ({ id, text: value }) => {
    if (id) void importFiles(() => invoke<ImportedFile[]>('take_dropped_files', { id }));
    else if (value) appendText(value);
  };
  useLayoutEffect(() => {
    const element = row.current;
    const receive = (event: Event) => nativeDrop.current((event as CustomEvent<NativeDrop>).detail);
    element?.addEventListener('focus-matrix:file-drop', receive);
    return () => element?.removeEventListener('focus-matrix:file-drop', receive);
  }, []);
  useLayoutEffect(() => {
    const input = field.current;
    if (!input) return;
    const resize = () => { input.style.height = 'auto'; input.style.height = `${input.scrollHeight}px`; };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(input);
    return () => observer.disconnect();
  }, [text]);

  return <div ref={row} className={`memo-section memo-${period}`} onDragOver={event => event.preventDefault()}
    onDrop={event => {
      event.preventDefault();
      const files = Array.from(event.dataTransfer.files);
      if (files.length) { void addFiles(files); return; }
      const link = event.dataTransfer.getData('text/uri-list').split(/\r?\n/).find(line => /^https?:\/\//i.test(line));
      appendText(link || event.dataTransfer.getData('text/plain'));
    }}>
    <div className="memo-field-heading">
      <label className="memo-label" htmlFor={`memo-field-${period}`}>{label}</label>
      <button type="button" className="memo-add-file" disabled={busy} aria-label={`${label}添加附件`}
        onClick={() => picker.current?.click()}>添加附件</button>
      <input ref={picker} type="file" hidden multiple accept={fileTypes} onChange={event => {
        const files = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = '';
        if (files.length) void addFiles(files);
      }} />
    </div>
    <textarea ref={field} id={`memo-field-${period}`} className="memo-text" data-period={period} rows={2} value={text}
      aria-label={`${label}备忘录`} placeholder={`写下${label}的安排…`}
      title="可拖入或粘贴文件、图片和网页链接"
      onChange={event => onChange(event.target.value)}
      onPaste={event => {
        const files = Array.from(event.clipboardData.files);
        if (files.length) { event.preventDefault(); void addFiles(files); }
        else if (!event.clipboardData.getData('text/plain') && !event.clipboardData.getData('text/html')) {
          event.preventDefault();
          void importFiles(() => invoke<ImportedFile[]>('paste_task_documents'));
        }
      }} />
    {busy && <span role="status" className="task-image-message">正在保存附件…</span>}
    {error && <span role="alert" className="task-link-error">{error}</span>}
    {documents.length > 0 && <TaskDocuments text={attachments} busy={busy}
      onRemove={index => onAttachmentsChange(current => withDocuments(withTaskImages('', imageIds(current)),
        taskDocuments(current).filter((_, position) => position !== index)))} />}
    {images.map((id, index) => <TaskImage key={`${id}-${index}`} id={id} onRemove={busy ? undefined : () =>
      onAttachmentsChange(current => withDocuments(withTaskImages('', imageIds(current).filter((_, position) => position !== index)), taskDocuments(current)))} />)}
    {findTaskLinks(text).map(({ url }) => <button key={url} type="button" className="task-link" title={url}
      onClick={() => { setError(''); void invoke('open_task_link', { url }).catch(() => setError('无法打开链接，请检查默认浏览器设置。')); }}>
      打开链接：{url}
    </button>)}
  </div>;
}
