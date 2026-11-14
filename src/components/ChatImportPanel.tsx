import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { chatEntryFingerprint, chatPeriodForHour, chatTimeLabel, confirmChatEntry, planChatLayouts, type ChatEntry, type ChatLayout, type ChatLayouts, type ChatPreview } from '../chatImport';
import { buildChatExtractionInput, previewChatEvents } from '../chatExtraction';
import { memoPeriods, type DailyMemos, type MemoPeriod } from '../types';
import type { DailyMemoSchedules } from '../memoSchedule';
import { chatImageLimits, unpackChatImages, validateChatImages } from '../chatImportImages';
import './chatImport.css';

interface Props {
  date: string;
  memos: DailyMemos;
  schedules?: DailyMemoSchedules;
  existingFingerprints?: ReadonlySet<string>;
  onImport: (entries: ChatEntry[], modes: ChatLayouts) => Promise<number>;
  onUndo?: () => Promise<number>;
  onBack: () => void;
}

type NativeDrop = { id?: string; text?: string };
type PreviewRow = ChatPreview & { id: number; timeMode: ChatLayout; clockInput?: string; selected: boolean };
type Extraction = { requestId: string; controller: AbortController; native: boolean };
const periodLabels: Record<MemoPeriod, string> = { morning: '早上', afternoon: '下午', evening: '晚上' };
const layoutLabels: Record<ChatLayout, string> = { periods: '早上／下午／晚上', hourly: '24 小时' };

function abortExtraction(extraction: Extraction) {
  extraction.controller.abort();
  return extraction.native
    ? invoke('cancel_chat_extraction', { requestId: extraction.requestId }).catch(() => undefined)
    : Promise.resolve();
}

function Screenshot({ file, index }: { file: File; index: number }) {
  const [url, setUrl] = useState('');
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url ? <button type="button" className="chat-screenshot" aria-expanded={expanded}
    aria-label={(expanded ? '缩小截图 ' : '放大截图 ') + (index + 1)} onClick={() => setExpanded(value => !value)}>
    <img src={url} alt={'聊天截图 ' + (index + 1)} />
  </button> : null;
}

