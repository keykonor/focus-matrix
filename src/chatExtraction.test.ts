import { describe, expect, it } from 'vitest';
import { buildChatExtractionInput, previewChatEvents } from './chatExtraction';
import { confirmChatEntry } from './chatImport';

describe('local model chat extraction', () => {
  it('provides real calendar dates for relative weekdays', () => {
    const input = buildChatExtractionInput('周一中午12点前填表', '2026-11-12');
    expect(input).toContain('2026-11-16（周一）');
    expect(input).toContain('2026-11-20（周五）');
    expect(input).toContain('周一中午12点前填表');
  });

  it('keeps the course range, venue and preparation, and a separate form deadline', () => {
    const source = '11.20（下周五）仁爱集团上课，13:30-17:00，上课地点：仁爱团泊湖接待中心。周一中午\n12:00前填表。';
    const preview = previewChatEvents(JSON.stringify({ events: [
      { kind: 'event', title: '创业实战课第4讲', date: '2026-11-20', time: '13:30', end: '17:00',
        location: '仁爱集团（仁爱团泊湖接待中心）', address: '天津市某路8号', preparation: '' },
      { kind: 'deadline', title: '填写大巴通勤和晚餐统计表', date: '2026-11-18', time: '12:00', end: '',
        location: '', address: '', preparation: '按实际情况填报，特殊过敏或忌口请备注' },
    ] }), source, '2026-11-12');
    expect(preview.map(confirmChatEntry)).toEqual([
      { date: '2026-11-20', period: 'afternoon', hour: 13,
        text: '13:30–17:00 创业实战课第4讲 · 地点 仁爱集团（仁爱团泊湖接待中心）' },
      { date: '2026-11-16', period: 'afternoon', hour: 12,
        text: '12:00 前 填写大巴通勤和晚餐统计表 · 准备 按实际情况填报，特殊过敏或忌口请备注' },
    ]);
  });

  it('leaves invalid dates and times unassigned and keeps a quoted address', () => {
    const [entry] = previewChatEvents(JSON.stringify({ events: [
      { kind: 'event', title: '会议', date: '2026-02-30', time: '25:00', end: '',
        location: '会客厅', address: '和平路 8 号', preparation: '' },
    ] }), '地址：和平路8号，会客厅');
    expect(entry.text).toContain('地址 和平路 8 号');
    expect(entry.date).toBeUndefined();
    expect(entry.hour).toBeUndefined();
    expect(confirmChatEntry(entry)).toBeUndefined();
  });

  it('attaches form instructions to the separate form deadline', () => {
    const previews = previewChatEvents(JSON.stringify({ events: [
      { kind: 'event', title: '创业实战课', date: '2026-11-20', time: '13:30', preparation: '填写在线表格，统计大巴通勤及晚餐需求' },
      { kind: 'deadline', title: '提交创业实战课准备信息', date: '2026-11-16', time: '12:00', preparation: '' },
    ] }), '周一中午12:00前完成在线表格填写。');
    expect(previews[0].text).toBe('创业实战课');
    expect(previews[1].text).toContain('准备 填写在线表格，统计大巴通勤及晚餐需求');
  });

  it('keeps a period-only entry when the model invents an exact time', () => {
    const source = '2026年11月19日下午去图书馆整理材料。\n2026年11月20日19:30参加创业实战课。';
    const entries = previewChatEvents(JSON.stringify({ events: [
      { kind: 'event', title: '整理材料', date: '2026-11-19', time: '17:00', period: 'afternoon' },
      { kind: 'event', title: '创业实战课', date: '2026-11-20', time: '19:30', period: 'evening' },
    ] }), source);
    expect(entries[0]).toMatchObject({ period: 'afternoon', hour: undefined });
    expect(entries[1]).toMatchObject({ hour: 19, minute: 30 });
  });

  it('recognizes evidence for a spoken time range without assigning an invented end', () => {
    const [entry] = previewChatEvents(JSON.stringify({ events: [
      { kind: 'event', title: '开会', date: '2026-11-19', time: '13:30', end: '17:00', period: 'afternoon' },
    ] }), '11月19日下午一点半到五点开会。');
    expect(entry).toMatchObject({ hour: 13, minute: 30, endTime: '17:00' });
  });

  it('corrects the reported wrong date for tomorrow evening', () => {
    const [entry] = previewChatEvents(JSON.stringify({ events: [
      { kind: 'deadline', title: '交 PPT', date: '2026-11-21', time: '20:00' },
    ] }), '明天晚上8点叫ppt', '2026-11-13');
    expect(entry).toMatchObject({ date: '2026-11-14', hour: 20 });
  });

  it('keeps an explicit date on a separate item in the same batch', () => {
    const entries = previewChatEvents(JSON.stringify({ events: [
      { kind: 'event', title: '交 PPT', date: '2026-11-21', time: '20:00' },
      { kind: 'event', title: '开会', date: '2026-11-20', time: '19:00' },
    ] }), '明天晚上8点交PPT。\n11月20日19:00开会。', '2026-11-13');
    expect(entries.map(entry => entry.date)).toEqual(['2026-11-14', '2026-11-20']);
  });

  it('uses an explicit chat timestamp as the relative date base', () => {
    const [entry] = previewChatEvents(JSON.stringify({ events: [
      { kind: 'event', title: '开会', date: '2026-11-21', time: '20:00' },
    ] }), '2026-12-31 09:15\n明晚8点开会', '2026-11-13');
    expect(entry).toMatchObject({ date: '2027-01-01', hour: 20 });
  });

  it('shows one short task description for a repeated generic deadline', () => {
    const [entry] = previewChatEvents(JSON.stringify({ events: [
      { kind: 'deadline', title: '72 小时期限', date: '2026-11-14', preparation: '72 小时内完成' },
    ] }), '2026/11/11 09:36 72小时内');
    expect(entry.text).toBe('72 小时内完成');
  });

  it('resolves an exact 72-hour deadline from an explicit chat timestamp', () => {
    const [entry] = previewChatEvents(JSON.stringify({ events: [
      { kind: 'deadline', title: '72 小时内完成', date: '', time: '', period: '' },
    ] }), '2026/11/11 09:36 72小时内', '2026-11-13');
    expect(entry).toMatchObject({ date: '2026-11-14', hour: 9, minute: 36, period: 'morning' });
  });

  it('drops analysis and duplicate preparation while retaining concrete task details', () => {
    const [entry] = previewChatEvents(JSON.stringify({ events: [
      { kind: 'event', title: '评审方案', date: '2026-11-14', location: '会议室',
        preparation: '带纸质方案。推理：根据通知推算日期。' },
    ] }), '11月14日到会议室评审方案，带纸质方案。');
    expect(entry.text).toBe('评审方案 · 地点 会议室 · 准备 带纸质方案');
  });
});
