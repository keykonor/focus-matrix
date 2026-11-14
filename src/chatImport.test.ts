import { describe, expect, it } from 'vitest';
import { appendChatLine, chatEntryFingerprint, confirmChatEntry, planChatLayouts, removeChatLine } from './chatImport';
import { defaultMemoSchedule } from './memoSchedule';

describe('chat import', () => {
  it('only confirms complete calendar entries and retains the precise time', () => {
    expect(confirmChatEntry({ date: '2026-11-13', text: '待安排' })).toBeUndefined();
    expect(confirmChatEntry({ date: '2026-02-30', period: 'afternoon', text: '日期无效' })).toBeUndefined();
    expect(confirmChatEntry({ date: '2026-11-13', period: 'afternoon', hour: 15, minute: 30, text: '开会' })).toEqual({
      date: '2026-11-13', period: 'afternoon', hour: 15, text: '15:30 开会', description: '开会', startTime: '15:30',
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

  it('uses the selected output mode without losing the draft clock time', () => {
    const draft = { date: '2026-11-13', period: 'afternoon' as const, hour: 14, minute: 30,
      endTime: '16:00', text: '开会' };
    const period = confirmChatEntry({ ...draft, timeMode: 'periods' });
    const hourly = confirmChatEntry({ ...draft, timeMode: 'hourly' });
    expect(period).toEqual({ date: '2026-11-13', period: 'afternoon', text: '开会',
      description: '开会', startTime: '14:30', endTime: '16:00' });
    expect(hourly).toEqual({ date: '2026-11-13', period: 'afternoon', hour: 14, text: '14:30–16:00 开会',
      description: '开会', startTime: '14:30', endTime: '16:00' });
    expect(chatEntryFingerprint(period!)).toBe(chatEntryFingerprint(hourly!));
    expect(planChatLayouts([period!], undefined, {})['2026-11-13'].suggested).toBe('periods');
  });

  it('requires a valid clock time in 24-hour mode and derives the corresponding period', () => {
    const draft = { date: '2026-11-13', timeMode: 'hourly' as const, text: '交材料', deadline: true };
    expect(confirmChatEntry({ ...draft, period: 'afternoon' })).toBeUndefined();
    expect(confirmChatEntry({ ...draft, hour: 24, minute: 0 })).toBeUndefined();
    expect(confirmChatEntry({ ...draft, hour: 9, minute: 36 })).toEqual({
      date: '2026-11-13', period: 'morning', hour: 9, text: '09:36 前 交材料',
      description: '交材料', startTime: '09:36', deadline: true,
    });
  });

  it('chooses a layout per date and reports both kinds of conflict', () => {
    const plans = planChatLayouts([
      { date: '2026-11-13', period: 'afternoon', text: '讨论' },
      { date: '2026-11-14', period: 'afternoon', hour: 14, text: '14:00 开会' },
      { date: '2026-11-15', period: 'afternoon', text: '整理' },
      { date: '2026-11-15', period: 'evening', hour: 19, text: '19:30 上课' },
      { date: '2026-11-16', period: 'morning', text: '准备' },
    ], { '2026-11-16': { ...defaultMemoSchedule, mode: 'hourly' } }, {});
    expect(plans['2026-11-13']).toEqual({ suggested: 'periods', conflict: false });
    expect(plans['2026-11-14']).toEqual({ suggested: 'hourly', conflict: false });
    expect(plans['2026-11-15']).toEqual({ suggested: 'hourly', conflict: true });
    expect(plans['2026-11-16']).toEqual({ suggested: 'periods', existing: 'hourly', conflict: true });
  });
});
