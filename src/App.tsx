import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { saveWindowState, StateFlags } from '@tauri-apps/plugin-window-state';
import type { Store } from '@tauri-apps/plugin-store';
import { Quadrant } from './components/Quadrant';
import { SettingsModal } from './components/SettingsModal';
import { TitleBar } from './components/TitleBar';
import { CalendarPanel } from './components/CalendarPanel';
import { HistoryModal } from './components/HistoryModal';
import { CompletedTasksModal } from './components/CompletedTasksModal';
import { rolloverCompletedTasks, type CompletedTaskRecord } from './completedTasks';
import { CloudShareModal } from './components/CloudShareModal';
import { useCloudSharing, type CloudDelivery } from './hooks/useCloudSharing';
import { mergeContent,same,type EditMark } from '../cloud-site/lib/syncModel';
import { archiveContent, type ContentVersion } from './contentHistory';
import { restoreTaskContent } from './taskHistory';
import { changeMemo, localDateKey } from './calendarModel';
import { useToday } from './hooks/useToday';
import { changeTask, newTask } from './taskModel';
import { openDataStore, saveData, type AppData } from './storage';
import { defaultSettings, quadrants, type AppSettings, type DailyMemos, type MemoPeriod, type QuadrantType, type Task } from './types';

const windowHandle = getCurrentWindow();
const windowStateFlags = StateFlags.POSITION | StateFlags.SIZE | StateFlags.MAXIMIZED;