export function ChatImportPanel({ date, memos, schedules, existingFingerprints, onImport, onUndo, onBack }: Props) {
  const [text, setText] = useState('');
  const [reference, setReference] = useState(date);
  const [sourceSnapshot, setSourceSnapshot] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [downloadingModel, setDownloadingModel] = useState(false);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [layoutChoices, setLayoutChoices] = useState<ChatLayouts>({});
  const [images, setImages] = useState<File[]>([]);
  const canExtract = !busy && !downloadingModel && Boolean(reference) && (text.trim().length > 0 || images.length > 0);
  const imageQueue = useRef<File[]>([]);
  const zone = useRef<HTMLElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const processing = useRef(false);
  const active = useRef<Extraction | undefined>(undefined);
  const cancelWait = useRef<Promise<unknown> | undefined>(undefined);
  const mounted = useRef(false);
  const receiveDrop = useRef<(drop: NativeDrop) => void>(() => {});
  const downloadModel = async () => {
    if (processing.current || downloadingModel) return;
    setDownloadingModel(true);
    setMessage('正在下载本机模型（约 3.3 GB），请保持 Ollama 和网络连接。');
    try {
      await invoke('install_local_chat_model');
      if (mounted.current) setMessage('模型已就绪，可以提取并预览。');
    } catch (error) {
      if (mounted.current) setMessage(String(error));
    } finally {
      if (mounted.current) setDownloadingModel(false);
    }
  };
  const updateImages = (files: File[]) => {
    imageQueue.current = files;
    setImages(files);
  };

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (active.current) void abortExtraction(active.current);
    };
  }, []);

  const cancel = async () => {
    const current = active.current;
    if (!current) return;
    active.current = undefined;
    setMessage('提取已取消。');
    const pending = abortExtraction(current);
    cancelWait.current = pending;
    await pending;
    if (cancelWait.current !== pending) return;
    cancelWait.current = undefined;
    processing.current = false;
    if (mounted.current) setBusy(false);
  };

  const extract = async () => {
    if (processing.current || downloadingModel) return;
    const requestId = crypto.getRandomValues(new Uint32Array(4)).join('-');
    const request: Extraction = { requestId, controller: new AbortController(), native: false };
    active.current = request;
    const current = () => mounted.current && active.current === request;
    processing.current = true;
    setBusy(true);
    setMessage(images.length ? '正在本机识别截图…' : '正在用本地千问提取关键事项…');
    try {
      let source = text;
      const queued = imageQueue.current;
      if (queued.length) {
        const { readChatScreenshots } = await import('../chatOcr');
        const recognized = await readChatScreenshots(queued, (current, total) => {
          if (active.current === request && mounted.current) setMessage('正在识别截图 ' + current + '/' + total + '…');
        }, request.controller.signal);
        if (!current()) return;
        source = [text.trim(), ...recognized.map((value, index) => '【截图 ' + (index + 1) + '】\n' + value)]
          .filter(Boolean).join('\n\n');
        if (source.length > 12_000) throw Error('本批文字和截图超过 12,000 字，请移除部分截图或缩短文字后重试。');
      }
      if (!current()) return;
      setMessage('正在用本地千问提取关键事项…');
      const input = buildChatExtractionInput(source, reference);
      request.native = true;
      const output = await invoke<string>('extract_chat_events', { input, requestId: request.requestId });
      if (!current()) return;
      const entries = previewChatEvents(output, source, reference);
      setPreview(entries.map((entry, id) => ({ ...entry, id, selected: true,
        timeMode: entry.hour === undefined ? 'periods' : 'hourly' })));
      setLayoutChoices({});
      setSourceSnapshot(source);
      setMessage(entries.length ? '已提取 ' + entries.length + ' 条关键事项，等待确认。' : '没有找到需要记录的事项。');
    } catch (cause) {
      if (current()) setMessage(typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : '提取失败，请重试。');
    } finally {
      if (active.current === request) {
        active.current = undefined;
        processing.current = false;
        if (mounted.current) setBusy(false);
      }
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

  const seen = new Set(existingFingerprints);
  const duplicate = new Set<number>();
  const ready: ChatEntry[] = [];
  let incomplete = 0;
  for (const entry of preview) {
    const confirmed = confirmChatEntry(entry);
    if (!confirmed) {
      if (entry.selected) incomplete++;
      continue;
    }
    const key = chatEntryFingerprint(confirmed);
    if (seen.has(key)) duplicate.add(entry.id);
    else if (entry.selected) {
      seen.add(key);
      ready.push(confirmed);
    }
  }
  const plans = planChatLayouts(ready, schedules, memos);
  const unresolved = Object.entries(plans).some(([date, plan]) => plan.conflict && !layoutChoices[date]);
  const patch = (id: number, changes: Partial<Omit<PreviewRow, 'id'>>) => setPreview(current =>
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
        else if (!(event.target instanceof HTMLTextAreaElement) && !(event.target instanceof HTMLInputElement) &&
          event.clipboardData.getData('text/plain').trim()) {
          event.preventDefault();
          addText(event.clipboardData.getData('text/plain'));
        }
      }}>
      <div className="chat-section-heading">
        <h3><label htmlFor="chat-source">聊天内容</label></h3>
        <span className="chat-local">本机提取</span>
      </div>
      <p className="chat-help" id="chat-source-help">粘贴聊天文字，或拖入、粘贴最多 {chatImageLimits.count} 张截图。按 Enter 提取，Shift+Enter 换行。</p>
      <details className="chat-help">
        <summary>配置本机识别</summary>
        <p>已安装离线版可直接提取。首次使用标准版，请先安装并启动 Ollama，再按需下载模型。</p>
        <button type="button" className="chat-quiet" onClick={() => void invoke('open_task_link', { url: 'https://ollama.com/download/windows' }).catch(error => setMessage(String(error)))}>打开 Ollama 下载页</button>
        <button type="button" className="chat-quiet" disabled={busy || downloadingModel} onClick={() => void downloadModel()}>{downloadingModel ? '模型下载中…' : '下载 Qwen3.5 4B'}</button>
      </details>
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
        {busy && active.current && <button type="button" className="chat-button" onClick={() => void cancel()}>取消提取</button>}
      </div>
      {images.length > 0 && <ul className="chat-import-images" aria-label="待提取截图">
        {images.map((file, index) => <li key={index}><Screenshot file={file} index={index} /><span>{file.name}</span>
          <button type="button" aria-label={'移除截图 ' + (index + 1)} disabled={busy}
            onClick={() => updateImages(imageQueue.current.filter((_, position) => position !== index))}>移除</button></li>)}
      </ul>}
      <div className="chat-source-footer">
        <label>参考日期 <input type="date" value={reference} disabled={busy} onChange={event => setReference(event.target.value)} /></label>
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
      {incomplete > 0 && <p className="chat-help">请补齐所选事项的日期和时间，或取消选择。</p>}
      <ul>
        {preview.map((entry, index) => {
          const key = entry.date ?? '';
          const plan = plans[key];
          const timeMode = entry.timeMode;
          const clock = entry.clockInput ?? (entry.hour === undefined ? '' : chatTimeLabel(entry.hour, entry.minute ?? 0));
          return <li key={entry.id}>
          <div className="chat-preview-title">
            <input type="checkbox" aria-label={'选择第 ' + (index + 1) + ' 条'} checked={entry.selected && !duplicate.has(entry.id)}
              disabled={duplicate.has(entry.id)} onChange={event => patch(entry.id, { selected: event.target.checked })} />
            <input type="text" aria-label={'第 ' + (index + 1) + ' 条内容'} value={entry.text} maxLength={12000}
              onChange={event => patch(entry.id, { text: event.target.value })} />
          </div>
          {duplicate.has(entry.id) && <p className="chat-help">重复事项，导入时跳过。</p>}
          {!entry.date && <p className="chat-help">日期待确认</p>}
          <div className="chat-preview-fields">
            <label>日期 <input type="date" value={entry.date ?? ''} onChange={event =>
              patch(entry.id, { date: event.target.value || undefined })} /></label>
            <div className="chat-time-modes" role="group" aria-label="时段模式">
              <button type="button" className="chat-button" aria-pressed={timeMode === 'periods'}
                onClick={() => patch(entry.id, { timeMode: 'periods' })}>{layoutLabels.periods}</button>
              <button type="button" className="chat-button" aria-pressed={timeMode === 'hourly'}
                onClick={() => patch(entry.id, { timeMode: 'hourly' })}>{layoutLabels.hourly}</button>
            </div>
            {timeMode === 'periods' ? <label>时段 <select value={entry.period ?? ''} onChange={event => {
              patch(entry.id, { period: memoPeriods.find(value => value === event.target.value) });
            }}>
              <option value="">选择时段</option>
              {memoPeriods.map(period => <option key={period} value={period}>{periodLabels[period]}</option>)}
            </select></label> : <label>{entry.deadline ? '截止时间' : '开始时间'}
              <input className="chat-clock-input" type="text" placeholder="HH:mm" maxLength={5} value={clock}
                aria-invalid={Boolean(clock && entry.hour === undefined)}
                onChange={event => {
                  const clockInput = event.target.value;
                  const match = /^(\d|[01]\d|2[0-3]):([0-5]\d)$/.exec(clockInput);
                  const hour = match ? Number(match[1]) : undefined;
                  patch(entry.id, { clockInput, hour, minute: match ? Number(match[2]) : undefined,
                    period: hour === undefined ? entry.period : chatPeriodForHour(hour) });
                }}
                onBlur={() => {
                  if (entry.hour !== undefined && entry.minute !== undefined) {
                    patch(entry.id, { clockInput: chatTimeLabel(entry.hour, entry.minute) });
                  }
                }} />
            </label>}
            {timeMode === 'hourly' && !entry.deadline && <label>结束时间
              <input type="time" value={entry.endTime ?? ''} onChange={event =>
                patch(entry.id, { endTime: event.target.value || undefined })} />
            </label>}
            <button type="button" className="chat-button chat-quiet" aria-label={'移除第 ' + (index + 1) + ' 条'} onClick={() =>
              setPreview(current => current.filter(item => item.id !== entry.id))}>移除</button>
          </div>
          {entry.sourceText && <details className="chat-source-evidence">
            <summary>原文依据</summary><p>{entry.sourceText}</p>
          </details>}
          {entry.selected && !duplicate.has(entry.id) && plan?.conflict ? <div className="chat-layout-conflict">
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
          </div> : entry.selected && !duplicate.has(entry.id) && plan &&
            <p className="chat-layout-hint">当天布局 {layoutLabels[plan.suggested]}</p>}
        </li>;
        })}
      </ul>
      </>}
      {sourceSnapshot && <details className="chat-source-evidence">
        <summary>本批提取原文</summary><p>{sourceSnapshot}</p>
      </details>}
      <div className="chat-import-actions chat-preview-actions">
        {onUndo && <button type="button" className="chat-button chat-quiet" disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            const count = await onUndo();
            setMessage('已撤销 ' + count + ' 条记录，编辑过的内容已保留。');
          } catch (error) {
            setMessage(error instanceof Error ? error.message : '撤销保存失败，请重试。');
          } finally { setBusy(false); }
        }}>撤销本批</button>}
        {preview.length > 0 && <button type="button" className="chat-button chat-primary" disabled={busy || unresolved || incomplete > 0 || ready.length === 0} onClick={async () => {
          const modes = Object.fromEntries(Object.entries(plans).map(([date, plan]) =>
            [date, plan.conflict ? layoutChoices[date] : plan.suggested]));
          setBusy(true);
          try {
            const count = await onImport(ready, modes);
            setPreview([]);
            setLayoutChoices({});
            setMessage(count ? '已写入日历 ' + count + ' 条记录。' : '没有新增记录，相同事项已跳过。');
          } catch (error) {
            setMessage(error instanceof Error ? error.message : '导入保存失败，请重试。');
          } finally { setBusy(false); }
        }}>确认导入 {ready.length} 条</button>}
      </div>
    </section>
    </div>
  </main>;
}
