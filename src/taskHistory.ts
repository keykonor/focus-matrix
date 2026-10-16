import type {HistoryContent, VersionSummary} from './contentHistory';

export function restoreTaskContent(current: HistoryContent, saved: HistoryContent): HistoryContent {
  return {tasks: saved.tasks, dailyMemos: current.dailyMemos};
}

export function groupTaskVersions(versions: VersionSummary[]) {
  const sorted = [...versions].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  const groups: {date: string; versions: VersionSummary[]}[] = [];
  for (const version of sorted) {
    const time = new Date(version.createdAt);
    const date = `${time.getFullYear()}-${String(time.getMonth() + 1).padStart(2, '0')}-${String(time.getDate()).padStart(2, '0')}`;
    const last = groups.at(-1);
    if (last?.date === date) last.versions.push(version);
    else groups.push({date, versions: [version]});
  }
  return groups;
}
