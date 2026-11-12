import { useLayoutEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { parseChatImport, type ChatEntry } from '../chatImport';

export type UndoChatImport = () => number;

interface Props {
  date: string;
  onImport: (entries: ChatEntry[]) => { count: number; undo: UndoChatImport };
  onBack: () => void;
}

type NativeDrop = { id?: string; text?: string };

export function ChatImportPanel({ date, onImport, onBack }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [undo, setUndo] = useState<UndoChatImport>();
  const zone = useRef<HTMLElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const processing = useRef(false);
  const mounted = useRef(false);
  const receiveDrop = useRef<(drop: NativeDrop) => void>(() => {});

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const importText = (value: string) => {
    if (value.length > 12_000) throw Error('每次最多导入 12,000 字，请分批导入。');
    const entries = parseChatImport(value, date);
    if (!entries.length) { setMessage('没有找到可导入的事项。'); return; }
    const result = onImport(entries);
    if (!result.count) { setMessage('没有新增事项。已导入的相同记录会跳过。'); return; }
    setUndo(() => result.undo);
    setText('');
    setMessage('已添加 ' + result.count + ' 条记录。');
  };

  const submit = (value: string) => {
    if (processing.current) return;
    try { importText(value); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '导入失败，请重试。'); }
  };

  const importImage = async (load: () => Promise<Blob>) => {
    if (processing.current) return;
    processing.current = true;
    setBusy(true);
    setMessage('正在本机识别截图…');
    try {
      const { readChatScreenshot } = await import('../chatOcr');
      const recognized = await readChatScreenshot(await load());
      if (mounted.current) importText(recognized);
    } catch (cause) {
      if (mounted.current) setMessage(typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : '截图识别失败，请重试。');
    } finally {
      processing.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const importFiles = (files: File[]) => {
    if (files.length !== 1) { setMessage('每次请选择一张截图。'); return; }
    void importImage(async () => files[0]);
  };

  receiveDrop.current = ({ id, text: value }) => {
    if (id) void importImage(async () => new Blob([await invoke<ArrayBuffer>('take_chat_screenshot', { id })]));
    else if (value) submit(value);
  };
  useLayoutEffect(() => {
    const element = zone.current;
    if (!element) return;
    const receive = (event: Event) => receiveDrop.current((event as CustomEvent<NativeDrop>).detail);
    element.addEventListener('focus-matrix:file-drop', receive);
    return () => element.removeEventListener('focus-matrix:file-drop', receive);
  }, []);

  return <main className="chat-import" aria-labelledby="chat-import-heading">
    <header className="chat-import-heading">
      <div><h2 id="chat-import-heading">从聊天导入</h2><p>参考日期 {date}</p></div>
      <button type="button" className="memo-schedule-button" onClick={onBack}>返回日历</button>
    </header>
    <section ref={zone} className="chat-import-zone" aria-label="聊天导入区"
      onDragOver={event => event.preventDefault()}
      onDrop={event => {
        event.preventDefault();
        if (event.dataTransfer.files.length) importFiles(Array.from(event.dataTransfer.files));
        else submit(event.dataTransfer.getData('text/plain'));
      }}
      onPaste={event => {
        const files = Array.from(event.clipboardData.files);
        if (files.length) { event.preventDefault(); importFiles(files); }
        else if (!text.trim() && event.clipboardData.getData('text/plain').trim()) {
          event.preventDefault();
          submit(event.clipboardData.getData('text/plain'));
        }
      }}>
      <p>拖入或粘贴微信截图、聊天文字。无法确定时段的记录会标为「时间待定」。</p>
      <textarea aria-label="聊天文字" placeholder="也可以在这里输入聊天文字…" rows={3} maxLength={12000} value={text}
        disabled={busy} onChange={event => setText(event.target.value)} />
      <div className="chat-import-actions">
        <button type="button" disabled={busy} onClick={() => picker.current?.click()}>选择截图</button>
        <input ref={picker} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={event => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          if (files.length) importFiles(files);
        }} />
        <button type="button" disabled={busy || !text.trim()} onClick={() => submit(text)}>识别并写入</button>
        {undo && <button type="button" disabled={busy} onClick={() => {
          const count = undo();
          setUndo(undefined);
          setMessage('已撤销 ' + count + ' 条记录，编辑过的内容已保留。');
        }}>撤销本批</button>}
      </div>
      <p role="status">{message}</p>
    </section>
  </main>;
}
