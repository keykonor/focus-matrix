import { describe, expect, it } from 'vitest';
import { findTaskLinks, linkAt } from './taskLinks';

describe('task links', () => {
  it('extracts web links without trailing punctuation or unsafe schemes', () => {
    expect(findTaskLinks('查看 https://example.com/plan。 javascript:alert(1) https://example.org/a.png')).toEqual([
      { url: 'https://example.com/plan', image: false },
      { url: 'https://example.org/a.png', image: true },
    ]);
  });
  it('recognizes image URLs with query strings and removes duplicates', () => {
    expect(findTaskLinks('https://example.org/a.jpg?v=1 https://example.org/a.jpg?v=1')).toEqual([
      { url: 'https://example.org/a.jpg?v=1', image: true },
    ]);
  });
  it('resolves a clicked offset inside a URL and leaves surrounding text editable', () => {
    const text = '看这里 https://example.com/plan。 结束';
    const start = text.indexOf('https');
    expect(linkAt(text, start)).toBe('https://example.com/plan');
    expect(linkAt(text, start + 12)).toBe('https://example.com/plan');
    expect(linkAt(text, start + 'https://example.com/plan'.length - 1)).toBe('https://example.com/plan');
    expect(linkAt(text, start - 1)).toBeNull();
    expect(linkAt(text, start + 'https://example.com/plan'.length)).toBeNull();
  });
  it('opens repeated URLs at every occurrence and rejects unsafe or out-of-range offsets', () => {
    const text = 'https://example.com/a https://example.com/a https://user:pw@example.com/b';
    const first = 0;
    const second = text.indexOf('https', first + 1);
    expect(linkAt(text, second + 5)).toBe('https://example.com/a');
    expect(linkAt(text, text.indexOf('https://user') + 5)).toBeNull();
    expect(linkAt(text, -1)).toBeNull();
    expect(linkAt(text, text.length + 1)).toBeNull();
  });
});
