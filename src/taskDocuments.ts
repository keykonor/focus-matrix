import { suffix } from './taskImages';
export interface TaskDocument { id: string; name: string; }
export function taskDocuments(text: string): TaskDocument[] {
  return [...(text.match(suffix)?.[0] ?? '').matchAll(/\[FocusMatrix文档:([a-f0-9]{64}\.[a-z0-9]+):([^\]\r\n]+)\]/g)].flatMap(match => {
    try { return [{ id: match[1], name: decodeURIComponent(match[2]) }]; } catch { return []; }
  });
}
export function withDocuments(text: string, documents: TaskDocument[]): string {
  return text + documents.map(doc => `\n[FocusMatrix文档:${doc.id}:${encodeURIComponent(doc.name)}]`).join('');
}
