interface Props {
  onSettings: () => void;
  taskCount: number;
  today: string;
  calendarOpen: boolean;
  onCalendar: () => void;
  onHistory: () => void;
  onCompleted?: () => void;
  onSave: () => void;
  saving?: boolean;
  onCloud: () => void;
  onPhone: () => void;
  cloudError?: boolean;
  disabled?: boolean;
}

export function TitleBar({ onSettings, taskCount, today, calendarOpen, onCalendar, onHistory, onCompleted, onSave, saving, onCloud, onPhone, cloudError, disabled }: Props) {
  return <header className="title-bar">
    <div className="title-start"><button className="calendar-button" type="button" onClick={onCalendar} disabled={disabled}
      aria-label="日期备忘录" aria-pressed={calendarOpen} title={calendarOpen ? '关闭日期界面' : '打开日期界面'}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 11h18" /></svg>
      <span>{Number(today.slice(5, 7))}月{Number(today.slice(8))}日</span>
    </button><div className="brand">Focus Matrix</div></div>
    <div className="title-actions"><span className="task-count">{taskCount} 项待办</span><button className="history-button save-version-button" type="button" disabled={disabled || saving} onClick={onSave} aria-label="保存待办版本" title="保存待办，可在历史中恢复">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/></svg><span>{saving ? '保存中…' : '保存'}</span>
    </button><button className="history-button" type="button" disabled={disabled} onClick={onHistory} aria-label="打开历史记录" title="待办历史">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2" /></svg><span>历史</span>
    </button>{onCompleted && <button className="history-button completed-button" type="button" disabled={disabled} onClick={onCompleted} aria-label="打开已完成仓库" title="查看跨日归档的已完成任务">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 8h16v13H4V8ZM3 3h18v5H3V3ZM9 12h6" /></svg><span>仓库</span>
    </button>}<button className={`history-button cloud-button${cloudError ? ' cloud-pending' : ''}`} type="button" disabled={disabled} onClick={onCloud} aria-label="打开云端分享" title={cloudError ? '云端同步待重试，本地内容已保留' : '显示分享链接'}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M7 18a5 5 0 1 1 1-10 6 6 0 0 1 11 3 3.5 3.5 0 0 1 0 7H7Z"/><path d="M12 11v8m-3-5 3-3 3 3"/></svg><span>分享链接</span></button><button className="history-button phone-button" type="button" disabled={disabled} onClick={onPhone} aria-label="显示手机连接链接" title="手机连接链接与已绑定手机"><svg width="15" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/></svg><span>手机连接</span></button><button className="settings-button" type="button" onClick={onSettings} aria-label="打开设置" title="设置">⚙</button></div>
  </header>;
}
