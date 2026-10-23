import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { saveWindowState, StateFlags } from '@tauri-apps/plugin-window-state';
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
import { openDataStore, saveData, type AppData, type LocalDataStore } from './storage';
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
  const [updating, setUpdating] = useState(false);
  const savingVersionRef = useRef(false);
  const storeRef = useRef<LocalDataStore | null>(null);
  const updatingRef = useRef(false);
  const rolloverGuard = useRef<string | null>(null);
  const dataRef = useRef<AppData>({ tasks, settings, dailyMemos, syncMarks, completedTasks, taskDay });
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);
  const restoringRef = useRef(false);
  const readyRef = useRef(false);
  const interactionRoot = useRef<HTMLDivElement>(null);
  const [interactionLocked, setInteractionLocked] = useState(true);
  const canEdit = useCallback(() => readyRef.current && !restoringRef.current && !updatingRef.current && !closingRef.current, []);
  const refreshInteractionLock = useCallback(() => {
    const locked = !canEdit();
    // Block native input immediately, before React renders the state change.
    if (interactionRoot.current) interactionRoot.current.inert = locked;
    setInteractionLocked(locked);
  }, [canEdit]);
  useLayoutEffect(() => { readyRef.current = ready; refreshInteractionLock(); }, [ready, refreshInteractionLock]);
  const protectInteraction = (event: SyntheticEvent) => {
    if (!canEdit()) { event.preventDefault(); event.stopPropagation(); }
  };
  dataRef.current = { tasks, settings, dailyMemos, syncMarks, completedTasks, taskDay };

  const flushSave = useCallback(async (forUpdate = false) => {
    if (restoringRef.current || (updatingRef.current && !forUpdate)) return false;
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const store = storeRef.current;
    if (!store) return false;
    const current = dataRef.current;
    const snapshot = forUpdate || rolloverGuard.current === localDateKey() ? current : rolloverCompletedTasks(current, localDateKey());
    const rollingOver = snapshot !== current;
    if (rollingOver) { restoringRef.current = true; refreshInteractionLock(); }
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
    finally { if (rollingOver) { restoringRef.current = false; refreshInteractionLock(); } }
  }, [refreshInteractionLock]);

  const readContent = useCallback(() => ({tasks:dataRef.current.tasks,dailyMemos:dataRef.current.dailyMemos}),[]);
  const applyCloud = useCallback(async (delivery:CloudDelivery) => {
    if (!canEdit()) throw Error('当前内容正在加载或保存，同步稍后重试');
    if(!(await flushSave())) throw Error('无法保存当前内容，同步稍后重试');
    if(!canEdit()) throw Error('当前内容正在加载或保存，同步稍后重试');
    const current=dataRef.current;
    const merged=mergeContent(delivery.sentContent,{tasks:current.tasks,dailyMemos:current.dailyMemos},delivery.snapshot.content);
    const next={...current,...merged.content,syncMarks:delivery.snapshot.marks};
    if(same(next,current))return;
    restoringRef.current=true;refreshInteractionLock();
    if(saveTimer.current){clearTimeout(saveTimer.current);saveTimer.current=null;}
    try {const store=storeRef.current;if(!store)throw Error('本地存储未就绪');
      const operation=saveQueue.current.catch(()=>undefined).then(()=>saveData(store,next));saveQueue.current=operation;await operation;
      dataRef.current=next;setTasks(next.tasks);setDailyMemos(next.dailyMemos);setSyncMarks(next.syncMarks);setSaveError(false);
    }catch(error){setSaveError(true);throw error;}finally{restoringRef.current=false;refreshInteractionLock();}
  },[flushSave,canEdit,refreshInteractionLock]);
  const cloud=useCloudSharing(ready && !updating,{flush:flushSave,read:readContent,apply:applyCloud});

  useEffect(() => {
    let active = true;
    openDataStore().then(({ store, data, guardDate }) => {
      if (!active) return;
      storeRef.current = store;
      rolloverGuard.current = guardDate;
      setTasks(data.tasks);
      setSettings(data.settings);
      setDailyMemos(data.dailyMemos);
      setSyncMarks(data.syncMarks??{});
      setCompletedTasks(data.completedTasks ?? []);
      setTaskDay(data.taskDay ?? '');
      setReady(true);
    }).catch((error) => { logError('无法打开本地数据', error); if (active) setSaveError(true); });
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
      if (rolloverGuard.current !== localDateKey() && (!day || day < localDateKey())) void flushSave();
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

  const closeApplication = useCallback(async (forceQuit = false) => {
    if (!readyRef.current || closingRef.current) return;
    closingRef.current = true; refreshInteractionLock();
    let exited = false;
    try {
      const nonce = await invoke<string | null>('read_update_request');
      if (nonce) { updatingRef.current = true; setUpdating(true); }
      if (!(await flushSave(Boolean(nonce)))) throw new Error('退出前保存失败');
      if (nonce) {
        await archiveContent(readContent(), 'update-backup');
        await saveWindowState(windowStateFlags);
        await invoke('finish_update_prepare', { nonce });
      } else await saveWindowState(windowStateFlags).catch((error) => logError('保存窗口状态失败', error));
      if (nonce || forceQuit || dataRef.current.settings.closeBehavior === 'quit') {
        await invoke('quit_app'); exited = true;
      } else await windowHandle.hide();
    } catch (error) {
      setSaveError(true); logError('保存退出失败，已保留当前内容', error);
      if (forceQuit) await windowHandle.show().catch((cause) => logError('显示窗口失败', cause));
    } finally {
      // A successful quit stays locked until the native process exits. Failure
      // and hide-to-tray both restore interaction, without releasing other locks.
      if (!exited) {
        updatingRef.current = false; setUpdating(false); closingRef.current = false;
        refreshInteractionLock();
      }
    }
  }, [flushSave, readContent, refreshInteractionLock]);

  useEffect(() => {
    if (!ready) return;
    let disposed = false;
    const unlisteners: UnlistenFn[] = [];
    const register = async () => {
      unlisteners.push(await windowHandle.onCloseRequested(async (event) => {
        event.preventDefault();
        await closeApplication();
      }));
      unlisteners.push(await listen('focus-matrix://open-settings', () => setSettingsOpen(true)));
      unlisteners.push(await listen('focus-matrix://quit-requested', () => {
        void closeApplication(true);
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
  }, [ready, closeApplication]);

  const addTask = (quadrant: QuadrantType, afterId?: string) => {
    if(!canEdit())return;
    const task = newTask(quadrant);
    setTasks((current) => {
      const index = afterId ? current.findIndex((item) => item.id === afterId) : -1;
      if (index < 0) return [...current, task];
      const next = [...current]; next.splice(index + 1, 0, task); return next;
    });
    setFocusId(task.id);
  };
  const updateTask = (id: string, patch: Partial<Pick<Task, 'text' | 'completed'>>) => {if(canEdit())setTasks((current) => current.map((task) => task.id === id ? changeTask(task, patch) : task));};
  const deleteTask = (id: string) => {if(canEdit())setTasks((current) => current.filter((task) => task.id !== id));};
  const moveTask = (id: string, quadrant: QuadrantType) => {if(canEdit())setTasks((current) => current.map((task) => task.id === id && task.quadrant !== quadrant ? changeTask(task, { quadrant }) : task));};
  const onSettingsChange = (next: AppSettings) => {if(canEdit())setSettings(next);};
  const updateMemo = (date: string, period: MemoPeriod, text: string) => {if(canEdit())setDailyMemos((current) => changeMemo(current, date, period, text));};
  const toggleCalendar = () => {if(canEdit())setSettings((current) => ({ ...current, calendarOpen: !current.calendarOpen }));};
  const openHistory = async () => { await flushSave(); setHistoryOpen(true); };
  const saveVersion = async () => {
    if (savingVersionRef.current || !canEdit()) throw new Error('正在保存或恢复，请稍后重试');
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
    if (!canEdit()) throw new Error('正在加载或保存，请稍后重试');
    if (!(await flushSave())) throw new Error('Current content could not be saved');
    if (!canEdit()) throw new Error('正在加载或保存，请稍后重试');
    const store = storeRef.current;
    if (!store) throw new Error('Data store is not ready');
    restoringRef.current = true; refreshInteractionLock();
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
    finally { restoringRef.current = false; refreshInteractionLock(); }
  };

  return <div className={`app font-${settings.fontSize}`} aria-busy={interactionLocked} style={{ '--surface-alpha': settings.opacity / 100 } as CSSProperties}>
    {saveNotice && <div className="save-notice" role="status">{saveNotice}</div>}
    {updating && <div className="save-error" role="status">正在保存当前完整版本并准备更新，请稍候…</div>}
    {saveError && <div className="save-error" role="alert">本地读取或保存失败，原文件和备份仍保留。请检查磁盘空间、文件权限或从更新备份恢复。</div>}
    <div ref={interactionRoot} inert={interactionLocked} aria-disabled={interactionLocked} style={{ display: 'contents' }}
      onBeforeInputCapture={protectInteraction} onInputCapture={protectInteraction} onChangeCapture={protectInteraction}
      onClickCapture={protectInteraction} onKeyDownCapture={protectInteraction} onDragStartCapture={protectInteraction} onDropCapture={protectInteraction}>
    <TitleBar onSettings={() => setSettingsOpen(true)} taskCount={tasks.filter((task) => !task.completed).length}
      today={today} calendarOpen={settings.calendarOpen} onCalendar={toggleCalendar} onCompleted={() => setCompletedOpen(true)} onSave={() => void saveFromMain()} saving={savingVersion} onHistory={() => void openHistory()} onCloud={() => {setCloudSection('share');setCloudOpen(true);}} onPhone={() => {setCloudSection('phone');setCloudOpen(true);}} cloudError={!!cloud.status.error} disabled={interactionLocked} />
    {settings.calendarOpen ? <CalendarPanel today={today} memos={dailyMemos} marks={syncMarks} onChange={updateMemo} onClose={toggleCalendar} /> : <main className="matrix" aria-label="艾森豪威尔任务矩阵">
      {quadrants.map((quadrant) => <Quadrant key={quadrant} quadrant={quadrant} marks={syncMarks} tasks={tasks.filter((task) => task.quadrant === quadrant && (settings.showCompleted || !task.completed))} focusId={focusId} fontSize={settings.fontSize} onAdd={addTask} onChange={updateTask} onDelete={deleteTask} onMove={moveTask} />)}
    </main>}
    {settingsOpen && <SettingsModal settings={settings} onChange={onSettingsChange} onClose={() => setSettingsOpen(false)} />}
    {historyOpen && <HistoryModal onClose={() => setHistoryOpen(false)} onSaveVersion={saveVersion} onRestore={restoreVersion} />}
    {completedOpen && <CompletedTasksModal records={completedTasks} onClose={() => setCompletedOpen(false)} />}
    {cloudOpen && <CloudShareModal initialSection={cloudSection} status={cloud.status} busy={cloud.busy} onClose={() => setCloudOpen(false)} onSync={cloud.sync} onToggle={cloud.toggle} onEditing={cloud.editing} onRotate={cloud.rotate} />}
    </div>
  </div>;
}
