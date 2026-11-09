const linkPattern = /https?:\/\/[^\s<>"'，。！？；、（）【】]+/gi;

function safeUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed;
  } catch { return null; }
}

export function findTaskLinks(text: string): { url: string; image: boolean }[] {
  const found = new Set<string>();
  const links: { url: string; image: boolean }[] = [];
  for (const match of text.matchAll(linkPattern)) {
    const url = match[0].replace(/[.,!?;:]+$/, '');
    const parsed = safeUrl(url);
    if (!parsed || found.has(url)) continue;
    found.add(url);
    links.push({ url, image: /\.(?:png|jpe?g|gif|webp|avif|bmp)$/i.test(parsed.pathname) });
  }
  return links;
}

/**
 * 返回文本偏移处所属的网址，用于「点击输入框里的网址直接打开」。
 * 与 findTaskLinks 不同，这里保留重复链接，因为每一处网址都应该可以点开。
 */
export function linkAt(text: string, offset: number): string | null {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) return null;
  for (const match of text.matchAll(linkPattern)) {
    const url = match[0].replace(/[.,!?;:]+$/, '');
    const start = match.index ?? 0;
    const end = start + url.length;
    // offset === end 表示光标在网址之后，留给正常编辑，不打开链接。
    if (offset < start || offset >= end) continue;
    if (safeUrl(url)) return url;
  }
  return null;
}

/**
 * 单击输入框时判断是否点在网址上。存在选区（拖选文字）时返回 null，
 * 保证用户仍能选中、修改网址，不会被打开浏览器打断。
 */
export function linkFromSelection(text: string, input: HTMLTextAreaElement): string | null {
  if (input.selectionStart !== input.selectionEnd) return null;
  return linkAt(text, input.selectionStart);
}
