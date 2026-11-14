import { useEffect, useRef } from 'react';
import { defaultSettings, type AppSettings } from '../types';

interface Props {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onClose: () => void;
  onRecords?: () => void;
  onCloud?: () => void;
  onImport?: () => void;
}

export function SettingsModal({ settings, onChange, onClose, onRecords, onCloud, onImport }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => onChange({
    ...settings,
    [key]: value,
    ...(key === 'desktopMode' && value === true ? { alwaysOnTop: false } : {}),
    ...(key === 'alwaysOnTop' && value === true ? { desktopMode: false } : {}),
  });
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabIndex={-1} ref={dialogRef} onKeyDown={event => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (document.activeElement === dialogRef.current || document.activeElement === (event.shiftKey ? first : last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }}>
      <div className="modal-header"><h2 id="settings-title">设置</h2><button type="button" onClick={onClose} aria-label="关闭设置">×</button></div>
      <div className="settings-list">
        <h3 className="settings-group-title">窗口与启动</h3>
        <label className="setting-row"><span><strong>开机启动</strong><small>登录 Windows 后自动打开</small></span><input type="checkbox" checked={settings.autostart} onChange={(e) => update('autostart', e.target.checked)} /></label>
        <label className="setting-row"><span><strong>桌面底层</strong><small>工作时让其他窗口盖在便笺上方</small></span><input type="checkbox" checked={settings.desktopMode} onChange={(e) => update('desktopMode', e.target.checked)} /></label>
        <label className="setting-row"><span><strong>始终置顶</strong><small>让矩阵保持在其他窗口上方</small></span><input type="checkbox" checked={settings.alwaysOnTop} onChange={(e) => update('alwaysOnTop', e.target.checked)} /></label>
        <label className="setting-row"><span><strong>关闭按钮行为</strong><small>点击窗口右上角 × 时</small></span><select value={settings.closeBehavior} onChange={(e) => update('closeBehavior', e.target.value as AppSettings['closeBehavior'])}><option value="tray">隐藏到托盘</option><option value="quit">直接退出</option></select></label>
        <h3 className="settings-group-title">外观与排版</h3>
        <label className="setting-row"><span><strong>主题</strong></span><select value={settings.theme ?? defaultSettings.theme} onChange={event => update('theme', event.target.value as AppSettings['theme'])}><option value="classic">原绿蓝</option><option value="warm-gray">暖灰</option><option value="light">纯浅色</option></select></label>
        <label className="setting-row"><span><strong>间距</strong></span><select value={settings.density ?? defaultSettings.density} onChange={event => update('density', event.target.value as AppSettings['density'])}><option value="comfortable">舒适</option><option value="compact">紧凑</option></select></label>
        <label className="setting-row"><span><strong>字体大小</strong><small>调整任务文字</small></span><select value={settings.fontSize} onChange={(e) => update('fontSize', e.target.value as AppSettings['fontSize'])}><option value="small">小</option><option value="medium">中</option><option value="large">大</option></select></label>
        <label className="setting-row"><span><strong>界面透明度</strong><small>Windows 桌面透出程度</small></span><span className="range-control"><input type="range" min="80" max="100" step="1" value={settings.opacity} onChange={(e) => update('opacity', Number(e.target.value))} /><output>{settings.opacity}%</output></span></label>
        <h3 className="settings-group-title">数据与记录</h3>
        <label className="setting-row"><span><strong>显示已完成任务</strong><small>隐藏后任务仍保留在本地</small></span><input type="checkbox" checked={settings.showCompleted} onChange={(e) => update('showCompleted', e.target.checked)} /></label>
        {onRecords && <div className="setting-row"><span><strong>历史与仓库</strong><small>查看待办版本与跨日归档</small></span><button type="button" className="reset-button" onClick={onRecords}>打开</button></div>}
        {onCloud && <><h3 className="settings-group-title">同步与分享</h3>
          <div className="setting-row"><span><strong>云端连接</strong><small>管理分享链接和手机绑定</small></span><button type="button" className="reset-button" onClick={onCloud}>打开</button></div></>}
        {onImport && <><h3 className="settings-group-title">智能识别与提醒</h3>
          <div className="setting-row"><span><strong>导入信息</strong><small>识别待办并预览导入内容</small></span><button type="button" className="reset-button" onClick={onImport}>打开</button></div>
          <div className="setting-row"><span><strong>日程提醒</strong><small>在日程编辑中设置。程序运行或驻留托盘时可发送提醒，显示受 Windows 通知设置影响。</small></span></div></>}
      </div>
      <div className="modal-footer"><button type="button" className="reset-button" onClick={() => onChange({ ...defaultSettings })}>恢复默认设置</button><button type="button" className="done-button" onClick={onClose}>完成</button></div>
    </div>
  </div>;
}
