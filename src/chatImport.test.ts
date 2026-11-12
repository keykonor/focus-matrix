import { describe, expect, it } from 'vitest';
import { appendChatLine, confirmChatEntry, parseChatImport, removeChatLine } from './chatImport';

describe('chat import', () => {
  it('anchors relative dates to a chat date and preserves exact minutes', () => {
    expect(parseChatImport('2026年11月12日 09:15\n明天下午三点半开会\n昨晚已提交材料', '2026-11-20')).toEqual([
      { date: '2026-11-13', period: 'afternoon', hour: 15, minute: 30, text: '明天下午三点半开会' },
      { date: '2026-11-11', period: 'evening', text: '昨晚已提交材料' },
    ]);
  });

  it('keeps ambiguous dates and times unresolved in preview', () => {
    expect(parseChatImport('这两天把图改一下\n4点改方案\n好的', '2026-11-12')).toEqual([
      { text: '这两天把图改一下' },
      { text: '4点改方案' },
    ]);
  });

  it('uses the selected day as the fallback reference for relative expressions', () => {
    expect(parseChatImport('下周一上午九点开会\n明天交材料\n11月18日 14:25 评审', '2026-11-12')).toEqual([
      { date: '2026-11-16', period: 'morning', hour: 9, minute: 0, text: '下周一上午九点开会' },
      { date: '2026-11-13', text: '明天交材料' },
      { date: '2026-11-18', period: 'afternoon', hour: 14, minute: 25, text: '11月18日 14:25 评审' },
    ]);
  });

  it('uses the visible chat date for later messages and recognizes other months', () => {
    expect(parseChatImport('11月8日 09:20\n下午开会\n下个月5号上午交材料', '2026-11-12')).toEqual([
      { date: '2026-11-08', period: 'afternoon', text: '下午开会' },
      { date: '2026-12-05', period: 'morning', text: '下个月5号上午交材料' },
    ]);
  });

  it('only confirms complete calendar entries and retains the precise time', () => {
    expect(confirmChatEntry({ date: '2026-11-13', text: '待安排' })).toBeUndefined();
    expect(confirmChatEntry({ date: '2026-02-30', period: 'afternoon', text: '日期无效' })).toBeUndefined();
    expect(confirmChatEntry({ date: '2026-11-13', period: 'afternoon', hour: 15, minute: 30, text: '开会' })).toEqual({
      date: '2026-11-13', period: 'afternoon', hour: 15, text: '15:30 开会',
    });
  });

  it('normalizes spaces inserted by screenshot OCR', () => {
    expect(parseChatImport('明 天 下 午 开 会', '2026-11-12')).toEqual([
      { date: '2026-11-13', period: 'afternoon', text: '明天下午开会' },
    ]);
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
