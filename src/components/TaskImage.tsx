import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function TaskImage({ id, onRemove }: { id: string; onRemove?: () => void }) {
  const [source, setSource] = useState('');
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let active = true, objectUrl = '';
    void invoke<number[]>('read_task_image', { id }).then(bytes => {
      if (!active) return;
      const type = bytes[0] === 137 ? 'image/png' : bytes[0] === 255 ? 'image/jpeg' : bytes[0] === 71 ? 'image/gif' : 'image/webp';
      objectUrl = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type }));
      setSource(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  return <span className="task-image">
    {failed ? <span role="status">图片无法读取，本地原文件仍保留</span> : source ?
      <button type="button" className="task-image-preview" onClick={() => setExpanded(true)} aria-label="预览图片"><img src={source} alt="任务图片" onError={() => setFailed(true)} /></button> : <span>正在读取图片…</span>}
    {onRemove && <button type="button" className="task-image-remove" onClick={onRemove} aria-label="移除图片">移除</button>}
    {expanded && <span className="image-overlay" role="dialog" aria-label="图片预览" aria-modal="true" onClick={() => setExpanded(false)}>
      <button type="button" className="image-overlay-close" aria-label="关闭图片预览" onClick={() => setExpanded(false)}>×</button><img src={source} alt="任务图片预览" />
    </span>}
  </span>;
}
