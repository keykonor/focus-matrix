import { useEffect, useRef } from 'react';
import { defaultSettings, type AppSettings } from '../types';

interface Props {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onClose: () => void;
}

export function SettingsModal({ settings, onChange, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => onChange({
    ...settings,
    [key]: value,
    ...(key === 'desktopMode' && value === true ? { alwaysOnTop: false } : {}),
    ...(key === 'alwaysOnTop' && value === true ? { desktopMode: false } : {}),
  });
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabIndex={-1} ref={dialogRef}>
      <div className="modal-header"><h2 id="settings-title">设置</h2><button type="button" onClick={onClose} aria-label="关闭设置">×</button></div>
      <div className="settings-list">
        <label className="setting-row"><span><strong>开机启动</strong><small>登录 Windows 后自动打开</small></span><input type="checkbox" checked={settings.autostart} onChange={(e) => update('autostart', e.target.checked)} /></label>
        <label className="setting-row"><span><strong>桌面底层</strong><small>工作时让其他窗口盖在便笺上方</small></span><input type="checkbox" checked={settings.desktopMode} onChange={(e) => update('desktopMode', e.target.checked)} /></label>
        <label className="setting-row"><span><strong>始终置顶</strong><small>让矩阵保持在其他窗口上方</small></span><input type="checkbox" checked={settings.alwaysOnTop} onChange={(e) => update('alwaysOnTop', e.target.checked)} /></label>
        <label className="setting-row"><span><strong>关闭按钮行为</strong><small>点击窗口右上角 × 时</small></span><select value={settings.closeBehavior} onChange={(e) => update('closeBehavior', e.target.value as AppSettings['closeBehavior'])}><option value="tray">隐藏到托盘</option><option value="quit">直接退出</option></select></label>
        <label className="setting-row"><span><strong>字体大小</strong><small>调整任务文字</small></span><select value={settings.fontSize} onChange={(e) => update('fontSize', e.target.value as AppSettings['fontSize'])}><option value="small">小</option><option value="medium">中</option><option value="large">大</option></select></label>
        <label className="setting-row"><span><strong>界面透明度</strong><small>Windows 桌面透出程度</small></span><span className="range-control"><input type="range" min="80" max="100" step="1" value={settings.opacity} onChange={(e) => update('opacity', Number(e.target.value))} /><output>{settings.opacity}%</output></span></label>
        <label className="setting-row"><span><strong>显示已完成任务</strong><small>隐藏后任务仍保留在本地</small></span><input type="checkbox" checked={settings.showCompleted} onChange={(e) => update('showCompleted', e.target.checked)} /></label>
      </div>
      <div className="modal-footer"><button type="button" className="reset-button" onClick={() => onChange({ ...defaultSettings })}>恢复默认设置</button><button type="button" className="done-button" onClick={onClose}>完成</button></div>
    </div>
  </div>;
}