function logError(message: string, error: unknown) {
  if (import.meta.env.DEV) console.error(message, error);
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [dailyMemos, setDailyMemos] = useState<DailyMemos>({});
  const [completedTasks, setCompletedTasks] = useState<CompletedTaskRecord[]>([]);
  const [taskDay, setTaskDay] = useState('');
  const today = useToday();
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [cloudSection,setCloudSection] = useState<'share'|'phone'>('share');
  const [syncMarks,setSyncMarks] = useState<Record<string,EditMark>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const savingVersionRef = useRef(false);
  const storeRef = useRef<Store | null>(null);
  const dataRef = useRef<AppData>({ tasks, settings, dailyMemos, syncMarks, completedTasks, taskDay });
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);
  const restoringRef = useRef(false);
  dataRef.current = { tasks, settings, dailyMemos, syncMarks, completedTasks, taskDay };

  const flushSave = useCallback(async () => {
    if (restoringRef.current) return false;
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const store = storeRef.current;
    if (!store) return false;
    const current = dataRef.current;
    const snapshot = rolloverCompletedTasks(current, localDateKey());
    const rollingOver = snapshot !== current;
    if (rollingOver) restoringRef.current = true;
    const next = saveQueue.current.catch(() => undefined).then(() => saveData(store, snapshot));
    saveQueue.current = next;
    try {
      await next;
      if (rollingOver) {
        dataRef.current = snapshot;
        setTasks(snapshot.tasks); setCompletedTasks(snapshot.completedTasks ?? []); setTaskDay(snapshot.taskDay ?? '');
        const moved = current.tasks.length - snapshot.tasks.length;
        if (moved > 0) { setFocusId(null); setSaveNotice(`已将 ${moved} 项已完成任务移入仓库`); }
      }
      setSaveError(false); return true;
    }
    catch (error) { setSaveError(true); logError('自动保存失败', error); return false; }
    finally { if (rollingOver) restoringRef.current = false; }
  }, []);

  const readContent = useCallback(() => ({tasks:dataRef.current.tasks,dailyMemos:dataRef.current.dailyMemos}),[]);
  const applyCloud = useCallback(async (delivery:CloudDelivery) => {
    if(!(await flushSave())) throw Error('无法保存当前内容，同步稍后重试');
    if(restoringRef.current) throw Error('正在恢复版本，同步稍后重试');
    const current=dataRef.current;
    const merged=mergeContent(delivery.sentContent,{tasks:current.tasks,dailyMemos:current.dailyMemos},delivery.snapshot.content);
    const next={...current,...merged.content,syncMarks:delivery.snapshot.marks};
    if(same(next,current))return;
    restoringRef.current=true;
    if(saveTimer.current){clearTimeout(saveTimer.current);saveTimer.current=null;}
    try {const store=storeRef.current;if(!store)throw Error('本地存储未就绪');
      const operation=saveQueue.current.catch(()=>undefined).then(()=>saveData(store,next));saveQueue.current=operation;await operation;
      dataRef.current=next;setTasks(next.tasks);setDailyMemos(next.dailyMemos);setSyncMarks(next.syncMarks);setSaveError(false);
    }catch(error){setSaveError(true);throw error;}finally{restoringRef.current=false;}
  },[flushSave]);
  const cloud=useCloudSharing(ready,{flush:flushSave,read:readContent,apply:applyCloud});

  useEffect(() => {
    let active = true;
    openDataStore().then(({ store, data }) => {
      if (!active) return;
      storeRef.current = store;
      setTasks(data.tasks);
      setSettings(data.settings);
      setDailyMemos(data.dailyMemos);
      setSyncMarks(data.syncMarks??{});
      setCompletedTasks(data.completedTasks ?? []);
      setTaskDay(data.taskDay ?? '');
      setReady(true);
    }).catch((error) => { logError('无法打开本地数据', error); if (active) { setSaveError(true); setReady(true); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready || restoringRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flushSave(); }, 400);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [tasks, settings, dailyMemos, ready, flushSave]);

  useEffect(() => {
    if (!ready) return;
    const checkDay = () => {
      const day = dataRef.current.taskDay;
      if (!day || day < localDateKey()) void flushSave();
    };
    checkDay();
    // Also retry failed writes, and recheck when a sleeping/hidden app wakes up.
    const retry = window.setInterval(checkDay, 30_000);
    window.addEventListener('focus', checkDay);
    document.addEventListener('visibilitychange', checkDay);
    return () => { window.clearInterval(retry); window.removeEventListener('focus', checkDay); document.removeEventListener('visibilitychange', checkDay); };
  }, [today, ready, flushSave]);

  useEffect(() => {
    if (!ready) return;
    void (async () => {
      await windowHandle.setAlwaysOnTop(false);
      await invoke('set_desktop_layer', { enabled: settings.desktopMode && !settings.alwaysOnTop });
      if (settings.alwaysOnTop) await windowHandle.setAlwaysOnTop(true);
    })().catch((error) => logError('设置窗口层级失败', error));
    // A development executable depends on Vite and must not be registered at login.
    if (import.meta.env.DEV) return;
    isEnabled().then((enabled) => {
      if (enabled !== settings.autostart) return settings.autostart ? enable() : disable();
    }).catch((error) => logError('设置开机启动失败', error));
  }, [settings.alwaysOnTop, settings.desktopMode, settings.autostart, ready]);

  useEffect(() => {
    if (!ready) return;
    let disposed = false;
    const unlisteners: UnlistenFn[] = [];
    const register = async () => {
      unlisteners.push(await windowHandle.onCloseRequested(async (event) => {
        event.preventDefault();
        if (closingRef.current) return;
        closingRef.current = true;
        if (!(await flushSave())) { closingRef.current = false; return; }
        if (dataRef.current.settings.closeBehavior === 'quit') {
          await saveWindowState(windowStateFlags).catch((error) => logError('保存窗口状态失败', error));
          await invoke('quit_app');
        } else {
          await windowHandle.hide().catch((error) => logError('隐藏窗口失败', error));
        }
        closingRef.current = false;
      }));
      unlisteners.push(await listen('focus-matrix://open-settings', () => setSettingsOpen(true)));
      unlisteners.push(await listen('focus-matrix://quit-requested', () => {
        void (async () => {
          if (!(await flushSave())) { await windowHandle.show(); return; }
          await saveWindowState(windowStateFlags).catch((error) => logError('保存窗口状态失败', error));
          await invoke('quit_app');
        })();
      }));
      let windowTimer: ReturnType<typeof setTimeout> | null = null;
      const queueWindowSave = () => {
        if (windowTimer) clearTimeout(windowTimer);
        windowTimer = setTimeout(() => { void saveWindowState(windowStateFlags).catch((error) => logError('保存窗口状态失败', error)); }, 600);
      };
      unlisteners.push(await windowHandle.onMoved(queueWindowSave));
      unlisteners.push(await windowHandle.onResized(queueWindowSave));
      if (disposed) { unlisteners.forEach((fn) => fn()); }
    };
    void register().catch((error) => logError('窗口事件注册失败', error));
    return () => { disposed = true; unlisteners.forEach((fn) => fn()); };
  }, [ready, flushSave]);

  const addTask = (quadrant: QuadrantType, afterId?: string) => {
    if(restoringRef.current)return;
    const task = newTask(quadrant);
    setTasks((current) => {
      const index = afterId ? current.findIndex((item) => item.id === afterId) : -1;
      if (index < 0) return [...current, task];
      const next = [...current]; next.splice(index + 1, 0, task); return next;
    });
    setFocusId(task.id);
  };
  const updateTask = (id: string, patch: Partial<Pick<Task, 'text' | 'completed'>>) => {if(!restoringRef.current)setTasks((current) => current.map((task) => task.id === id ? changeTask(task, patch) : task));};
  const deleteTask = (id: string) => {if(!restoringRef.current)setTasks((current) => current.filter((task) => task.id !== id));};
  const moveTask = (id: string, quadrant: QuadrantType) => {if(!restoringRef.current)setTasks((current) => current.map((task) => task.id === id && task.quadrant !== quadrant ? changeTask(task, { quadrant }) : task));};
  const onSettingsChange = (next: AppSettings) => {if(!restoringRef.current)setSettings(next);};
  const updateMemo = (date: string, period: MemoPeriod, text: string) => {if(!restoringRef.current)setDailyMemos((current) => changeMemo(current, date, period, text));};
  const toggleCalendar = () => {if(!restoringRef.current)setSettings((current) => ({ ...current, calendarOpen: !current.calendarOpen }));};
  const openHistory = async () => { await flushSave(); setHistoryOpen(true); };
  const saveVersion = async () => {
    if (savingVersionRef.current || restoringRef.current) throw new Error('正在保存或恢复，请稍后重试');
    savingVersionRef.current = true; setSavingVersion(true);
    try {
      if (!(await flushSave())) throw new Error('Current content could not be saved');
      await archiveContent({ tasks: dataRef.current.tasks, dailyMemos: dataRef.current.dailyMemos }, 'manual');
    } finally { savingVersionRef.current = false; setSavingVersion(false); }
  };
  const saveFromMain = async () => {
    setSaveNotice('');
    try { await saveVersion(); setSaveNotice('待办已保存，可在历史中查看和恢复'); }
    catch (error) { setSaveError(true); logError('手动保存待办失败', error); }
  };
  useEffect(() => {
    if (!saveNotice) return;
    const timer = setTimeout(() => setSaveNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [saveNotice]);
  const restoreVersion = async (version: ContentVersion) => {
    if (!(await flushSave())) throw new Error('Current content could not be saved');
    const store = storeRef.current;
    if (!store) throw new Error('Data store is not ready');
    restoringRef.current = true;
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const current = { ...dataRef.current };
    const restored = { ...current, ...restoreTaskContent(current, version.content) };
    const operation = saveQueue.current.catch(() => undefined).then(async () => {
      await archiveContent({ tasks: current.tasks, dailyMemos: current.dailyMemos }, 'before-restore');
      await saveData(store, restored);
    });
    saveQueue.current = operation;
    try {
      await operation;
      dataRef.current = restored;
      setTasks(restored.tasks); setFocusId(null); setSaveError(false);
    } catch (error) { setSaveError(true); throw error; }
    finally { restoringRef.current = false; }
  };

  return <div className={`app font-${settings.fontSize}`} style={{ '--surface-alpha': settings.opacity / 100 } as CSSProperties}>
    <TitleBar onSettings={() => setSettingsOpen(true)} taskCount={tasks.filter((task) => !task.completed).length}
      today={today} calendarOpen={settings.calendarOpen} onCalendar={toggleCalendar} onCompleted={() => setCompletedOpen(true)} onSave={() => void saveFromMain()} saving={savingVersion} onHistory={() => void openHistory()} onCloud={() => {setCloudSection('share');setCloudOpen(true);}} onPhone={() => {setCloudSection('phone');setCloudOpen(true);}} cloudError={!!cloud.status.error} disabled={!ready} />
    {saveNotice && <div className="save-notice" role="status">{saveNotice}</div>}
    {saveError && <div className="save-error" role="alert">本地保存失败。请检查磁盘空间或文件权限；下一次修改时会重试。</div>}
    {settings.calendarOpen ? <CalendarPanel today={today} memos={dailyMemos} marks={syncMarks} onChange={updateMemo} onClose={toggleCalendar} /> : <main className="matrix" aria-label="艾森豪威尔任务矩阵">
      {quadrants.map((quadrant) => <Quadrant key={quadrant} quadrant={quadrant} marks={syncMarks} tasks={tasks.filter((task) => task.quadrant === quadrant && (settings.showCompleted || !task.completed))} focusId={focusId} fontSize={settings.fontSize} onAdd={addTask} onChange={updateTask} onDelete={deleteTask} onMove={moveTask} />)}
    </main>}
    {settingsOpen && <SettingsModal settings={settings} onChange={onSettingsChange} onClose={() => setSettingsOpen(false)} />}
    {historyOpen && <HistoryModal onClose={() => setHistoryOpen(false)} onSaveVersion={saveVersion} onRestore={restoreVersion} />}
    {completedOpen && <CompletedTasksModal records={completedTasks} onClose={() => setCompletedOpen(false)} />}
    {cloudOpen && <CloudShareModal initialSection={cloudSection} status={cloud.status} busy={cloud.busy} onClose={() => setCloudOpen(false)} onSync={cloud.sync} onToggle={cloud.toggle} onEditing={cloud.editing} onRotate={cloud.rotate} />}
  </div>;
}
