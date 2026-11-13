import { useLayoutEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { chatTimeLabel, confirmChatEntry, planChatLayouts, type ChatEntry, type ChatLayout, type ChatLayouts, type ChatPreview } from '../chatImport';
import { buildChatExtractionInput, previewChatEvents } from '../chatExtraction';
import { memoPeriods, type DailyMemos, type MemoPeriod } from '../types';
import type { DailyMemoSchedules } from '../memoSchedule';
import { chatImageLimits, unpackChatImages, validateChatImages } from '../chatImportImages';

interface Props {
  date: string;
  memos: DailyMemos;
  schedules?: DailyMemoSchedules;
  onImport: (entries: ChatEntry[], modes: ChatLayouts) => number;
  onUndo?: () => number;
  onBack: () => void;
}

type NativeDrop = { id?: string; text?: string };
const periodLabels: Record<MemoPeriod, string> = { morning: '早上', afternoon: '下午', evening: '晚上' };
const layoutLabels: Record<ChatLayout, string> = { periods: '早上／下午／晚上', hourly: '24 小时' };

export function ChatImportPanel({ date, memos, schedules, onImport, onUndo, onBack }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<(ChatPreview & { id: number })[]>([]);
  const [layoutChoices, setLayoutChoices] = useState<ChatLayouts>({});
  const [images, setImages] = useState<File[]>([]);
  const canExtract = !busy && (text.trim().length > 0 || images.length > 0);
  const imageQueue = useRef<File[]>([]);
  const zone = useRef<HTMLElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const processing = useRef(false);
  const mounted = useRef(false);
  const receiveDrop = useRef<(drop: NativeDrop) => void>(() => {});
  const updateImages = (files: File[]) => {
    imageQueue.current = files;
    setImages(files);
  };

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const extract = async () => {
    if (processing.current) return;
    processing.current = true;
    setBusy(true);
    setMessage(images.length ? '正在本机识别截图…' : '正在用本地千问提取关键事项…');
    try {
      let source = text;
      const queued = imageQueue.current;
      if (queued.length) {
        const { readChatScreenshots } = await import('../chatOcr');
        const recognized = await readChatScreenshots(queued, (current, total) => {
          if (mounted.current) setMessage('正在识别截图 ' + current + '/' + total + '…');
        });
        if (!mounted.current) return;
        source = [text.trim(), ...recognized.map((value, index) => '【截图 ' + (index + 1) + '】\n' + value)]
          .filter(Boolean).join('\n\n');
        if (source.length > 12_000) throw Error('本批文字和截图超过 12,000 字，请移除部分截图或缩短文字后重试。');
        updateImages([]);
      }
      if (!mounted.current) return;
      setText(source.slice(0, 12_000));
      setMessage('正在用本地千问提取关键事项…');
      const input = buildChatExtractionInput(source, date);
      const output = await invoke<string>('extract_chat_events', { input });
      if (!mounted.current) return;
      const entries = previewChatEvents(output, source, date);
      setPreview(entries.map((entry, id) => ({ ...entry, id })));
      setLayoutChoices({});
      setText('');
      setMessage(entries.length ? '已提取 ' + entries.length + ' 条关键事项，等待确认。' : '没有找到需要记录的事项。');
    } catch (cause) {
      if (mounted.current) setMessage(typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : '提取失败，请重试。');
    } finally {
      processing.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const addImages = (files: File[]) => {
    try {
      const batch = [...imageQueue.current, ...files];
      validateChatImages(batch);
      updateImages(batch);
      setMessage('已添加 ' + batch.length + ' 张截图，等待提取。');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '无法添加截图。');
    }
  };
  const addText = (value: string) => {
    if (processing.current || !value.trim()) return;
    const next = [text.trim(), value.trim()].filter(Boolean).join('\n\n');
    if (next.length > 12_000) { setMessage('每次最多导入 12,000 字，请分批添加。'); return; }
    setText(next);
  };
  const readNativeDrop = async (id: string) => {
    if (processing.current) return;
    processing.current = true;
    setBusy(true);
    try {
      const files = unpackChatImages(await invoke<ArrayBuffer>('take_chat_screenshots', { id }));
      if (mounted.current) addImages(files);
    } catch (cause) {
      if (mounted.current) setMessage(typeof cause === 'string' ? cause : '无法读取拖入的截图。');
    } finally {
      processing.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  receiveDrop.current = ({ id, text: value }) => {
    if (id) void readNativeDrop(id);
    else if (value) addText(value);
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
  const plans = planChatLayouts(ready, schedules, memos);
  const unresolved = Object.entries(plans).some(([date, plan]) => plan.conflict && !layoutChoices[date]);
  const patch = (id: number, changes: Partial<ChatPreview>) => setPreview(current =>
    current.map(entry => entry.id === id ? { ...entry, ...changes } : entry));

  return <main className="chat-import" aria-labelledby="chat-import-heading">
    <header className="chat-import-heading">
      <div><h2 id="chat-import-heading">从聊天导入</h2><p>提取聊天里的日程和截止时间，确认后写入日历。</p></div>
      <button type="button" className="chat-button chat-back" onClick={onBack}><span aria-hidden="true">←</span> 返回日历</button>
    </header>
    <div className="chat-import-workspace">
    <section ref={zone} className="chat-import-zone" aria-label="聊天导入区"
      onDragOver={event => event.preventDefault()}
      onDrop={event => {
        event.preventDefault();
        if (processing.current) return;
        if (event.dataTransfer.files.length) addImages(Array.from(event.dataTransfer.files));
        else addText(event.dataTransfer.getData('text/plain'));
      }}
      onPaste={event => {
        if (processing.current) return;
        const files = Array.from(event.clipboardData.files);
        if (files.length) { event.preventDefault(); addImages(files); }
        else if (!(event.target instanceof HTMLTextAreaElement) && event.clipboardData.getData('text/plain').trim()) {
          event.preventDefault();
          addText(event.clipboardData.getData('text/plain'));
        }
      }}>
      <div className="chat-section-heading">
        <h3><label htmlFor="chat-source">聊天内容</label></h3>
        <span className="chat-local">本机提取</span>
      </div>
      <p className="chat-help" id="chat-source-help">粘贴聊天文字，或拖入、粘贴最多 {chatImageLimits.count} 张截图。按 Enter 提取，Shift+Enter 换行。</p>
      <textarea id="chat-source" aria-label="聊天文字" aria-describedby="chat-source-help" placeholder="例如：下周一下午两点开会，周五前交材料。" rows={4} maxLength={12000} value={text}
        disabled={busy} onChange={event => setText(event.target.value)}
        onKeyDown={event => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          event.preventDefault();
          if (canExtract && !event.repeat) void extract();
        }} />
      <div className="chat-import-actions">
        <button type="button" className="chat-button" disabled={busy} onClick={() => picker.current?.click()}><span aria-hidden="true">＋</span> 选择截图</button>
        <input ref={picker} type="file" hidden multiple accept="image/png,image/jpeg,image/webp" onChange={event => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          if (files.length) addImages(files);
        }} />
        <button type="button" className="chat-button chat-primary" disabled={!canExtract} onClick={() => void extract()}>提取并预览</button>
      </div>
      {images.length > 0 && <ul className="chat-import-images" aria-label="待提取截图">
        {images.map((file, index) => <li key={index}><span>{file.name}</span>
          <button type="button" aria-label={'移除截图 ' + (index + 1)} disabled={busy}
            onClick={() => updateImages(imageQueue.current.filter((_, position) => position !== index))}>移除</button></li>)}
      </ul>}
      <div className="chat-source-footer">
        <p>参考日期 <time dateTime={date}>{date}</time></p>
        <p role="status" className="chat-status" data-busy={busy}>{message}</p>
      </div>
    </section>
    <section className="chat-import-preview" aria-labelledby="chat-preview-heading">
      <div className="chat-section-heading">
        <h3 id="chat-preview-heading">导入预览</h3>
        {preview.length > 0 && <span className="chat-count">{preview.length} 条待确认</span>}
      </div>
      {preview.length === 0 ? <div className="chat-empty">
        <span className="chat-empty-mark" aria-hidden="true" />
        <strong>暂无待确认事项</strong>
        <p>提取后可在这里核对内容、日期和时段。</p>
      </div> : <>
      {ready.length < preview.length && <p className="chat-help">请补齐日期和时段，或移除该条。</p>}
      <ul>
        {preview.map((entry, index) => {
          const key = entry.date ?? '';
          const plan = plans[key];
          return <li key={entry.id}>
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
            <button type="button" className="chat-button chat-quiet" aria-label={'移除第 ' + (index + 1) + ' 条'} onClick={() =>
              setPreview(current => current.filter(item => item.id !== entry.id))}>移除</button>
          </div>
          {plan?.conflict ? <div className="chat-layout-conflict">
            <span>时间段布局冲突{plan.existing ? '，当天已有 ' + layoutLabels[plan.existing] + ' 布局' : '，同一天包含时段和具体时间'}</span>
            <label>当天布局 <select value={layoutChoices[key] ?? ''} onChange={event => {
              const mode = event.target.value;
              setLayoutChoices(current => {
                const next = { ...current };
                if (mode === 'hourly' || mode === 'periods') next[key] = mode;
                else delete next[key];
                return next;
              });
            }}>
              <option value="">选择当天布局</option>
              <option value="periods">{layoutLabels.periods}</option>
              <option value="hourly">{layoutLabels.hourly}</option>
            </select></label>
          </div> : plan && <p className="chat-layout-hint">当天布局 {layoutLabels[plan.suggested]}</p>}
        </li>;
        })}
      </ul>
      </>}
      <div className="chat-import-actions chat-preview-actions">
        {onUndo && <button type="button" className="chat-button chat-quiet" disabled={busy} onClick={() => {
          const count = onUndo();
          setMessage('已撤销 ' + count + ' 条记录，编辑过的内容已保留。');
        }}>撤销本批</button>}
        {preview.length > 0 && <button type="button" className="chat-button chat-primary" disabled={busy || unresolved || ready.length !== preview.length} onClick={() => {
          const modes = Object.fromEntries(Object.entries(plans).map(([date, plan]) =>
            [date, plan.conflict ? layoutChoices[date] : plan.suggested]));
          const count = onImport(ready, modes);
          setPreview([]);
          setLayoutChoices({});
          setMessage(count ? '已写入日历 ' + count + ' 条记录。' : '没有新增记录，相同事项已跳过。');
        }}>确认导入 {ready.length} 条</button>}
      </div>
    </section>
    </div>
  </main>;
}
