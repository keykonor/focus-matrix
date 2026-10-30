import { describe, expect, it } from 'vitest';
import { findTaskLinks } from './taskLinks';

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
});
