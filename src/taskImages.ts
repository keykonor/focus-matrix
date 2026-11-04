export const suffix = /(?:\n\[FocusMatrix(?:图片:[a-f0-9]{64}|文档:[a-f0-9]{64}\.[a-z0-9]+:[^\]\r\n]+)\])+$/;
const marker = /\[FocusMatrix图片:([a-f0-9]{64})\]/g;
let pendingImages = 0;
export function beginImageSave(): void { pendingImages++; }
export function endImageSave(): void { pendingImages = Math.max(0, pendingImages - 1); }
export function hasPendingImages(): boolean { return pendingImages > 0; }
export function imageIds(text: string): string[] {
  const tail = text.match(suffix)?.[0] ?? '';
  return [...tail.matchAll(marker)].map(match => match[1]);
}
export function visibleTaskText(text: string): string { return text.replace(suffix, ''); }
export function withTaskImages(text: string, ids: string[]): string {
  return text + ids.filter(id => /^[a-f0-9]{64}$/.test(id)).map(id => `\n[FocusMatrix图片:${id}]`).join('');
}
