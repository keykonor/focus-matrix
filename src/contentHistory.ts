import { invoke } from '@tauri-apps/api/core';
import type { DailyMemos, Task } from './types';

export interface HistoryContent { tasks: Task[]; dailyMemos: DailyMemos; }
export type HistoryReason = 'automatic' | 'manual' | 'before-restore' | 'initial' | 'update-backup';
export interface VersionSummary {
  id: string;
  createdAt: number;
  reason: HistoryReason;
  taskCount: number;
  pendingCount: number;
  completedCount: number;
  memoCount: number;
}
export interface ContentVersion {
  schemaVersion: number;
  id: string;
  createdAt: number;
  reason: HistoryReason;
  content: HistoryContent;
}
export interface VersionList { versions: VersionSummary[]; unreadableCount: number; }

export const historyReasonNames: Record<HistoryReason, string> = {
  automatic: '自动保存', manual: '手动保存', 'before-restore': '恢复前的内容', initial: '启动时的内容', 'update-backup': '更新前备份',
};
export function archiveContent(content: HistoryContent, reason: HistoryReason = 'automatic'): Promise<VersionSummary | null> {
  return invoke('save_content_version', { content, reason });
}
export function listVersions(): Promise<VersionList> { return invoke('list_content_versions'); }
export function getVersion(id: string): Promise<ContentVersion> { return invoke('get_content_version', { id }); }
