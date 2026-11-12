import { describe, expect, it } from 'vitest';
import { appendChatLine, confirmChatEntry, removeChatLine } from './chatImport';

describe('chat import', () => {
  it('only confirms complete calendar entries and retains the precise time', () => {
    expect(confirmChatEntry({ date: '2026-11-13', text: '待安排' })).toBeUndefined();
    expect(confirmChatEntry({ date: '2026-02-30', period: 'afternoon', text: '日期无效' })).toBeUndefined();
    expect(confirmChatEntry({ date: '2026-11-13', period: 'afternoon', hour: 15, minute: 30, text: '开会' })).toEqual({
      date: '2026-11-13', period: 'afternoon', hour: 15, text: '15:30 开会',
    });
  });

  it('appends once and removes only the exact imported line', () => {
    const initial = '既有事项\n';
    const saved = appendChatLine(initial, '开会');
    expect(saved).toBe('既有事项\n开会');
    expect(appendChatLine(saved, '开会')).toBe(saved);
    expect(removeChatLine(saved + '\n之后的编辑', '开会')).toBe('既有事项\n之后的编辑');
    expect(removeChatLine('开会（已修改）', '开会')).toBe('开会（已修改）');
  });
});
