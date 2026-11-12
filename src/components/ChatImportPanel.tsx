import { useLayoutEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { chatTimeLabel, confirmChatEntry, type ChatEntry, type ChatPreview } from '../chatImport';
import { buildChatExtractionInput, previewChatEvents } from '../chatExtraction';
import { memoPeriods, type MemoPeriod } from '../types';

interface Props {
  date: string;
  onImport: (entries: ChatEntry[]) => number;
  onUndo?: () => number;
  onBack: () => void;
}

type NativeDrop = { id?: string; text?: string };
const periodLabels: Record<MemoPeriod, string> = { morning: '早上', afternoon: '下午', evening: '晚上' };

export function ChatImportPanel({ date, onImport, onUndo, onBack }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<(ChatPreview & { id: number })[]>([]);
  const zone = useRef<HTMLElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const processing = useRef(false);
  const mounted = useRef(false);
  const receiveDrop = useRef<(drop: NativeDrop) => void>(() => {});

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const extract = async (load: () => Promise<string>, recognizingImage = false) => {
    if (processing.current) return;
    processing.current = true;
    setBusy(true);
    setMessage(recognizingImage ? '正在本机识别截图…' : '正在用本地千问提取关键事项…');
    try {
      const source = await load();
      if (!mounted.current) return;
      setText(source.slice(0, 12_000));
      setMessage('正在用本地千问提取关键事项…');
      const input = buildChatExtractionInput(source, date);
      const output = await invoke<string>('extract_chat_events', { input });
      if (!mounted.current) return;
      const entries = previewChatEvents(output, source, date);
      setPreview(entries.map((entry, id) => ({ ...entry, id })));
      setText('');
      setMessage(entries.length ? '已提取 ' + entries.length + ' 条关键事项，等待确认。' : '没有找到需要记录的事项。');
    } catch (cause) {
      if (mounted.current) setMessage(typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : '提取失败，请重试。');
    } finally {
      processing.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const submit = (value: string) => { void extract(async () => value); };
  const importImage = (load: () => Promise<Blob>) => extract(async () => {
    const { readChatScreenshot } = await import('../chatOcr');
    return readChatScreenshot(await load());
  }, true);

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

  const ready = preview.flatMap(entry => {
    const confirmed = confirmChatEntry(entry);
    return confirmed ? [confirmed] : [];
  });
  const patch = (id: number, changes: Partial<ChatPreview>) => setPreview(current =>
    current.map(entry => entry.id === id ? { ...entry, ...changes } : entry));

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
      <p>拖入或粘贴微信截图、聊天文字。用本地千问提取日期、时间、地点和准备事项，确认后写入日历。</p>
      <textarea aria-label="聊天文字" placeholder="也可以在这里输入聊天文字…" rows={3} maxLength={12000} value={text}
        disabled={busy} onChange={event => setText(event.target.value)} />
      <div className="chat-import-actions">
        <button type="button" disabled={busy} onClick={() => picker.current?.click()}>选择截图</button>
        <input ref={picker} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={event => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          if (files.length) importFiles(files);
        }} />
        <button type="button" disabled={busy || !text.trim()} onClick={() => submit(text)}>提取并预览</button>
        {onUndo && <button type="button" disabled={busy} onClick={() => {
          const count = onUndo();
          setMessage('已撤销 ' + count + ' 条记录，编辑过的内容已保留。');
        }}>撤销本批</button>}
      </div>
      <p role="status">{message}</p>
    </section>
    {preview.length > 0 && <section className="chat-import-preview" aria-labelledby="chat-preview-heading">
      <h3 id="chat-preview-heading">导入预览</h3>
      <p>{preview.length} 条待确认{ready.length < preview.length ? '，请补齐日期和时段，或移除该条' : ''}</p>
      <ul>
        {preview.map((entry, index) => <li key={entry.id}>
          <input type="text" aria-label={'第 ' + (index + 1) + ' 条内容'} value={entry.text} maxLength={12000}
            onChange={event => patch(entry.id, { text: event.target.value })} />
          <div className="chat-preview-fields">
            <label>日期 <input type="date" value={entry.date ?? ''} onChange={event =>
              patch(entry.id, { date: event.target.value || undefined })} /></label>
            <label>时段 <select value={entry.hour !== undefined ? 'precise' : entry.period ?? ''} onChange={event => {
              const period = memoPeriods.find(value => value === event.target.value);
              patch(entry.id, { period, hour: undefined, minute: undefined, endTime: undefined });
            }}>
              <option value="">选择时段</option>
              {entry.hour !== undefined && <option value="precise">
                {chatTimeLabel(entry.hour, entry.minute ?? 0)}{entry.endTime ? '–' + entry.endTime : entry.deadline ? ' 前' : ''}
              </option>}
              {memoPeriods.map(period => <option key={period} value={period}>{periodLabels[period]}</option>)}
            </select></label>
            <button type="button" aria-label={'移除第 ' + (index + 1) + ' 条'} onClick={() =>
              setPreview(current => current.filter(item => item.id !== entry.id))}>移除</button>
          </div>
        </li>)}
      </ul>
      <div className="chat-import-actions">
        <button type="button" disabled={busy || ready.length !== preview.length} onClick={() => {
          const count = onImport(ready);
          setPreview([]);
          setMessage(count ? '已写入日历 ' + count + ' 条记录。' : '没有新增记录，相同事项已跳过。');
        }}>确认导入 {ready.length} 条</button>
      </div>
    </section>}
  </main>;
}
