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
  onPhone?: () => void;
  onImport?: () => void;
  saveState?: string;
  syncState?: string;
  cloudError?: boolean;
  disabled?: boolean;
}

export function TitleBar({ onSettings, taskCount, today, calendarOpen, onCalendar, onHistory, onSave, saving, onCloud, onImport, saveState, syncState, cloudError, disabled }: Props) {
  return <header className="title-bar">
    <div className="title-start">
      <button className="calendar-button" type="button" onClick={onCalendar} disabled={disabled}
        aria-label={calendarOpen ? '切到四宫格' : '日期备忘录'} aria-pressed={calendarOpen} title={calendarOpen ? '切到四宫格' : '打开日期界面'}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          {calendarOpen ? <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 3v18M3 12h18" /></> :
            <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 11h18" /></>}
        </svg>
        <span>{calendarOpen ? '切到四宫格' : `${Number(today.slice(5, 7))}月${Number(today.slice(8))}日`}</span>
      </button>
      <div className="brand">Focus Matrix</div>
    </div>
    <div className="title-actions">
      <button className="history-button import-button" type="button" disabled={disabled || !onImport} onClick={onImport}>导入信息</button>
      <button className="history-button save-version-button" type="button" disabled={disabled || saving} onClick={onSave}
        aria-label="保存待办版本" title="保存待办，可在历史中恢复">
        <span>{saving ? '保存中…' : '保存'}</span>
      </button>
      <button className="history-button records-button" type="button" disabled={disabled} onClick={onHistory}>历史与仓库</button>
      <button className={`history-button cloud-button${cloudError ? ' cloud-pending' : ''}`} type="button" disabled={disabled} onClick={onCloud}>同步与分享</button>
      <button className="settings-button" type="button" disabled={disabled} onClick={onSettings} aria-label="打开设置" title="设置">⚙</button>
    </div>
    <div className="title-status">
      <span className="task-count">{taskCount} 项待办</span>
      {saveState && <span role="status">{saveState}</span>}
      {syncState && <span role="status" className={cloudError ? 'cloud-pending' : undefined}>{syncState}</span>}
    </div>
  </header>;
}
