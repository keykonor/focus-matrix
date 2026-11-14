import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CompletedTaskRecord } from '../completedTasks';
import type { ContentVersion } from '../contentHistory';
import { CompletedTasksModal } from './CompletedTasksModal';
import { HistoryModal } from './HistoryModal';

type Section = 'history' | 'completed';

interface Props {
  records: CompletedTaskRecord[];
  onClose: () => void;
  onSaveVersion: () => Promise<void>;
  onRestore: (version: ContentVersion) => Promise<void>;
  initialSection?: Section;
}

export function RecordsModal({ records, onClose, onSaveVersion, onRestore, initialSection = 'history' }: Props) {
  const [section, setSection] = useState<Section>(initialSection);
  const trigger = useRef(document.activeElement);
  const tabs = useRef<HTMLElement>(null);
  const focusTab = useRef(false);
  useLayoutEffect(() => {
    const element = trigger.current;
    return () => { if (element instanceof HTMLElement) element.focus(); };
  }, []);
  useEffect(() => {
    if (focusTab.current) tabs.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
    focusTab.current = false;
  }, [section]);
  const select = (next: Section) => {
    if (next === section) return;
    focusTab.current = true;
    setSection(next);
  };
  const navigation = (disabled = false) => <nav ref={tabs} className="cloud-tabs records-tabs" aria-label="记录类型">
    <button type="button" disabled={disabled} aria-pressed={section === 'history'} onClick={() => select('history')}>待办历史</button>
    <button type="button" disabled={disabled} aria-pressed={section === 'completed'} onClick={() => select('completed')}>已完成仓库</button>
  </nav>;

  return section === 'history'
    ? <HistoryModal onClose={onClose} onSaveVersion={onSaveVersion} onRestore={onRestore} navigation={navigation} />
    : <CompletedTasksModal records={records} onClose={onClose} navigation={navigation()} />;
}
