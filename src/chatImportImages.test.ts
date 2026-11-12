import { describe, expect, it } from 'vitest';
import { unpackChatImages, validateChatImages } from './chatImportImages';

describe('batch screenshots', () => {
  it('reads multiple native drag frames in order and rejects a truncated frame', async () => {
    const packet = Uint8Array.of(2, 0, 0, 0, 17, 18, 1, 0, 0, 0, 42);
    const files = unpackChatImages(packet.buffer);
    expect(await Promise.all(files.map(async file => [...new Uint8Array(await file.arrayBuffer())]))).toEqual([[17, 18], [42]]);
    expect(() => unpackChatImages(packet.slice(0, -1).buffer)).toThrow('截图数据不完整');
  });

  it('limits the number of queued files', () => {
    const file = new File(['image'], 'screenshot.png', { type: 'image/png' });
    expect(() => validateChatImages(Array(8).fill(file))).not.toThrow();
    expect(() => validateChatImages(Array(9).fill(file))).toThrow('每批最多添加 8 张截图');
  });
});
