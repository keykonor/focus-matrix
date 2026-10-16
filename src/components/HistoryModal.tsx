import { useEffect, useRef, useState } from 'react';
import { getVersion, historyReasonNames, listVersions, type ContentVersion, type VersionList } from '../contentHistory';
import { quadrantNames, quadrants } from '../types';
import { groupTaskVersions } from '../taskHistory';

const timeFormatter = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
interface Props {
  onClose: () => void;
  onSaveVersion: () => Promise<void>;
  onRestore: (version: ContentVersion) => Promise<void>;
}

export function HistoryModal({ onClose, onSaveVersion, onRestore }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<VersionList>({ versions: [], unreadableCount: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [version, setVersion] = useState<ContentVersion | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [visibleCount, setVisibleCount] = useState(40);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingVersion, setLoadingVersion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const previousFocus = document.activeElement;
    dialog.current?.focus();
    return () => { if (previousFocus instanceof HTMLElement) previousFocus.focus(); };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      if (!buttons?.length) { event.preventDefault(); return; }
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);
  useEffect(() => {
    let active = true;
    setLoadingList(true);
    listVersions().then((result) => {
      if (!active) return;
      const versions = groupTaskVersions(result.versions).flatMap(group => group.versions);
      setList({...result, versions});
      setSelectedId((current) => versions.some((item) => item.id === current) ? current : versions[0]?.id ?? null);
    }).catch((cause: unknown) => {
      if (import.meta.env.DEV) console.error('历史列表读取失败', cause);
      if (active) setError('无法读取历史记录。请检查文件权限后重试。');
    }).finally(() => { if (active) setLoadingList(false); });
    return () => { active = false; };
  }, [refresh]);
  useEffect(() => {
    let active = true;
    setVersion(null);
    setConfirmRestore(false);
    if (!selectedId) return;
    setLoadingVersion(true);
    getVersion(selectedId).then((result) => { if (active) setVersion(result); }).catch((cause: unknown) => {
      if (import.meta.env.DEV) console.error('历史版本读取失败', cause);
      if (active) setError('这个版本无法读取，原文件仍保留。请选择其他版本。');
    }).finally(() => { if (active) setLoadingVersion(false); });
    return () => { active = false; };
  }, [selectedId]);
  const perform = async (action: () => Promise<void>, success: string) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); setMessage(success); setConfirmRestore(false); setRefresh((current) => current + 1); }
    catch (cause) { if (import.meta.env.DEV) console.error('历史操作失败', cause); setError('操作未完成，当前界面内容仍保留。请检查本地保存状态后重试。'); }
    finally { setBusy(false); }
  };
  const completedCount = version?.content.tasks.filter(task => task.completed).length ?? 0;
  const pendingCount = (version?.content.tasks.length ?? 0) - completedCount;
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="history-modal" role="dialog" aria-modal="true" aria-labelledby="history-title" tabIndex={-1} ref={dialog}>
      <header className="history-header">
        <div><h2 id="history-title">待办历史</h2><p>按保存日期查看和恢复待办列表</p></div>
        <button type="button" className="history-close" aria-label="关闭历史记录" disabled={busy} onClick={onClose}>×</button>
      </header>
      <div className="history-toolbar"><span>修改后自动保留 · 历史记录不会自动删除</span>
        <button type="button" className="history-save" disabled={busy} onClick={() => void perform(onSaveVersion, '当前待办已保存为一个新版本。')}>保存当前待办</button>
      </div>
      <div className="history-main">
        <nav className="history-list" aria-label="选择历史版本" aria-busy={loadingList}>
          {loadingList && list.versions.length === 0 && <p className="history-empty">正在读取…</p>}
          {!loadingList && list.versions.length === 0 && <p className="history-empty">尚无历史记录</p>}
          {groupTaskVersions(list.versions.slice(0, visibleCount)).map(group => <section className="history-day-group" key={group.date}>
            <h3><time dateTime={group.date}>{group.date}</time></h3>
            {group.versions.map((item) => <button type="button" key={item.id} className="history-version" disabled={busy}
            data-version-id={item.id} aria-pressed={selectedId === item.id} onClick={() => { setSelectedId(item.id); setError(''); setMessage(''); }}>
            <time dateTime={new Date(item.createdAt).toISOString()}>{timeFormatter.format(new Date(item.createdAt))}</time>
            <span>{historyReasonNames[item.reason]}</span><small>共 {item.taskCount} 项 · 待办 {item.pendingCount} · 已完成 {item.completedCount}</small>
          </button>)}
          </section>)}
          {list.versions.length > visibleCount && <button type="button" className="history-more" disabled={busy} onClick={() => setVisibleCount((count) => count + 40)}>显示更早的版本</button>}
        </nav>
        <section className="history-preview" aria-label="历史内容预览" aria-busy={loadingVersion}>
          {loadingVersion && <p className="history-empty">正在载入内容…</p>}
          {version && <>
            <p className="history-preview-caption">待办预览 · 恢复仅替换待办列表（含已完成项）</p>
            <div className="history-task-counts" aria-label="版本任务统计"><span>共 {version.content.tasks.length} 项</span><span>待办 {pendingCount}</span><span>已完成 {completedCount}</span></div>
            {quadrants.map((quadrant) => {
              const tasks = version.content.tasks.filter((task) => task.quadrant === quadrant);
              return tasks.length > 0 && <section className="history-preview-section" key={quadrant}><h3>{quadrantNames[quadrant]}</h3>
                {tasks.map((task) => <p key={task.id} className={task.completed ? 'history-task completed' : 'history-task'}>{task.completed ? '✓ ' : '· '}{task.text || '（空白任务）'}</p>)}
              </section>;
            })}
            {version.content.tasks.length === 0 && <p className="history-empty">这个版本没有待办。</p>}
          </>}
        </section>
      </div>
      <footer className="history-footer">
        {list.unreadableCount > 0 && <p className="history-notice">{list.unreadableCount} 份历史文件无法读取，原文件已保留。</p>}
        {error && <p role="alert" className="history-error">{error}</p>}
        {message && <p role="status" className="history-message">{message}</p>}
        {confirmRestore ? <div className="history-confirm"><p>确认恢复此版本的待办列表（含已完成项）？当前待办会先保存到历史；日期备忘录、设置和窗口状态保持不变。</p>
          <div><button type="button" className="history-cancel" disabled={busy} onClick={() => setConfirmRestore(false)}>取消</button>
            <button type="button" className="done-button history-confirm-button" disabled={busy || !version} onClick={() => version && void perform(() => onRestore(version), '已恢复。恢复前的内容也已保存，可再次恢复。')}>{busy ? '正在恢复…' : '确认恢复'}</button></div>
        </div> : <div className="history-footer-actions"><span>只恢复待办，保留当前备忘录、设置和窗口位置</span><button type="button" className="done-button history-restore" disabled={busy || !version || loadingVersion} onClick={() => setConfirmRestore(true)}>恢复待办</button></div>}
      </footer>
    </div>
  </div>;
}
