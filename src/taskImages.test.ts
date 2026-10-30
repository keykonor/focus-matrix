import { describe, expect, it } from 'vitest';
import { imageIds, visibleTaskText, withTaskImages } from './taskImages';

describe('local image references', () => {
  const id = 'a'.repeat(64);
  it('keeps local image references in task text and hides them from editing', () => {
    const stored = withTaskImages('整理材料\n明天', [id]);
    expect(imageIds(stored)).toEqual([id]);
    expect(visibleTaskText(stored)).toBe('整理材料\n明天');
    expect(withTaskImages('修改后', imageIds(stored))).toContain(id);
  });
  it('ignores malformed references and preserves ordinary text', () => {
    expect(imageIds('hello [图片:../secret]')).toEqual([]);
    expect(visibleTaskText('hello [图片:../secret]')).toBe('hello [图片:../secret]');
  });
});
