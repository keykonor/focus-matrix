export function findTaskLinks(text: string): { url: string; image: boolean }[] {
  const found = new Set<string>();
  const links: { url: string; image: boolean }[] = [];
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'，。！？；、（）【】]+/gi)) {
    const url = match[0].replace(/[.,!?;:]+$/, '');
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || found.has(url)) continue;
      found.add(url);
      links.push({ url, image: /\.(?:png|jpe?g|gif|webp|avif|bmp)$/i.test(parsed.pathname) });
    } catch { /* Ignore malformed text. */ }
  }
  return links;
}
